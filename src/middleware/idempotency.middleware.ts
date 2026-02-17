import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashRequestBody, isValidUUID } from '../utils/hash';
import { idempotencyMetrics } from '../utils/metrics';
import logger from '../utils/logger';
import { getPrismaClient } from '../utils/prisma';

// FIX: Initialize prisma client — was imported but never called.
// Every prisma.idempotencyRecord.* call was throwing ReferenceError.
// Matches pattern used in OutboxWorker.ts and NotificationService.ts.
const prisma = getPrismaClient();

// =============================================================================
// IDEMPOTENCY MIDDLEWARE — DB-Only Mode (Redis Removed)
//
// ARCHITECTURE: Local Cache (L0) → PostgreSQL (L1) → Process Request
//
// Flow for every mutating request:
//
//   ┌─────────┐     ┌───────────────┐     ┌──────────────┐
//   │ Request │────▶│ Local L0 Cache │────▶│ Postgres(L1) │
//   └─────────┘     │ (hot key prot) │     │ ~2-5ms       │
//                   └───────────────┘     └──────────────┘
//                          │                     │
//                        HIT?                  HIT?
//                       ╱    ╲                ╱    ╲
//                     YES    NO             YES    NO
//                      │      │              │      │
//                   REPLAY  NEXT          REPLAY  PROCESS
//                                                    │
//                                            ┌───────┘
//                                            ▼
//                                    ┌──────────────┐
//                                    │ Store result  │
//                                    │ L0 + DB      │
//                                    └──────────────┘
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

const DB_TTL_HOURS = 24; // 24 hours

/**
 * LOCAL CACHE (L0) — Hot Key Protection
 *
 * Tiny in-memory LRU cache with very short TTL.
 * - Capacity: 200 entries (covers concurrent hot keys)
 * - TTL: 5 seconds (just absorbs burst, doesn't serve stale data long)
 * - On hit: return cached response instantly (no DB)
 * - On miss: proceed to DB → process
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
// MAIN MIDDLEWARE
// =============================================================================

export function idempotencyMiddleware() {
  return async (
  req: Request,
  res: Response,
  next: NextFunction)
  : Promise<void> => {
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
        message:
        'Idempotency-Key header is required for booking creation. Send a UUID v4.',
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
      endpoint: req.originalUrl
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
            message:
            'Idempotency key has already been used with a different request payload.',
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
        idempotencyMetrics.increment('cache_hit');
        idempotencyMetrics.increment('replay');
        res.status(localEntry.statusCode).json(localEntry.responseBody);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // LAYER 1: DATABASE LOOKUP
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
            message:
            'Idempotency key has already been used with a different request payload.',
            error: 'IDEMPOTENCY_PAYLOAD_MISMATCH'
          });
          return;
        }
        // DB HIT — replay
        else {
          logger.info('Idempotency: DB hit — replaying', {
            event: 'IDEMPOTENCY_DB_HIT',
            userId,
            keyPrefix,
            originalStatusCode: existingRecord.statusCode
          });
          idempotencyMetrics.increment('db_hit');
          idempotencyMetrics.increment('replay');

          // Populate L0 for hot key protection
          localCache.set(idempotencyKey, {
            statusCode: existingRecord.statusCode,
            responseBody: existingRecord.responseBody,
            requestHash: existingRecord.requestHash,
            userId: existingRecord.userId
          });
          res.
          status(existingRecord.statusCode).
          json(existingRecord.responseBody);
          return;
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // NO CACHE HIT — NEW REQUEST
      // ════════════════════════════════════════════════════════════════════

      idempotencyMetrics.increment('miss');

      // ── Attach context and intercept response ──
      req.idempotencyKey = idempotencyKey;
      req.idempotencyHash = requestHash;
      const originalJson = res.json.bind(res);
      let responseCaptured = false;
      res.json = function (body: any): Response {
        if (!responseCaptured && req.idempotencyKey) {
          responseCaptured = true;
          const statusCode = res.statusCode;

          // Store successful responses (< 500) in DB
          if (statusCode < 500) {
            storeIdempotencyResult(
              idempotencyKey,
              userId,
              requestHash,
              body,
              statusCode
            ).catch((err) => {
              logger.error('Idempotency: Failed to store result', {
                event: 'IDEMPOTENCY_STORE_FAILED',
                userId,
                keyPrefix,
                error: err.message
              });
              idempotencyMetrics.increment('store_failure');
            });
          }
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
      next();
    }
  };
}

// =============================================================================
// STORE RESULT — Write to L0 cache + DB
// =============================================================================

async function storeIdempotencyResult(
key: string,
userId: string,
requestHash: string,
responseBody: any,
statusCode: number)
: Promise<void> {
  const keyPrefix = key.substring(0, 8) + '...';

  // ── Populate L0 cache ──
  localCache.set(key, {
    statusCode,
    responseBody,
    requestHash,
    userId
  });

  // ── Write to DB — Source of truth ──
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
    logger.info('Idempotency: Result stored (DB)', {
      event: 'IDEMPOTENCY_STORED',
      userId,
      keyPrefix,
      statusCode,
      dbExpiresAt: expiresAt.toISOString()
    });
  } catch (error: any) {
    // P2002 = unique constraint violation → race condition resolved
    if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002')
    {
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
// TTL CLEANUP
// =============================================================================

/**
 * Cleanup expired idempotency records from PostgreSQL.
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

export function getIdempotencyMetrics(): any {
  return idempotencyMetrics.getSnapshot();
}