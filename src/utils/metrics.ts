import { logger } from './logger';

// =============================================================================
// IDEMPOTENCY METRICS — Lightweight Observability
//
// In production, replace with Prometheus client (prom-client).
// For now, in-memory counters with periodic logging.
//
// KEY METRICS:
// - cache_hit: Request served from local in-memory cache (fastest path)
// - db_hit:    Request served from PostgreSQL (~2-5ms)
// - miss:      New request, no cached response (full processing)
// - replay:    Cached response replayed to client (cache_hit + db_hit)
// - conflict:  Payload mismatch on key reuse (409 Conflict)
//
// HEALTH INDICATORS:
// - Healthy system: low miss rate relative to total
// - Warning:        high store_failure count
// - Critical:       store_failure increasing rapidly
// =============================================================================

interface MetricCounters {
  cache_hit: number;
  db_hit: number;
  miss: number;
  replay: number;
  conflict: number;
  expired_cleanup: number;
  store_success: number;
  store_failure: number;
}
class IdempotencyMetrics {
  private counters: MetricCounters = {
    cache_hit: 0,
    db_hit: 0,
    miss: 0,
    replay: 0,
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

  /** Calculate hit rate */
  getHitRate(): {
    cacheHitRate: number;
    dbHitRate: number;
    missRate: number;
    total: number;
  } {
    const total =
    this.counters.cache_hit + this.counters.db_hit + this.counters.miss;
    if (total === 0) {
      return {
        cacheHitRate: 0,
        dbHitRate: 0,
        missRate: 0,
        total: 0
      };
    }
    return {
      cacheHitRate: this.counters.cache_hit / total,
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
    const { total } = this.getHitRate();

    // Not enough data to assess
    if (total < 10) {
      return {
        status: 'healthy',
        details: 'Insufficient data for assessment'
      };
    }

    // Critical: Store failures are high
    if (this.counters.store_failure > total * 0.1) {
      return {
        status: 'critical',
        details: `Store failure rate ${(this.counters.store_failure / total * 100).toFixed(1)}% — DB writes may be failing`
      };
    }

    // Healthy
    return {
      status: 'healthy',
      details: `System performing well — ${total} total requests processed`
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
      const { total, cacheHitRate } = snapshot.hitRate;

      // Only log if there's activity
      if (total > 0) {
        logger.info('Idempotency metrics snapshot', {
          event: 'IDEMPOTENCY_METRICS',
          ...snapshot.counters,
          cacheHitRate: `${(cacheHitRate * 100).toFixed(1)}%`,
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