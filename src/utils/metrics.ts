import { logger } from './logger';

// =============================================================================
// IDEMPOTENCY METRICS — Lightweight Observability
//
// In production, replace with Prometheus client (prom-client).
// For now, in-memory counters with periodic logging.
//
// KEY METRICS:
// - redis_hit:  Request served from Redis cache (fastest path, ~0.1ms)
// - db_hit:     Request served from PostgreSQL (medium path, ~2-5ms)
// - miss:       New request, no cached response (full processing)
// - replay:     Cached response replayed to client (redis_hit + db_hit)
// - lock_acquired: Stampede lock obtained (this request will process)
// - lock_rejected: Stampede lock denied (duplicate in-flight request)
// - redis_fallback: Redis unavailable, fell back to DB-only path
// - conflict:   Payload mismatch on key reuse (409 Conflict)
//
// HEALTH INDICATORS:
// - Healthy system: redis_hit / total > 0.85 (85%+ Redis hit rate)
// - Warning:        redis_hit / total < 0.50 (Redis may be unhealthy)
// - Critical:       redis_fallback increasing (Redis is failing)
// =============================================================================

interface MetricCounters {
  redis_hit: number;
  db_hit: number;
  miss: number;
  replay: number;
  lock_acquired: number;
  lock_rejected: number;
  redis_fallback: number;
  conflict: number;
  expired_cleanup: number;
  store_success: number;
  store_failure: number;
}
class IdempotencyMetrics {
  private counters: MetricCounters = {
    redis_hit: 0,
    db_hit: 0,
    miss: 0,
    replay: 0,
    lock_acquired: 0,
    lock_rejected: 0,
    redis_fallback: 0,
    conflict: 0,
    expired_cleanup: 0,
    store_success: 0,
    store_failure: 0
  };
  private startTime = Date.now();
  private logIntervalMs = 60_000; // Log metrics every 60 seconds
  private logTimer: NodeJS.Timeout | null = null;
  constructor() {
    this.startPeriodicLogging();
  }

  /** Increment a specific counter */
  increment(metric: keyof MetricCounters, amount: number = 1): void {
    this.counters[metric] += amount;
  }

  /** Get current counter values */
  getCounters(): Readonly<MetricCounters> {
    return {
      ...this.counters
    };
  }

  /** Calculate hit rate (redis_hit / total lookups) */
  getHitRate(): {
    redisHitRate: number;
    dbHitRate: number;
    missRate: number;
    total: number;
  } {
    const total = this.counters.redis_hit + this.counters.db_hit + this.counters.miss;
    if (total === 0) {
      return {
        redisHitRate: 0,
        dbHitRate: 0,
        missRate: 0,
        total: 0
      };
    }
    return {
      redisHitRate: this.counters.redis_hit / total,
      dbHitRate: this.counters.db_hit / total,
      missRate: this.counters.miss / total,
      total
    };
  }

  /** Get health assessment based on metrics */
  getHealthAssessment(): {
    status: 'healthy' | 'warning' | 'critical';
    details: string;
  } {
    const {
      redisHitRate,
      total
    } = this.getHitRate();

    // Not enough data to assess
    if (total < 10) {
      return {
        status: 'healthy',
        details: 'Insufficient data for assessment'
      };
    }

    // Critical: Redis is failing frequently
    if (this.counters.redis_fallback > total * 0.1) {
      return {
        status: 'critical',
        details: `Redis fallback rate ${(this.counters.redis_fallback / total * 100).toFixed(1)}% — Redis may be down`
      };
    }

    // Warning: Low Redis hit rate
    if (redisHitRate < 0.5) {
      return {
        status: 'warning',
        details: `Redis hit rate ${(redisHitRate * 100).toFixed(1)}% — below 50% threshold`
      };
    }

    // Healthy
    return {
      status: 'healthy',
      details: `Redis hit rate ${(redisHitRate * 100).toFixed(1)}% — system performing well`
    };
  }

  /** Full metrics snapshot for /health or monitoring endpoints */
  getSnapshot() {
    const uptimeMs = Date.now() - this.startTime;
    return {
      counters: this.getCounters(),
      hitRate: this.getHitRate(),
      health: this.getHealthAssessment(),
      uptimeSeconds: Math.floor(uptimeMs / 1000)
    };
  }

  /** Reset all counters (useful for testing or periodic reset) */
  reset(): void {
    for (const key of Object.keys(this.counters) as (keyof MetricCounters)[]) {
      this.counters[key] = 0;
    }
    this.startTime = Date.now();
  }

  /** Start periodic metric logging */
  private startPeriodicLogging(): void {
    this.logTimer = setInterval(() => {
      const snapshot = this.getSnapshot();
      const {
        total,
        redisHitRate
      } = snapshot.hitRate;

      // Only log if there's activity
      if (total > 0) {
        logger.info('Idempotency metrics snapshot', {
          event: 'IDEMPOTENCY_METRICS',
          ...snapshot.counters,
          redisHitRate: `${(redisHitRate * 100).toFixed(1)}%`,
          totalRequests: total,
          healthStatus: snapshot.health.status,
          uptimeSeconds: snapshot.uptimeSeconds
        });
      }
    }, this.logIntervalMs);

    // Don't prevent process exit
    if (this.logTimer.unref) {
      this.logTimer.unref();
    }
  }

  /** Stop periodic logging (for graceful shutdown) */
  shutdown(): void {
    if (this.logTimer) {
      clearInterval(this.logTimer);
      this.logTimer = null;
    }
  }
}

// Singleton instance
export const idempotencyMetrics = new IdempotencyMetrics();