import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/logging.middleware";
import {
  helmetMiddleware,
  corsMiddleware,
  generalRateLimiter,
} from "./middleware/security.middleware";
import { logger } from "./utils/logger";
import routes from "./routes";
import healthRoutes from "./routes/health.routes";
import { setupSwagger } from "./swagger";
import {
  cleanupExpiredIdempotencyRecords,
  getIdempotencyMetrics,
} from "./middleware/idempotency.middleware";
import { idempotencyMetrics } from "./utils/metrics";
import {
  startOutboxWorker,
  stopOutboxWorker,
  getOutboxDetailedStats,
  cleanupDeliveredOutboxEvents,
} from "./services/OutboxWorker";
const app = express();

// Security middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);

// Body parsing (increase limit for base64 images)
app.use(
  express.json({
    limit: "20mb",
  }),
);
app.use(
  express.urlencoded({
    limit: "20mb",
    extended: true,
  }),
);

// Rate limiting (after body parsing, before routes)
app.use(generalRateLimiter);

// Request logging
app.use(requestLogger);

// Health check (before rate limiting for monitoring)
app.use("/health", healthRoutes);

// ── Enhanced health endpoint with Idempotency + Outbox metrics ──
app.get("/health/detailed", async (_req, res) => {
  const idempotencySnapshot = getIdempotencyMetrics();
  const outboxStats = await getOutboxDetailedStats();
  const overallStatus =
    idempotencySnapshot.health.status !== "critical" ? "healthy" : "degraded";
  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      idempotency: idempotencySnapshot,
      outbox: outboxStats,
    },
  });
});

// API routes
app.use("/api", routes);

// Swagger documentation (if enabled)
if (env.ENABLE_SWAGGER) {
  setupSwagger(app);
  logger.info("Swagger documentation enabled at /api-docs");
}

// ── Idempotency TTL Cleanup ──
// Runs every hour to purge expired idempotency records from PostgreSQL.
// Uses the expiresAt B-tree index for O(log n) range scan.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  try {
    const deleted = await cleanupExpiredIdempotencyRecords();
    if (deleted > 0) {
      logger.info(`Idempotency cleanup: removed ${deleted} expired DB records`);
    }
  } catch (error: any) {
    logger.error("Idempotency cleanup failed", {
      error: error.message,
    });
  }
}, CLEANUP_INTERVAL_MS);

// Run once on startup to clear any backlog
cleanupExpiredIdempotencyRecords().catch((err) => {
  logger.warn("Initial idempotency cleanup failed", {
    error: err.message,
  });
});

// ── Outbox Worker ──
// Polls the outbox table every 5 seconds for pending events.
// Dispatches events to handlers (notifications, etc.) with retry logic.
// Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent processing.
startOutboxWorker();

// ── Outbox Cleanup ──
// Runs daily to remove delivered events older than 7 days.
// Keeps the outbox table lean while preserving recent audit trail.
const OUTBOX_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

setInterval(async () => {
  try {
    const deleted = await cleanupDeliveredOutboxEvents(7);
    if (deleted > 0) {
      logger.info(`Outbox cleanup: removed ${deleted} delivered events`);
    }
  } catch (error: any) {
    logger.error("Outbox cleanup failed", {
      error: error.message,
    });
  }
}, OUTBOX_CLEANUP_INTERVAL_MS);

// Error handling (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Database connection via Prisma (configured in prisma/schema.prisma)
    logger.info("Using PostgreSQL database via Prisma ORM");

    // Start listening
    app.listen(env.PORT, "0.0.0.0", () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`💾 Database: PostgreSQL (Prisma ORM)`);
      if (env.ENABLE_SWAGGER) {
        logger.info(`📚 API Docs: http://localhost:${env.PORT}/api-docs`);
      }
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);

  // Stop outbox worker (finish current batch, then stop polling)
  stopOutboxWorker();

  // Shutdown metrics logging
  idempotencyMetrics.shutdown();

  logger.info("Cleanup complete, exiting");
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
startServer();
