import { logger } from '../utils/logger';
import { OutboxAggregateType, OutboxEventType, OutboxEventStatus, OutboxEventPayloadMap, RETRY_CONFIG } from './OutboxEventTypes';

// =============================================================================
// OUTBOX WRITER — Atomic Event Creation Within Transactions
//
// This module provides a single function: writeOutboxEvent()
// It MUST be called inside a Prisma $transaction to guarantee atomicity.
//
// WHY THIS ELIMINATES GHOST BOOKINGS:
//
// BEFORE (fire-and-forget):
//   BEGIN TRANSACTION
//     INSERT booking → ✅ committed
//   COMMIT
//   sendNotification() → ❌ server crashes here → notification LOST FOREVER
//
// AFTER (outbox pattern):
//   BEGIN TRANSACTION
//     INSERT booking → ✅
//     INSERT outbox_event → ✅
//   COMMIT → Both succeed or both fail. ATOMIC.
//   ...later...
//   Worker polls outbox → finds event → sends notification → marks DELIVERED
//
// The key insight: the outbox event lives in the SAME database, in the SAME
// transaction. There is no distributed system coordination. It's just two
// rows in one PostgreSQL transaction. If the transaction commits, the event
// exists. If it rolls back, neither the booking nor the event exists.
// Zero ghost bookings. Zero lost events.
// =============================================================================

/**
 * Write an outbox event within an existing Prisma transaction.
 *
 * CRITICAL: The `tx` parameter MUST be a Prisma transaction client.
 * Calling this outside a transaction defeats the entire purpose.
 *
 * @param tx - Prisma transaction client (from $transaction callback)
 * @param params - Event parameters
 * @returns The created outbox event record
 *
 * @example
 * ```typescript
 * await prisma.$transaction(async (tx) => {
 *   const booking = await tx.booking.create({ data: {...} });
 *   await writeOutboxEvent(tx, {
 *     aggregateType: OutboxAggregateType.BOOKING,
 *     aggregateId: booking.id,
 *     eventType: OutboxEventType.BOOKING_CREATED,
 *     payload: { bookingId: booking.id, ... },
 *   });
 * });
 * ```
 */
export async function writeOutboxEvent<T extends OutboxEventType>(tx: any,
// Prisma transaction client
params: {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventType: T;
  payload: OutboxEventPayloadMap[T];
}): Promise<any> {
  const event = await tx.outboxEvent.create({
    data: {
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventType: params.eventType,
      payload: params.payload as any,
      status: OutboxEventStatus.PENDING,
      retryCount: 0,
      maxRetries: RETRY_CONFIG.maxRetries,
      nextRetryAt: new Date(),
      // Immediately eligible for processing
      lastError: null,
      processedAt: null
    }
  });
  logger.info('Outbox: Event written atomically', {
    event: 'OUTBOX_EVENT_WRITTEN',
    outboxEventId: event.id,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType
  });
  return event;
}