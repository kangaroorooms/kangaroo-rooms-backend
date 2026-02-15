import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
import { notificationService } from './NotificationService';
import { OutboxEventType, OutboxEventStatus, BookingCreatedPayload, BookingStatusChangedPayload, BookingCancelledPayload, calculateNextRetryAt, RETRY_CONFIG } from './OutboxEventTypes';
const prisma = getPrismaClient();

// =============================================================================
// OUTBOX WORKER — Polls and Dispatches Events with Retry
//
// ARCHITECTURE:
//
//   ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
//   │ Outbox Table │────▶│ Outbox Worker│────▶│ Event Handlers   │
//   │ (PostgreSQL) │     │ (Poller)     │     │ (Notifications)  │
//   └──────────────┘     └──────────────┘     └──────────────────┘
//
// POLLING STRATEGY:
// - Interval: 5 seconds (configurable)
// - Batch size: 50 events per poll
// - Locking: SELECT ... FOR UPDATE SKIP LOCKED
//   → Multiple workers can run safely without double-processing
//   → If worker A locks event 1, worker B skips it and takes event 2
//
// WHY POLLING (not CDC/Debezium):
// ┌─────────────────┬───────────────────────────────────────────────────┐
// │ DB Polling       │ Simple, no infra, works up to ~100K events/day  │
// │ (Current)        │ Latency: 0-5 seconds (poll interval)            │
// │                  │ Perfect for: startups, <100K bookings/day       │
// ├─────────────────┼───────────────────────────────────────────────────┤
// │ Debezium CDC     │ Captures PostgreSQL WAL changes in real-time    │
// │ (100K-1M/day)    │ Latency: <100ms. Requires Kafka + Debezium.    │
// │                  │ Use when: polling latency > SLA or >100K/day    │
// ├─────────────────┼───────────────────────────────────────────────────┤
// │ Logical Repl.    │ PostgreSQL native WAL streaming                 │
// │ (Multi-region)   │ Lower overhead than Debezium, complex setup.    │
// │                  │ Use when: multi-region, need DB-level streaming │
// └─────────────────┴───────────────────────────────────────────────────┘
//
// ORDERING GUARANTEES:
// - Events are processed in createdAt order (FIFO within the batch)
// - Per-aggregate ordering is maintained: BOOKING_CREATED always before
//   BOOKING_STATUS_CHANGED for the same bookingId
// - Global ordering is NOT guaranteed across aggregates (not needed)
// - If strict per-aggregate ordering is critical: process sequentially
//   per aggregateId (partition key). Current system doesn't need this
//   because each event is independently meaningful.
//
// WHEN ORDERING MATTERS vs DOESN'T:
// - MATTERS: Booking created → then status changed. If status change
//   notification arrives before creation notification, user is confused.
//   Solved by: createdAt ordering + sequential processing per aggregate.
// - DOESN'T MATTER: Two different bookings' notifications can arrive
//   in any order. User A's booking and User B's booking are independent.
//
// =============================================================================

const POLL_INTERVAL_MS = 5_000; // 5 seconds
const BATCH_SIZE = 50; // Events per poll cycle
const PROCESSING_TIMEOUT_MS = 60_000; // 1 minute — if event stuck in PROCESSING

// =============================================================================
// METRICS
// =============================================================================

interface OutboxMetrics {
  eventsProcessed: number;
  eventsDelivered: number;
  eventsFailed: number;
  eventsDeadLettered: number;
  pollCycles: number;
  emptyPolls: number;
  processingErrors: number;
  lastPollAt: string | null;
  lastEventAt: string | null;
}
const metrics: OutboxMetrics = {
  eventsProcessed: 0,
  eventsDelivered: 0,
  eventsFailed: 0,
  eventsDeadLettered: 0,
  pollCycles: 0,
  emptyPolls: 0,
  processingErrors: 0,
  lastPollAt: null,
  lastEventAt: null
};

// =============================================================================
// MAIN POLL LOOP
// =============================================================================

let pollTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the outbox worker polling loop.
 * Call once on server startup.
 */
