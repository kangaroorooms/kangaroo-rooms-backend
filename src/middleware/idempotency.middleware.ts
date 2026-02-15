import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashRequestBody, isValidUUID } from '../utils/hash';
import { safeRedisExecute, isRedisAvailable } from '../utils/redis';
import { idempotencyMetrics } from '../utils/metrics';
import logger from '../utils/logger';
import { getPrismaClient } from '../utils/prisma';

// FIX: Initialize prisma client — was imported but never called.
// Every prisma.idempotencyRecord.* call was throwing ReferenceError.
// Matches pattern used in OutboxWorker.ts and NotificationService.ts.
const prisma = getPrismaClient();

// =============================================================================
// HYBRID IDEMPOTENCY MIDDLEWARE — Principal Engineer Grade
//
// ARCHITECTURE: Redis (L1) → PostgreSQL (L2) → Process Request
//
// Flow for every mutating request:
//
//   ┌─────────┐     ┌───────────────┐     ┌──────────────┐     ┌─────────────┐
//   │ Request │────▶│ Local L0 Cache │────▶│ Redis (L1)   │────▶│ Postgres(L2)│
//   └─────────┘     │ (hot key prot) │     │ ~0.1ms       │     │ ~2-5ms      │
//                   └───────────────┘     └──────────────┘     └─────────────┘
//                          │                     │                     │
//                        HIT?                  HIT?                  HIT?
//                       ╱    ╲                ╱    ╲                ╱    ╲
//                     YES    NO             YES    NO             YES    NO
//                      │      │              │      │              │      │
//                   REPLAY  NEXT          REPLAY  NEXT          REPLAY  PROCESS
//                                                  │              ▲      │
//                                                  │              │      │
//                                                  └──────────────┘      │
//                                                   (hydrate Redis)      │
//                                                                        │
//                                            ┌───────────────────────────┘
//                                            │
//                                            ▼
//                                    ┌──────────────┐
//                                    │ SETNX Lock   │
//                                    │ (stampede     │
//                                    │  prevention)  │
//                                    └──────────────┘
//                                         │
//                                       GOT LOCK?
//                                      ╱        ╲
//                                    YES         NO
//                                     │           │
//                                  PROCESS    429 RETRY
//                                     │
//                                     ▼
//                              ┌──────────────┐
//                              │ Store result  │
//                              │ Redis + DB    │
//                              └──────────────┘
//
// WHY THIS PATTERN IS OPTIMAL:
// 1. Redis serves 95%+ of retries at sub-millisecond latency
// 2. DB is source of truth — survives Redis restarts/evictions
// 3. Hydration on DB-hit prevents future DB queries for same key
// 4. Circuit breaker ensures Redis failures never block bookings
// 5. SETNX lock prevents stampede without distributed lock complexity
// 6. Local cache absorbs hot-key bursts before they hit Redis
//
// =============================================================================

