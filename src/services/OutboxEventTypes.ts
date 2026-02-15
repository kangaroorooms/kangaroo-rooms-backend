// =============================================================================
// OUTBOX EVENT TYPE DEFINITIONS
//
// Central registry of all domain events that flow through the outbox.
// Every event type has a typed payload interface to prevent runtime errors.
//
// NAMING CONVENTION: {AGGREGATE}_{PAST_TENSE_VERB}
// Examples: BOOKING_CREATED, BOOKING_STATUS_CHANGED, PAYMENT_VERIFIED
//
// ADDING A NEW EVENT:
// 1. Add to OutboxEventType enum
// 2. Create payload interface
// 3. Add to OutboxEventPayloadMap
// 4. Add handler in OutboxWorker.routeEvent()
// =============================================================================

export enum OutboxAggregateType {
  BOOKING = 'BOOKING',
  PAYMENT = 'PAYMENT',
  ASSIGNMENT = 'ASSIGNMENT',
  PROPERTY_NOTE = 'PROPERTY_NOTE',
}
export enum OutboxEventType {
  // Booking lifecycle
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_STATUS_CHANGED = 'BOOKING_STATUS_CHANGED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  // Payment lifecycle (future)
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  // Agent assignments (future — currently fire-and-forget in NotificationIntegration)
  AGENT_PROPERTY_ASSIGNED = 'AGENT_PROPERTY_ASSIGNED',
  AGENT_PROPERTY_UNASSIGNED = 'AGENT_PROPERTY_UNASSIGNED',
  AGENT_TENANT_ASSIGNED = 'AGENT_TENANT_ASSIGNED',
  AGENT_TENANT_UNASSIGNED = 'AGENT_TENANT_UNASSIGNED',
  // Property notes (future)
  PROPERTY_NOTE_CREATED = 'PROPERTY_NOTE_CREATED',
}
export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

// =============================================================================
// TYPED EVENT PAYLOADS
// =============================================================================

export interface BookingCreatedPayload {
  bookingId: string;
  roomId: string;
  roomTitle: string;
  roomCity: string;
  ownerId: string;
  ownerName: string;
  tenantId: string | null;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  moveInDate: string;
  message: string | null;
  status: string;
  createdAt: string;
}
export interface BookingStatusChangedPayload {
  bookingId: string;
  roomId: string;
  ownerId: string;
  tenantId: string | null;
  tenantEmail: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  changedAt: string;
}
export interface BookingCancelledPayload {
  bookingId: string;
  roomId: string;
  ownerId: string;
  tenantId: string;
  tenantEmail: string;
  cancelledAt: string;
}

// =============================================================================
// PAYLOAD TYPE MAP — Ensures type safety when creating/consuming events
// =============================================================================

export interface OutboxEventPayloadMap {
  [OutboxEventType.BOOKING_CREATED]: BookingCreatedPayload;
  [OutboxEventType.BOOKING_STATUS_CHANGED]: BookingStatusChangedPayload;
  [OutboxEventType.BOOKING_CANCELLED]: BookingCancelledPayload;
  // Future events get their payload types added here
  [OutboxEventType.PAYMENT_VERIFIED]: Record<string, any>;
  [OutboxEventType.PAYMENT_FAILED]: Record<string, any>;
  [OutboxEventType.AGENT_PROPERTY_ASSIGNED]: Record<string, any>;
  [OutboxEventType.AGENT_PROPERTY_UNASSIGNED]: Record<string, any>;
  [OutboxEventType.AGENT_TENANT_ASSIGNED]: Record<string, any>;
  [OutboxEventType.AGENT_TENANT_UNASSIGNED]: Record<string, any>;
  [OutboxEventType.PROPERTY_NOTE_CREATED]: Record<string, any>;
}

// =============================================================================
// OUTBOX EVENT RECORD — What's stored in the outbox table
// =============================================================================

export interface OutboxEvent {
  id: string;
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Record<string, any>;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * EXPONENTIAL BACKOFF SCHEDULE
 *
 * Retry 0: immediate (first attempt)
 * Retry 1: 1 minute    (transient network blip)
 * Retry 2: 4 minutes   (service recovering)
 * Retry 3: 16 minutes  (longer outage)
 * Retry 4: 64 minutes  (~1 hour, serious issue)
 * Retry 5: 256 minutes (~4 hours, needs investigation)
 *
 * Total window: ~5.5 hours before dead-lettering.
 *
 * WHY these numbers:
 * - Base: 1 minute (not seconds — avoids hammering a recovering service)
 * - Factor: 4x (aggressive enough to back off, not so slow that users wait forever)
 * - Max retries: 5 (after 5.5 hours, it's a systemic issue, not transient)
 *
 * NUMERIC EXAMPLE for a failed notification:
 * 10:00:00 — Event created (PENDING)
 * 10:00:05 — Worker picks up, sends notification → FAILS
 * 10:00:05 — retryCount=1, nextRetryAt=10:01:05 (1 min)
 * 10:01:05 — Worker retries → FAILS
 * 10:01:05 — retryCount=2, nextRetryAt=10:05:05 (4 min)
 * 10:05:05 — Worker retries → FAILS
 * 10:05:05 — retryCount=3, nextRetryAt=10:21:05 (16 min)
 * 10:21:05 — Worker retries → FAILS
 * 10:21:05 — retryCount=4, nextRetryAt=11:25:05 (64 min)
 * 11:25:05 — Worker retries → FAILS
 * 11:25:05 — retryCount=5, nextRetryAt=15:41:05 (256 min)
 * 15:41:05 — Worker retries → FAILS
 * 15:41:05 — retryCount=6 > maxRetries=5 → DEAD_LETTER ☠️
 *            Alert fires, engineer investigates.
 */
export const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 60_000,
  // 1 minute
  backoffFactor: 4,
  // 4x multiplier
  maxDelayMs: 256 * 60_000 // ~4.3 hours cap
};

/**
 * Calculate the next retry timestamp using exponential backoff.
 *
 * Formula: baseDelay * (backoffFactor ^ retryCount)
 * Capped at maxDelayMs to prevent absurd wait times.
 */
export function calculateNextRetryAt(retryCount: number): Date {
  const delayMs = Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffFactor, retryCount), RETRY_CONFIG.maxDelayMs);
  return new Date(Date.now() + delayMs);
}