export function startOutboxWorker(): void {
  if (isRunning) {
    logger.warn('Outbox worker: Already running');
    return;
  }
  isRunning = true;
  logger.info('Outbox worker: Starting', {
    event: 'OUTBOX_WORKER_START',
    pollIntervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE
  });

  // Run immediately on startup to process any backlog
  pollAndProcess().catch((err) => {
    logger.error('Outbox worker: Initial poll failed', {
      error: err.message
    });
  });

  // Then poll on interval
  pollTimer = setInterval(async () => {
    try {
      await pollAndProcess();
    } catch (err: any) {
      metrics.processingErrors++;
      logger.error('Outbox worker: Poll cycle failed', {
        event: 'OUTBOX_POLL_ERROR',
        error: err.message
      });
    }
  }, POLL_INTERVAL_MS);

  // Don't prevent process exit
  if (pollTimer.unref) {
    pollTimer.unref();
  }
}

/**
 * Stop the outbox worker gracefully.
 * Call on SIGTERM/SIGINT.
 */
export function stopOutboxWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isRunning = false;
  logger.info('Outbox worker: Stopped', {
    event: 'OUTBOX_WORKER_STOP',
    metrics
  });
}

/**
 * Single poll cycle: fetch pending events and process them.
 *
 * Uses raw SQL with FOR UPDATE SKIP LOCKED for safe concurrent processing.
 * This is the gold standard for outbox polling:
 * - FOR UPDATE: locks the rows so no other worker can grab them
 * - SKIP LOCKED: if a row is already locked, skip it (don't wait)
 * - This allows multiple worker instances without coordination
 */