// Extend Express Request to carry idempotency context
declare global {
  namespace Express {
    interface Request {
      idempotencyKey?: string;
      idempotencyHash?: string;
    }
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * TTL STRATEGY — Why Redis TTL < DB TTL:
 *
 * Redis TTL: 2 hours
 * - Most retries happen within seconds to minutes (network timeouts, UI double-clicks)
 * - Payment webhooks (Razorpay) arrive within 30 minutes typically
 * - 2 hours covers: immediate retries + webhook processing + generous buffer
 * - After 2h, key evicts from Redis → rare late retries fall to DB
 * - Keeps Redis memory lean (only hot/recent keys)
 *
 * DB TTL: 24 hours
 * - Covers overnight retries (user closes laptop, reopens next morning)
 * - Covers full business day cycle
 * - Matches Stripe's proven 24h window
 * - At 10K bookings/day: ~10K records (trivial for PostgreSQL)
 *
 * Retry pattern alignment:
 * - Client retry (exponential backoff): 1s, 2s, 4s, 8s, 16s → all within Redis TTL
 * - User manual retry: minutes to hours → within Redis TTL
 * - Overnight retry: 8-16 hours → within DB TTL
 * - Next-day retry: >24h → expired, treated as new request
 */
const REDIS_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const DB_TTL_HOURS = 24; // 24 hours

/**
 * STAMPEDE LOCK — Prevents duplicate processing of concurrent identical requests.
 *
 * Lock TTL: 30 seconds
 * - Booking creation takes 50-500ms typically
 * - 30s covers: slow DB, payment gateway latency, network hiccups
 * - If lock holder crashes, lock auto-expires → no permanent deadlock
 * - Short enough that legitimate retries after 30s can proceed
 */
const LOCK_TTL_SECONDS = 30;

/**
 * LOCAL CACHE (L0) — Hot Key Protection
 *
 * Problem: If one idempotency key is hammered by retries (e.g., aggressive
 * client retry loop), every retry hits Redis on the same node. With Redis
 * Cluster, all requests for the same key route to the same shard → hotspot.
 *
 * Solution: Tiny in-memory LRU cache (L0) with very short TTL.
 * - Capacity: 200 entries (covers concurrent hot keys)
 * - TTL: 5 seconds (just absorbs burst, doesn't serve stale data long)
 * - On hit: return cached response instantly (no Redis, no DB)
 * - On miss: proceed to Redis → DB → process
 *
 * Why 5 seconds: Aggressive retries fire every 1-2s. A 5s cache absorbs
 * 3-5 retries per key without any network call. After 5s, fresh data
 * is fetched from Redis (which itself has the latest from DB).
 */
const LOCAL_CACHE_MAX_SIZE = 200;
const LOCAL_CACHE_TTL_MS = 5_000;

// =============================================================================
// LOCAL IN-MEMORY CACHE (L0) — Hot Key Protection
// =============================================================================

interface LocalCacheEntry {
  statusCode: number;
  responseBody: any;
  requestHash: string;
  userId: string;
  cachedAt: number;
}
class LocalLRUCache {
  private cache = new Map<string, LocalCacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }
  get(key: string): LocalCacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // LRU: move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }
  set(key: string, entry: Omit<LocalCacheEntry, 'cachedAt'>): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      ...entry,
      cachedAt: Date.now()
    });
  }
  delete(key: string): void {
    this.cache.delete(key);
  }
  get size(): number {
    return this.cache.size;
  }
}
const localCache = new LocalLRUCache(LOCAL_CACHE_MAX_SIZE, LOCAL_CACHE_TTL_MS);

// =============================================================================
// REDIS KEY HELPERS
// =============================================================================

/** Cache key for stored idempotency response */
function redisKey(idempotencyKey: string): string {
  return `idem:resp:${idempotencyKey}`;
}

/** Lock key for stampede prevention */
function lockKey(idempotencyKey: string): string {
  return `idem:lock:${idempotencyKey}`;
}

// =============================================================================
// REDIS SERIALIZATION
// =============================================================================

/**
 * FULL HTTP RESPONSE SERIALIZATION
 *
 * We store the COMPLETE response in Redis, not just the body.
 *
 * WHY storing partial response is DANGEROUS:
 *
 * 1. Status code mismatch: Client gets 200 OK but the original was 201 Created.
 *    REST clients that check status codes will behave differently.
 *    Mobile apps may show "created" vs "already exists" based on status.
 *
 * 2. Missing headers: Content-Type tells the client how to parse the body.
 *    If we replay body without Content-Type: application/json, some clients
 *    will treat it as text/plain → JSON.parse fails → client crash.
 *
 * 3. Body truncation: If we only store a "success" flag, the client loses
 *    the booking ID, room details, confirmation number. The user sees
 *    "booking successful" but has no reference number → support ticket.
 *
 * 4. Idempotency contract violation: RFC draft-ietf-httpapi-idempotency-key
 *    specifies that replayed responses MUST be identical to the original.
 *    Partial replay breaks this contract and makes debugging impossible.
 *
 * Storage format in Redis:
 * {
 *   "statusCode": 201,
 *   "headers": { "content-type": "application/json" },
 *   "body": { "success": true, "data": { "id": "...", ... } },
 *   "requestHash": "sha256...",
 *   "userId": "uuid...",
 *   "createdAt": "2026-02-07T..."
 * }
 */
