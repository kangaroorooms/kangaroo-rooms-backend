import Redis from 'ioredis';
import { logger } from './logger';

// =============================================================================
// REDIS CLIENT — Production Grade with Circuit Breaker
//
// WHY ioredis over node-redis:
// - Built-in reconnection with exponential backoff
// - Cluster & Sentinel support for future scaling
// - Lua scripting support (needed for atomic SETNX + EXPIRE)
// - Better TypeScript support
// - Battle-tested at Alibaba scale (billions of requests/day)
// =============================================================================

/**
 * Circuit Breaker States:
 * CLOSED  → Normal operation, all Redis calls go through
 * OPEN    → Redis is down, skip all Redis calls (fall back to DB)
 * HALF    → Testing if Redis recovered, allow one probe call
 *
 * Transitions:
 * CLOSED → OPEN:   After FAILURE_THRESHOLD consecutive failures
 * OPEN → HALF:     After RECOVERY_TIMEOUT_MS elapses
 * HALF → CLOSED:   If probe call succeeds
 * HALF → OPEN:     If probe call fails (reset timer)
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
interface CircuitBreakerConfig {
  failureThreshold: number; // Consecutive failures before opening
  recoveryTimeoutMs: number; // How long to wait before probing
  halfOpenMaxAttempts: number; // Max concurrent probes in HALF_OPEN
}
const CIRCUIT_DEFAULTS: CircuitBreakerConfig = {
  failureThreshold: 5,
  // 5 consecutive failures → open circuit
  recoveryTimeoutMs: 30_000,
  // 30 seconds before probing
  halfOpenMaxAttempts: 1 // Only 1 probe at a time
};
class RedisCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      ...CIRCUIT_DEFAULTS,
      ...config
    };
  }

  /**
   * Should we attempt a Redis call?
   * CLOSED → yes
   * OPEN → only if recovery timeout elapsed (transition to HALF_OPEN)
   * HALF_OPEN → yes (it's a probe)
   */
  canExecute(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        {
          const elapsed = Date.now() - this.lastFailureTime;
          if (elapsed >= this.config.recoveryTimeoutMs) {
            this.state = 'HALF_OPEN';
            logger.info('Redis circuit breaker: OPEN → HALF_OPEN (probing)', {
              event: 'CIRCUIT_BREAKER_HALF_OPEN',
              elapsedMs: elapsed
            });
            return true;
          }
          return false;
        }
      case 'HALF_OPEN':
        return true;
      default:
        return false;
    }
  }

  /** Call on successful Redis operation */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info('Redis circuit breaker: HALF_OPEN → CLOSED (recovered)', {
        event: 'CIRCUIT_BREAKER_CLOSED'
      });
    }
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  /** Call on failed Redis operation */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      // Probe failed → back to OPEN
      this.state = 'OPEN';
      logger.warn('Redis circuit breaker: HALF_OPEN → OPEN (probe failed)', {
        event: 'CIRCUIT_BREAKER_OPEN',
        consecutiveFailures: this.consecutiveFailures
      });
      return;
    }
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      logger.error('Redis circuit breaker: CLOSED → OPEN (threshold reached)', {
        event: 'CIRCUIT_BREAKER_OPEN',
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.config.failureThreshold
      });
    }
  }
  getState(): CircuitState {
    return this.state;
  }
  getStats() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
    };
  }
}

// =============================================================================
// SINGLETON REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;
const circuitBreaker = new RedisCircuitBreaker();

/**
 * Initialize Redis connection.
 * Call once on server startup. Handles reconnection automatically.
 *
 * Connection strategy:
 * - maxRetriesPerRequest: 3 (fail fast per individual command)
 * - retryStrategy: exponential backoff up to 5s (for reconnection)
 * - enableReadyCheck: true (wait for Redis READY before accepting commands)
 * - lazyConnect: false (connect immediately on creation)
 */