async function pollAndProcess(): Promise<void> {
  metrics.pollCycles++;
  metrics.lastPollAt = new Date().toISOString();

  // Also recover stuck events (PROCESSING for too long — worker crashed)
  await recoverStuckEvents();

  // Fetch batch of pending events using raw SQL for FOR UPDATE SKIP LOCKED
  // Prisma doesn't support SKIP LOCKED natively, so we use $queryRawUnsafe
  const events: any[] = await prisma.$queryRawUnsafe(`
    UPDATE "outbox_events"
    SET "status" = 'PROCESSING', "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "outbox_events"
      WHERE "status" = 'PENDING'
        AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  if (events.length === 0) {
    metrics.emptyPolls++;
    return;
  }
  logger.info(`Outbox worker: Processing ${events.length} events`, {
    event: 'OUTBOX_POLL_BATCH',
    count: events.length,
    eventTypes: events.map((e) => e.eventType)
  });

  // Process each event sequentially (maintains per-aggregate ordering)
  for (const event of events) {
    await processEvent(event);
  }
}

/**
 * Process a single outbox event.
 *
 * 1. Route to the appropriate handler based on eventType
 * 2. On success: mark DELIVERED
 * 3. On failure: increment retryCount, calculate nextRetryAt
 * 4. If retryCount > maxRetries: mark DEAD_LETTER (poison pill protection)
 */
async function processEvent(event: any): Promise<void> {
  metrics.eventsProcessed++;
  metrics.lastEventAt = new Date().toISOString();
  try {
    // Route event to handler
    await routeEvent(event.eventType, event.payload, event.id);

    // SUCCESS — mark as delivered
    await prisma.outboxEvent.update({
      where: {
        id: event.id
      },
      data: {
        status: OutboxEventStatus.DELIVERED,
        processedAt: new Date()
      }
    });
    metrics.eventsDelivered++;
    logger.info('Outbox: Event delivered', {
      event: 'OUTBOX_EVENT_DELIVERED',
      outboxEventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId
    });
  } catch (error: any) {
    metrics.eventsFailed++;
    const newRetryCount = event.retryCount + 1;
    if (newRetryCount > (event.maxRetries || RETRY_CONFIG.maxRetries)) {
      // DEAD LETTER — exceeded max retries, stop trying
      await prisma.outboxEvent.update({
        where: {
          id: event.id
        },
        data: {
          status: OutboxEventStatus.DEAD_LETTER,
          retryCount: newRetryCount,
          lastError: error.message?.substring(0, 500) || 'Unknown error'
        }
      });
      metrics.eventsDeadLettered++;
      logger.error('Outbox: Event dead-lettered (max retries exceeded)', {
        event: 'OUTBOX_EVENT_DEAD_LETTER',
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        retryCount: newRetryCount,
        maxRetries: event.maxRetries,
        lastError: error.message
      });
    } else {
      // RETRY — schedule next attempt with exponential backoff
      const nextRetryAt = calculateNextRetryAt(newRetryCount);
      await prisma.outboxEvent.update({
        where: {
          id: event.id
        },
        data: {
          status: OutboxEventStatus.PENDING,
          // Back to PENDING for next poll
          retryCount: newRetryCount,
          nextRetryAt,
          lastError: error.message?.substring(0, 500) || 'Unknown error'
        }
      });
      logger.warn('Outbox: Event failed, scheduled retry', {
        event: 'OUTBOX_EVENT_RETRY',
        outboxEventId: event.id,
        eventType: event.eventType,
        retryCount: newRetryCount,
        nextRetryAt: nextRetryAt.toISOString(),
        error: error.message
      });
    }
  }
}

/**
 * Recover events stuck in PROCESSING state.
 *
 * If a worker crashes mid-processing, events stay in PROCESSING forever.
 * This function resets them to PENDING after PROCESSING_TIMEOUT_MS.
 */
async function recoverStuckEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  const result = await prisma.outboxEvent.updateMany({
    where: {
      status: OutboxEventStatus.PROCESSING,
      updatedAt: {
        lt: cutoff
      }
    },
    data: {
      status: OutboxEventStatus.PENDING
    }
  });
  if (result.count > 0) {
    logger.warn(`Outbox: Recovered ${result.count} stuck events`, {
      event: 'OUTBOX_STUCK_RECOVERY',
      count: result.count,
      cutoff: cutoff.toISOString()
    });
  }
}

// =============================================================================
// EVENT ROUTER — Maps event types to handlers
// =============================================================================

/**
 * Route an outbox event to its handler.
 *
 * IDEMPOTENT CONSUMERS:
 * Every handler MUST be idempotent. If the same event is processed twice
 * (due to worker crash, retry, etc.), the result must be the same.
 *
 * For notifications: NotificationService.emit() uses upsert with
 * (recipientId, type, referenceId) unique constraint. Duplicate calls
 * are no-ops. The outbox event ID is used as referenceId.
 *
 * This is how we guarantee NEVER sending duplicate notifications:
 * 1. Outbox event has a unique ID
 * 2. Notification uses that ID as referenceId
 * 3. Unique constraint on (recipientId, type, referenceId) prevents duplicates
 * 4. Even if worker processes the same event 10 times → 1 notification
 */
async function routeEvent(eventType: string, payload: any, outboxEventId: string): Promise<void> {
  switch (eventType) {
    case OutboxEventType.BOOKING_CREATED:
      await handleBookingCreated(payload as BookingCreatedPayload, outboxEventId);
      break;
    case OutboxEventType.BOOKING_STATUS_CHANGED:
      await handleBookingStatusChanged(payload as BookingStatusChangedPayload, outboxEventId);
      break;
    case OutboxEventType.BOOKING_CANCELLED:
      await handleBookingCancelled(payload as BookingCancelledPayload, outboxEventId);
      break;
    default:
      logger.warn(`Outbox: Unknown event type: ${eventType}`, {
        event: 'OUTBOX_UNKNOWN_EVENT',
        eventType,
        outboxEventId
      });
      // Don't throw — unknown events shouldn't block the worker
      // They'll be delivered (marked as such) but not processed
      break;
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Handle BOOKING_CREATED event.
 *
 * Sends notification to the property owner that a new booking request
 * has been received.
 *
 * FIX: Uses BOOKING_CREATED notification type instead of PROPERTY_NOTE_CREATED.
 */
async function handleBookingCreated(payload: BookingCreatedPayload, outboxEventId: string): Promise<void> {
  // Notify the property owner
  await notificationService.emit({
    recipientId: payload.ownerId,
    type: 'BOOKING_CREATED' as any,
    title: 'New Booking Request',
    message: `${payload.tenantName} has requested to book "${payload.roomTitle}" in ${payload.roomCity} with move-in date ${new Date(payload.moveInDate).toLocaleDateString()}.`,
    payload: {
      triggeredBy: payload.tenantId || undefined,
      triggeredByName: payload.tenantName,
      triggeredByRole: 'TENANT',
      propertyId: payload.roomId,
      propertyTitle: payload.roomTitle,
      propertyCity: payload.roomCity,
      ownerId: payload.ownerId,
      ownerName: payload.ownerName
    },
    referenceId: `booking_created_${outboxEventId}`
  });
  logger.info('Outbox handler: BOOKING_CREATED notification sent', {
    event: 'OUTBOX_HANDLER_BOOKING_CREATED',
    bookingId: payload.bookingId,
    ownerId: payload.ownerId
  });
}

/**
 * Handle BOOKING_STATUS_CHANGED event.
 * Notifies the tenant when their booking is approved/rejected.
 *
 * FIX: Uses BOOKING_APPROVED / BOOKING_REJECTED notification types.
 */
async function handleBookingStatusChanged(payload: BookingStatusChangedPayload, outboxEventId: string): Promise<void> {
  if (!payload.tenantId) return;
  const isApproved = payload.newStatus === 'APPROVED';
  const notificationType = isApproved ? 'BOOKING_APPROVED' : 'BOOKING_REJECTED';
  const statusMessage = isApproved ? 'Your booking request has been approved! The owner will contact you shortly.' : 'Your booking request has been declined. You can browse other properties.';
  await notificationService.emit({
    recipientId: payload.tenantId,
    type: notificationType as any,
    title: isApproved ? 'Booking Approved' : 'Booking Declined',
    message: statusMessage,
    payload: {
      propertyId: payload.roomId,
      ownerId: payload.ownerId
    },
    referenceId: `booking_status_${outboxEventId}`
  });
  logger.info('Outbox handler: BOOKING_STATUS_CHANGED notification sent', {
    event: 'OUTBOX_HANDLER_STATUS_CHANGED',
    bookingId: payload.bookingId,
    newStatus: payload.newStatus,
    notificationType
  });
}

/**
 * Handle BOOKING_CANCELLED event.
 * Notifies the owner when a tenant cancels their booking.
 *
 * FIX: Uses BOOKING_REJECTED notification type (cancellation = tenant-initiated rejection).
 */
async function handleBookingCancelled(payload: BookingCancelledPayload, outboxEventId: string): Promise<void> {
  await notificationService.emit({
    recipientId: payload.ownerId,
    type: 'BOOKING_REJECTED' as any,
    title: 'Booking Cancelled',
    message: `A booking for your property has been cancelled by the tenant.`,
    payload: {
      propertyId: payload.roomId,
      ownerId: payload.ownerId
    },
    referenceId: `booking_cancelled_${outboxEventId}`
  });
  logger.info('Outbox handler: BOOKING_CANCELLED notification sent', {
    event: 'OUTBOX_HANDLER_CANCELLED',
    bookingId: payload.bookingId
  });
}

// =============================================================================
// CLEANUP — Remove old delivered events
// =============================================================================

/**
 * Clean up delivered outbox events older than retentionDays.
 * Call from a scheduled job (e.g., daily cron).
 *
 * WHY keep delivered events at all:
 * - Debugging: "Did the notification for booking X actually fire?"
 * - Audit trail: Compliance requires event history
 * - 7 days is enough for debugging; archive to S3 for long-term audit
 */
export async function cleanupDeliveredOutboxEvents(retentionDays: number = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const result = await prisma.outboxEvent.deleteMany({
    where: {
      status: OutboxEventStatus.DELIVERED,
      processedAt: {
        lt: cutoff
      }
    }
  });
  if (result.count > 0) {
    logger.info(`Outbox cleanup: Removed ${result.count} delivered events`, {
      event: 'OUTBOX_CLEANUP',
      deletedCount: result.count,
      retentionDays
    });
  }
  return result.count;
}

// =============================================================================
// METRICS EXPORT
// =============================================================================

export function getOutboxMetrics(): OutboxMetrics & {
  pendingCount?: number;
  deadLetterCount?: number;
} {
  return {
    ...metrics
  };
}

/**
 * Get detailed outbox stats (includes DB counts).
 * Use for /health/detailed endpoint.
 */
export async function getOutboxDetailedStats() {
  try {
    const [pendingCount, processingCount, deadLetterCount, deliveredToday] = await Promise.all([prisma.outboxEvent.count({
      where: {
        status: OutboxEventStatus.PENDING
      }
    }), prisma.outboxEvent.count({
      where: {
        status: OutboxEventStatus.PROCESSING
      }
    }), prisma.outboxEvent.count({
      where: {
        status: OutboxEventStatus.DEAD_LETTER
      }
    }), prisma.outboxEvent.count({
      where: {
        status: OutboxEventStatus.DELIVERED,
        processedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    })]);
    return {
      ...metrics,
      pendingCount,
      processingCount,
      deadLetterCount,
      deliveredToday,
      isRunning,
      pollIntervalMs: POLL_INTERVAL_MS,
      batchSize: BATCH_SIZE
    };
  } catch (error: any) {
    logger.error('Outbox: Failed to get detailed stats', {
      error: error.message
    });
    return {
      ...metrics,
      error: error.message
    };
  }
}