interface SerializedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  requestHash: string;
  userId: string;
  createdAt: string;
}
function serializeResponse(statusCode: number, body: any, requestHash: string, userId: string): string {
  const serialized: SerializedResponse = {
    statusCode,
    headers: {
      'content-type': 'application/json'
    },
    body,
    requestHash,
    userId,
    createdAt: new Date().toISOString()
  };
  return JSON.stringify(serialized);
}
function deserializeResponse(data: string): SerializedResponse | null {
  try {
    return JSON.parse(data) as SerializedResponse;
  } catch {
    return null;
  }
}

// =============================================================================
// MAIN MIDDLEWARE
// =============================================================================

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // ── Step 1: Validate header presence and format ──
    if (!idempotencyKey) {
      logger.warn('Idempotency: Missing Idempotency-Key header', {
        event: 'IDEMPOTENCY_MISSING_KEY',
        userId: (req as any).user?.userId,
        endpoint: req.originalUrl,
        method: req.method
      });
      res.status(400).json({
        success: false,
        message: 'Idempotency-Key header is required for booking creation. Send a UUID v4.',
        error: 'MISSING_IDEMPOTENCY_KEY'
      });
      return;
    }
    if (!isValidUUID(idempotencyKey)) {
      logger.warn('Idempotency: Invalid key format', {
        event: 'IDEMPOTENCY_INVALID_KEY',
        userId: (req as any).user?.userId,
        keyPrefix: idempotencyKey.substring(0, 8)
      });
      res.status(400).json({
        success: false,
        message: 'Idempotency-Key must be a valid UUID v4.',
        error: 'INVALID_IDEMPOTENCY_KEY'
      });
      return;
    }
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
      return;
    }

    // ── Step 2: Hash request body ──
    const requestHash = hashRequestBody(req.body);
    const keyPrefix = idempotencyKey.substring(0, 8) + '...';
    logger.info('Idempotency: Processing request', {
      event: 'IDEMPOTENCY_KEY_RECEIVED',
      userId,
      keyPrefix,
      endpoint: req.originalUrl,
      redisAvailable: isRedisAvailable()
    });
    try {
      // ════════════════════════════════════════════════════════════════════
      // LAYER 0: LOCAL IN-MEMORY CACHE (Hot Key Protection)
      // ════════════════════════════════════════════════════════════════════
      const localEntry = localCache.get(idempotencyKey);
      if (localEntry) {
        if (localEntry.userId !== userId) {
          res.status(403).json({
            success: false,
            message: 'This idempotency key belongs to a different user.',
            error: 'IDEMPOTENCY_KEY_OWNERSHIP'
          });
          return;
        }
        if (localEntry.requestHash !== requestHash) {
          idempotencyMetrics.increment('conflict');
          res.status(409).json({
            success: false,
            message: 'Idempotency key has already been used with a different request payload.',
            error: 'IDEMPOTENCY_PAYLOAD_MISMATCH'
          });
          return;
        }

        // L0 HIT — replay from memory (sub-microsecond)
        logger.info('Idempotency: L0 local cache hit', {
          event: 'IDEMPOTENCY_L0_HIT',
          userId,
          keyPrefix
        });
        idempotencyMetrics.increment('redis_hit'); // Count as cache hit
        idempotencyMetrics.increment('replay');
        res.status(localEntry.statusCode).json(localEntry.responseBody);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // LAYER 1: REDIS LOOKUP
      // ════════════════════════════════════════════════════════════════════
      const redisResult = await safeRedisExecute((client) => client.get(redisKey(idempotencyKey)), 'idempotency_get');
      if (redisResult) {
        const cached = deserializeResponse(redisResult);
        if (cached) {
          // Validate ownership
          if (cached.userId !== userId) {
            res.status(403).json({
              success: false,
              message: 'This idempotency key belongs to a different user.',
              error: 'IDEMPOTENCY_KEY_OWNERSHIP'
            });
            return;
          }

          // Validate payload hash
          if (cached.requestHash !== requestHash) {
            idempotencyMetrics.increment('conflict');
            logger.warn('Idempotency: Payload mismatch (Redis)', {
              event: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              userId,
              keyPrefix
            });
            res.status(409).json({
              success: false,
              message: 'Idempotency key has already been used with a different request payload.',
              error: 'IDEMPOTENCY_PAYLOAD_MISMATCH'
            });
            return;
          }

          // REDIS HIT — replay cached response
          logger.info('Idempotency: Redis L1 hit — replaying', {
            event: 'IDEMPOTENCY_REDIS_HIT',
            userId,
            keyPrefix,
            originalStatusCode: cached.statusCode
          });
          idempotencyMetrics.increment('redis_hit');
          idempotencyMetrics.increment('replay');

          // Populate L0 for hot key protection
          localCache.set(idempotencyKey, {
            statusCode: cached.statusCode,
            responseBody: cached.body,
            requestHash: cached.requestHash,
            userId: cached.userId
          });

          // Replay with full fidelity
          for (const [header, value] of Object.entries(cached.headers)) {
            res.setHeader(header, value);
          }
          res.status(cached.statusCode).json(cached.body);
          return;
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // LAYER 2: DATABASE LOOKUP
      // ════════════════════════════════════════════════════════════════════
      const existingRecord = await prisma.idempotencyRecord.findUnique({
        where: {
          key: idempotencyKey
        }
      });
      if (existingRecord) {
        // Check if expired
        if (existingRecord.expiresAt < new Date()) {
          logger.info('Idempotency: Expired key in DB, proceeding as new', {
            event: 'IDEMPOTENCY_KEY_EXPIRED',
            userId,
            keyPrefix
          });
          await prisma.idempotencyRecord.delete({
            where: {
              key: idempotencyKey
            }
          });
          // Fall through to "new request" path
        }
        // Validate ownership
        else if (existingRecord.userId !== userId) {
          logger.warn('Idempotency: Cross-user key reuse attempt', {
            event: 'IDEMPOTENCY_CROSS_USER',
            requestingUserId: userId,
            keyPrefix
          });
          res.status(403).json({
            success: false,
            message: 'This idempotency key belongs to a different user.',
            error: 'IDEMPOTENCY_KEY_OWNERSHIP'
          });
          return;
        }
        // Validate payload hash
        else if (existingRecord.requestHash !== requestHash) {
          idempotencyMetrics.increment('conflict');
          logger.warn('Idempotency: Payload mismatch (DB)', {
            event: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            userId,
            keyPrefix
          });
          res.status(409).json({
            success: false,
            message: 'Idempotency key has already been used with a different request payload.',
            error: 'IDEMPOTENCY_PAYLOAD_MISMATCH'
          });
          return;
        }
        // DB HIT — replay AND hydrate Redis
        else {
          logger.info('Idempotency: DB L2 hit — replaying + hydrating Redis', {
            event: 'IDEMPOTENCY_DB_HIT',
            userId,
            keyPrefix,
            originalStatusCode: existingRecord.statusCode
          });
          idempotencyMetrics.increment('db_hit');
          idempotencyMetrics.increment('replay');

          // HYDRATE REDIS — so next retry hits L1 instead of L2
          // This is fire-and-forget; if it fails, next retry just hits DB again
          const serialized = serializeResponse(existingRecord.statusCode, existingRecord.responseBody, existingRecord.requestHash, existingRecord.userId);
          safeRedisExecute((client) => client.setex(redisKey(idempotencyKey), REDIS_TTL_SECONDS, serialized), 'idempotency_hydrate').catch(() => {


            // Swallow — hydration is best-effort
          }); // Populate L0
          localCache.set(idempotencyKey, { statusCode: existingRecord.statusCode,
              responseBody: existingRecord.responseBody,
              requestHash: existingRecord.requestHash,
              userId: existingRecord.userId
            });
          res.status(existingRecord.statusCode).json(existingRecord.responseBody);
          return;
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // NO CACHE HIT — NEW REQUEST
      // ════════════════════════════════════════════════════════════════════

      idempotencyMetrics.increment('miss');

      // ── STAMPEDE PREVENTION via SETNX ──
      //
      // Problem: 20 identical requests arrive simultaneously. All miss cache.
      // Without locking, all 20 hit the booking service → 19 fail on unique
      // constraint, but they still consumed DB connections, CPU, and time.
      //
      // Solution: SETNX (SET if Not eXists) as a distributed lock.
      // - First request: SETNX succeeds → acquires lock → processes booking
      // - Requests 2-20: SETNX fails → lock exists → return 409 "processing"
      //
      // TRADEOFFS vs Redlock:
      // ┌─────────────┬──────────────────────────────────────────────────────┐
      // │ SETNX       │ Simple, single Redis instance, ~0.1ms               │
      // │             │ Safe for single-master Redis (our current setup)     │
      // │             │ Risk: if Redis master fails during lock, lock lost   │
      // │             │ Mitigation: DB unique constraint is final defense    │
      // ├─────────────┼──────────────────────────────────────────────────────┤
      // │ Redlock     │ Multi-master consensus, survives Redis failover      │
      // │             │ Requires 3+ independent Redis instances              │
      // │             │ ~5ms latency (quorum round-trips)                    │
      // │             │ Complex: clock drift, partial failures, retry logic  │
      // │             │ Overkill for single-region, single-master setup      │
      // └─────────────┴──────────────────────────────────────────────────────┘
      //
      // Decision: SETNX for now. Upgrade to Redlock when we go multi-region
      // or add Redis Sentinel/Cluster. The booking's own unique constraint
      // (roomId + tenantEmail + moveInDate) is the ultimate safety net.

      let lockAcquired = false;
      if (isRedisAvailable()) {
        const lockResult = await safeRedisExecute((client) => client.set(lockKey(idempotencyKey), userId, 'EX', LOCK_TTL_SECONDS, 'NX'), 'idempotency_lock');
        if (lockResult === 'OK') {
          lockAcquired = true;
          idempotencyMetrics.increment('lock_acquired');
          logger.info('Idempotency: Stampede lock acquired', {
            event: 'IDEMPOTENCY_LOCK_ACQUIRED',
            userId,
            keyPrefix,
            lockTtlSeconds: LOCK_TTL_SECONDS
          });
        } else if (lockResult === null && isRedisAvailable()) {
          // Redis available but SETNX returned null → another request holds the lock
          // This means an identical request is currently being processed
          idempotencyMetrics.increment('lock_rejected');
          logger.info('Idempotency: Stampede lock rejected — duplicate in flight', {
            event: 'IDEMPOTENCY_LOCK_REJECTED',
            userId,
            keyPrefix
          });
          res.status(409).json({
            success: false,
            message: 'This request is already being processed. Please retry in a few seconds.',
            error: 'IDEMPOTENCY_REQUEST_IN_FLIGHT',
            retryAfterSeconds: 2
          });
          return;
        } else {
          // Redis unavailable — proceed without lock (DB constraint is backup)
          idempotencyMetrics.increment('redis_fallback');
          logger.warn('Idempotency: Redis unavailable for locking, proceeding without', {
            event: 'IDEMPOTENCY_LOCK_FALLBACK',
            userId,
            keyPrefix
          });
        }
      } else {
        idempotencyMetrics.increment('redis_fallback');
        logger.info('Idempotency: Redis unavailable, DB-only mode', {
          event: 'IDEMPOTENCY_REDIS_UNAVAILABLE',
          userId,
          keyPrefix
        });
      }

      // ── Attach context and intercept response ──
      req.idempotencyKey = idempotencyKey;
      req.idempotencyHash = requestHash;
      const originalJson = res.json.bind(res);
      let responseCaptured = false;
      res.json = function (body: any): Response {
        if (!responseCaptured && req.idempotencyKey) {
          responseCaptured = true;
          const statusCode = res.statusCode;

          // Store successful responses (< 500) in both Redis and DB
          if (statusCode < 500) {
            storeIdempotencyResult(idempotencyKey, userId, requestHash, body, statusCode, lockAcquired).catch((err) => {
              logger.error('Idempotency: Failed to store result', {
                event: 'IDEMPOTENCY_STORE_FAILED',
                userId,
                keyPrefix,
                error: err.message
              });
              idempotencyMetrics.increment('store_failure');
            });
          }

          // Release stampede lock (if we acquired it)
          if (lockAcquired) {
            safeRedisExecute((client) => client.del(lockKey(idempotencyKey)), 'idempotency_unlock').catch(() => {


              // Lock will auto-expire via TTL — this is just cleanup
            });}
        }
        return originalJson(body);
      };
      next();
    } catch (error: any) {
      logger.error('Idempotency: Middleware error — degrading gracefully', {
        event: 'IDEMPOTENCY_MIDDLEWARE_ERROR',
        userId,
        keyPrefix: idempotencyKey.substring(0, 8) + '...',
        error: error.message,
        stack: error.stack
      });
      // CRITICAL: Never block a booking due to idempotency infrastructure failure.
      // The booking's own unique constraints still protect against duplicates.
      // This is defense-in-depth: idempotency is an optimization layer,
      // not the sole correctness mechanism.
      next();
    }
  };
}

// =============================================================================
// STORE RESULT — Dual-write to Redis + DB
// =============================================================================

/**
 * Stores the idempotency result in BOTH Redis and PostgreSQL.
 *
 * Write order: Redis first, then DB.
 * Why: Redis write is faster (~0.1ms). If DB write fails, Redis still serves
 * retries for 2 hours. The next cleanup cycle or TTL expiry handles orphans.
 *
 * If Redis write fails: DB write still proceeds. Next retry hits DB → hydrates Redis.
 * If DB write fails (P2002): Another request already stored → race condition resolved.
 * If both fail: Booking already succeeded (response already sent to client).
 *   Next retry with same key will miss cache → hit booking unique constraint → 409.
 */
async function storeIdempotencyResult(key: string, userId: string, requestHash: string, responseBody: any, statusCode: number, lockAcquired: boolean): Promise<void> {
  const keyPrefix = key.substring(0, 8) + '...';

  // ── Write to Redis (L1) ──
  const serialized = serializeResponse(statusCode, responseBody, requestHash, userId);
  await safeRedisExecute((client) => client.setex(redisKey(key), REDIS_TTL_SECONDS, serialized), 'idempotency_store_redis');

  // ── Populate L0 cache ──
  localCache.set(key, {
    statusCode,
    responseBody,
    requestHash,
    userId
  });

  // ── Write to DB (L2) — Source of truth ──
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DB_TTL_HOURS);
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key,
        userId,
        requestHash,
        responseBody,
        statusCode,
        expiresAt
      }
    });
    idempotencyMetrics.increment('store_success');
    logger.info('Idempotency: Result stored (Redis + DB)', {
      event: 'IDEMPOTENCY_STORED',
      userId,
      keyPrefix,
      statusCode,
      redisTtlSeconds: REDIS_TTL_SECONDS,
      dbExpiresAt: expiresAt.toISOString()
    });
  } catch (error: any) {
    // P2002 = unique constraint violation → race condition resolved
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info('Idempotency: Race condition resolved — DB record exists', {
        event: 'IDEMPOTENCY_RACE_RESOLVED',
        userId,
        keyPrefix
      });
      idempotencyMetrics.increment('store_success');
      return;
    }
    idempotencyMetrics.increment('store_failure');
    throw error;
  }
}

// =============================================================================
// TTL CLEANUP — Dual cleanup for Redis + DB
// =============================================================================

/**
 * Cleanup expired idempotency records from PostgreSQL.
 * Redis keys auto-expire via TTL — no cleanup needed.
 *
 * Call from scheduled job (e.g., setInterval every hour).
 * Uses the expiresAt B-tree index for O(log n) range scan.
 */
export async function cleanupExpiredIdempotencyRecords(): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });
  if (result.count > 0) {
    idempotencyMetrics.increment('expired_cleanup', result.count);
    logger.info('Idempotency: Cleaned up expired DB records', {
      event: 'IDEMPOTENCY_CLEANUP',
      deletedCount: result.count
    });
  }
  return result.count;
}

// =============================================================================
// METRICS EXPORT — For /health endpoint
// =============================================================================

export function getIdempotencyMetrics() {
  return idempotencyMetrics.getSnapshot();
}