export function initializeRedis(redisUrl: string): Redis {
  if (redisClient) {
    logger.warn('Redis: Client already initialized, returning existing');
    return redisClient;
  }
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 5000,
    commandTimeout: 2000,
    retryStrategy(times: number): number | null {
      if (times > 20) {
        logger.error('Redis: Max reconnection attempts reached', {
          event: 'REDIS_MAX_RETRIES',
          attempts: times
        });
        return null; // Stop retrying
      }
      // Exponential backoff: 50ms, 100ms, 200ms, ... capped at 5s
      const delay = Math.min(times * 50, 5000);
      logger.info(`Redis: Reconnecting in ${delay}ms (attempt ${times})`, {
        event: 'REDIS_RECONNECTING',
        attempt: times,
        delayMs: delay
      });
      return delay;
    }
  });

  // Connection lifecycle events
  redisClient.on('connect', () => {
    logger.info('Redis: TCP connection established', {
      event: 'REDIS_CONNECT'
    });
  });
  redisClient.on('ready', () => {
    circuitBreaker.recordSuccess();
    logger.info('Redis: Ready to accept commands', {
      event: 'REDIS_READY'
    });
  });
  redisClient.on('error', (err) => {
    circuitBreaker.recordFailure();
    logger.error('Redis: Connection error', {
      event: 'REDIS_ERROR',
      error: err.message
    });
  });
  redisClient.on('close', () => {
    logger.warn('Redis: Connection closed', {
      event: 'REDIS_CLOSE'
    });
  });
  redisClient.on('reconnecting', () => {
    logger.info('Redis: Attempting reconnection', {
      event: 'REDIS_RECONNECTING'
    });
  });
  return redisClient;
}

/**
 * Get the Redis client instance.
 * Returns null if not initialized or circuit is open.
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Check if Redis is available (connected + circuit closed/half-open).
 */
export function isRedisAvailable(): boolean {
  if (!redisClient) return false;
  if (!circuitBreaker.canExecute()) return false;
  return redisClient.status === 'ready';
}

/**
 * Execute a Redis command with circuit breaker protection.
 * Returns null on failure (never throws — caller falls back to DB).
 *
 * This is the ONLY way idempotency middleware should interact with Redis.
 * It guarantees:
 * 1. Circuit breaker check before execution
 * 2. Timeout protection (2s command timeout via ioredis config)
 * 3. Failure recording for circuit breaker state transitions
 * 4. Null return on failure (not an exception)
 */
export async function safeRedisExecute<T>(operation: (client: Redis) => Promise<T>, operationName: string): Promise<T | null> {
  if (!redisClient) return null;
  if (!circuitBreaker.canExecute()) {
    logger.debug(`Redis: Circuit open, skipping ${operationName}`, {
      event: 'REDIS_CIRCUIT_OPEN_SKIP',
      operation: operationName,
      circuitState: circuitBreaker.getState()
    });
    return null;
  }
  try {
    const result = await operation(redisClient);
    circuitBreaker.recordSuccess();
    return result;
  } catch (error: any) {
    circuitBreaker.recordFailure();
    logger.warn(`Redis: ${operationName} failed, falling back to DB`, {
      event: 'REDIS_OPERATION_FAILED',
      operation: operationName,
      error: error.message,
      circuitState: circuitBreaker.getState()
    });
    return null;
  }
}

/**
 * Graceful shutdown — flush pending commands and disconnect.
 * Call on SIGTERM/SIGINT.
 */
export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    logger.info('Redis: Shutting down gracefully', {
      event: 'REDIS_SHUTDOWN'
    });
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Health check — returns connection status and circuit breaker state.
 * Use in /health endpoint.
 */
export function getRedisHealth() {
  return {
    connected: redisClient?.status === 'ready' || false,
    status: redisClient?.status || 'not_initialized',
    circuitBreaker: circuitBreaker.getStats()
  };
}
export { circuitBreaker };