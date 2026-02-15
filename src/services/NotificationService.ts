import { getPrismaClient } from '../utils/prisma';
import { Role, NotificationType as PrismaNotificationType } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * NotificationService - In-App Notification Infrastructure with Persistence
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. DECOUPLED FROM CORE LOGIC
 *    - Notifications are triggered AFTER core operations succeed
 *    - Notification failures NEVER break existing flows
 *    - Fire-and-forget pattern with isolated error handling
 *
 * 2. IDEMPOTENT
 *    - Duplicate notifications prevented via (recipientId, type, referenceId)
 *    - Safe to retry without creating duplicates
 *
 * 3. PERSISTENT STORAGE
 *    - Notifications stored in PostgreSQL via Prisma
 *    - Survives server restarts
 *    - Supports pagination for large notification lists
 *
 * 4. FAILURE ISOLATION
 *    - All write operations wrapped in try-catch
 *    - Write failures logged but never thrown to caller
 *    - Read operations degrade gracefully (return empty/zero)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CRITICAL SAFETY RULES:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ✅ Notifications are READ-ONLY side effects
 * ✅ All operations wrapped in try-catch
 * ✅ Failures logged but never thrown to caller
 * ✅ No mutations to Booking, Payment, Subscription tables
 * ✅ No blocking of core business operations
 * ✅ No foreign key relations to core tables
 *
 * ❌ NO access to Booking mutations
 * ❌ NO access to Payment mutations
 * ❌ NO access to Subscription mutations
 * ❌ NO external service calls
 * ❌ NO synchronous blocking
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const prisma = getPrismaClient();

// ============================================================================
// NOTIFICATION TYPES (Re-export from Prisma for backward compatibility)
// ============================================================================

/**
 * Notification Type Enum
 *
 * Re-exported from Prisma client for backward compatibility with existing code.
 * Maps to the NotificationType enum in schema.prisma.
 */
export const NotificationType = {
  AGENT_PROPERTY_ASSIGNED: 'AGENT_PROPERTY_ASSIGNED' as PrismaNotificationType,
  AGENT_PROPERTY_UNASSIGNED: 'AGENT_PROPERTY_UNASSIGNED' as PrismaNotificationType,
  AGENT_TENANT_ASSIGNED: 'AGENT_TENANT_ASSIGNED' as PrismaNotificationType,
  AGENT_TENANT_UNASSIGNED: 'AGENT_TENANT_UNASSIGNED' as PrismaNotificationType,
  PROPERTY_NOTE_CREATED: 'PROPERTY_NOTE_CREATED' as PrismaNotificationType
} as const;
export type NotificationType = PrismaNotificationType;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface NotificationPayload {
  // Common fields
  triggeredBy?: string;
  triggeredByName?: string;
  triggeredByRole?: string;

  // Property-related
  propertyId?: string;
  propertyTitle?: string;
  propertyCity?: string;

  // Agent-related
  agentId?: string;
  agentName?: string;
  agentEmail?: string;

  // Tenant-related
  tenantId?: string;
  tenantName?: string;
  tenantEmail?: string;

  // Owner-related
  ownerId?: string;
  ownerName?: string;

  // Note-related
  noteId?: string;
  notePreview?: string;

  // Assignment-related
  assignmentId?: string;
  assignmentNotes?: string;
  reason?: string;
}
export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  payload?: NotificationPayload;
  referenceId?: string; // For idempotency
}
export interface NotificationView {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  payload: NotificationPayload | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}
export interface PaginatedNotifications {
  notifications: NotificationView[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class NotificationService {
  constructor() {
    // Bind methods to preserve 'this' context
    this.emit = this.emit.bind(this);
    this.emitBatch = this.emitBatch.bind(this);
    this.getNotifications = this.getNotifications.bind(this);
    this.getNotificationsPaginated = this.getNotificationsPaginated.bind(this);
    this.markAsRead = this.markAsRead.bind(this);
    this.markAllAsRead = this.markAllAsRead.bind(this);
    this.getUnreadCount = this.getUnreadCount.bind(this);

    // Event emitters
    this.onAgentPropertyAssigned = this.onAgentPropertyAssigned.bind(this);
    this.onAgentPropertyUnassigned = this.onAgentPropertyUnassigned.bind(this);
    this.onAgentTenantAssigned = this.onAgentTenantAssigned.bind(this);
    this.onAgentTenantUnassigned = this.onAgentTenantUnassigned.bind(this);
    this.onPropertyNoteCreated = this.onPropertyNoteCreated.bind(this);
  }

  // ==========================================================================
  // CORE NOTIFICATION METHODS
  // ==========================================================================

  /**
   * EMIT NOTIFICATION
   *
   * Creates a single notification with database persistence.
   * Fire-and-forget with complete error isolation.
   *
   * @param input - Notification data
   * @returns Created notification or null on failure
   *
   * SAFETY:
   * - Wrapped in try-catch
   * - Failures logged but NEVER thrown
   * - Idempotent via unique constraint on (recipientId, type, referenceId)
   * - Duplicate attempts return existing notification (upsert behavior)
   */
  async emit(input: CreateNotificationInput): Promise<NotificationView | null> {
    try {
      logger.info(`[NotificationService] Emitting ${input.type} to ${input.recipientId}`);

      // Use upsert for idempotency - if notification exists, return it
      // This handles the unique constraint gracefully
      const notification = await prisma.notification.upsert({
        where: {
          recipientId_type_referenceId: {
            recipientId: input.recipientId,
            type: input.type as PrismaNotificationType,
            referenceId: input.referenceId || ''
          }
        },
        create: {
          recipientId: input.recipientId,
          type: input.type as PrismaNotificationType,
          title: input.title,
          message: input.message,
          payload: input.payload ? input.payload as any : null,
          referenceId: input.referenceId || null,
          isRead: false
        },
        update: {


          // No update - just return existing if duplicate
        } });
      logger.info(`[NotificationService] Notification persisted: ${notification.id}`);
      return this.mapToView(notification);
    } catch (error: any) {
      // CRITICAL: Log but NEVER throw - notifications must not break core flows
      logger.error(`[NotificationService] Failed to emit notification:`, {
        type: input.type,
        recipientId: input.recipientId,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * EMIT BATCH NOTIFICATIONS
   *
   * Creates multiple notifications for different recipients.
   * Each notification is independent - one failure doesn't affect others.
   *
   * @param inputs - Array of notification data
   * @returns Array of created notifications (nulls for failures)
   *
   * SAFETY:
   * - Each notification processed independently
   * - Individual failures don't affect batch
   * - All errors isolated and logged
   */
  async emitBatch(inputs: CreateNotificationInput[]): Promise<(NotificationView | null)[]> {
    logger.info(`[NotificationService] Emitting batch of ${inputs.length} notifications`);

    // Process in parallel but isolate failures
    const results = await Promise.all(inputs.map((input) => this.emit(input)));
    const successCount = results.filter((r) => r !== null).length;
    logger.info(`[NotificationService] Batch complete: ${successCount}/${inputs.length} succeeded`);
    return results;
  }

  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * GET NOTIFICATIONS FOR USER
   *
   * Fetches notifications for a specific user.
   * Degrades gracefully on failure (returns empty array).
   *
   * @param recipientId - User ID
   * @param includeRead - Whether to include read notifications (default: true)
   * @returns Array of notifications (empty on failure)
   */
  async getNotifications(recipientId: string, includeRead: boolean = true): Promise<NotificationView[]> {
    try {
      const notifications = await prisma.notification.findMany({
        where: {
          recipientId,
          ...(includeRead ? {} : {
            isRead: false
          })
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 100 // Reasonable limit for non-paginated requests
      });
      return notifications.map(this.mapToView);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to get notifications:`, {
        recipientId,
        error: error.message
      });
      return []; // Graceful degradation
    }
  }

  /**
   * GET NOTIFICATIONS PAGINATED
   *
   * Fetches notifications with pagination support.
   * Degrades gracefully on failure.
   *
   * @param recipientId - User ID
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of items per page
   * @param includeRead - Whether to include read notifications
   * @returns Paginated notifications (empty on failure)
   */
  async getNotificationsPaginated(recipientId: string, page: number = 1, pageSize: number = 20, includeRead: boolean = true): Promise<PaginatedNotifications> {
    try {
      const skip = (page - 1) * pageSize;
      const whereClause = {
        recipientId,
        ...(includeRead ? {} : {
          isRead: false
        })
      };

      // Fetch notifications and count in parallel
      const [notifications, total] = await Promise.all([prisma.notification.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize
      }), prisma.notification.count({
        where: whereClause
      })]);
      return {
        notifications: notifications.map(this.mapToView),
        total,
        page,
        pageSize,
        hasMore: skip + notifications.length < total
      };
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to get paginated notifications:`, {
        recipientId,
        page,
        error: error.message
      });
      // Graceful degradation
      return {
        notifications: [],
        total: 0,
        page,
        pageSize,
        hasMore: false
      };
    }
  }

  /**
   * MARK NOTIFICATION AS READ
   *
   * @param notificationId - Notification ID
   * @param recipientId - User ID (for ownership verification)
   * @returns Updated notification or null
   */
  async markAsRead(notificationId: string, recipientId: string): Promise<NotificationView | null> {
    try {
      // First verify ownership
      const existing = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          recipientId
        }
      });
      if (!existing) {
        logger.warn(`[NotificationService] Notification not found or unauthorized:`, {
          notificationId,
          recipientId
        });
        return null;
      }

      // Already read - return as-is (idempotent)
      if (existing.isRead) {
        return this.mapToView(existing);
      }
      const updated = await prisma.notification.update({
        where: {
          id: notificationId
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });
      return this.mapToView(updated);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to mark as read:`, {
        notificationId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * MARK ALL NOTIFICATIONS AS READ
   *
   * @param recipientId - User ID
   * @returns Number of notifications marked as read
   */
  async markAllAsRead(recipientId: string): Promise<number> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          recipientId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });
      logger.info(`[NotificationService] Marked ${result.count} notifications as read for ${recipientId}`);
      return result.count;
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to mark all as read:`, {
        recipientId,
        error: error.message
      });
      return 0; // Graceful degradation
    }
  }

  /**
   * GET UNREAD COUNT
   *
   * @param recipientId - User ID
   * @returns Number of unread notifications (0 on failure)
   */
  async getUnreadCount(recipientId: string): Promise<number> {
    try {
      const count = await prisma.notification.count({
        where: {
          recipientId,
          isRead: false
        }
      });
      return count;
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to get unread count:`, {
        recipientId,
        error: error.message
      });
      return 0; // Graceful degradation
    }
  }

  // ==========================================================================
  // HELPER: MAP PRISMA MODEL TO VIEW
  // ==========================================================================

  private mapToView(notification: any): NotificationView {
    return {
      id: notification.id,
      recipientId: notification.recipientId,
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      payload: notification.payload as NotificationPayload | null,
      isRead: notification.isRead,
      readAt: notification.readAt,
      createdAt: notification.createdAt
    };
  }

  // ==========================================================================
  // EVENT EMITTERS - AGENT PROPERTY ASSIGNMENTS
  // ==========================================================================

  /**
   * ON AGENT PROPERTY ASSIGNED
   *
   * Triggered when admin assigns an agent to a property.
   *
   * Recipients:
   * - AGENT: "You have been assigned to property X"
   * - OWNER: "Agent Y has been assigned to your property X"
   *
   * @param data - Assignment details
   */
  async onAgentPropertyAssigned(data: {
    assignmentId: string;
    agentId: string;
    agentName: string;
    agentEmail: string;
    propertyId: string;
    propertyTitle: string;
    propertyCity: string;
    ownerId: string;
    ownerName: string;
    assignedBy: string;
    assignedByName: string;
    assignmentNotes?: string;
  }): Promise<void> {
    logger.info(`[NotificationService] onAgentPropertyAssigned: ${data.assignmentId}`);
    const basePayload: NotificationPayload = {
      triggeredBy: data.assignedBy,
      triggeredByName: data.assignedByName,
      triggeredByRole: 'ADMIN',
      propertyId: data.propertyId,
      propertyTitle: data.propertyTitle,
      propertyCity: data.propertyCity,
      agentId: data.agentId,
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      assignmentId: data.assignmentId,
      assignmentNotes: data.assignmentNotes
    };
    const notifications: CreateNotificationInput[] = [
    // Notify Agent
    {
      recipientId: data.agentId,
      type: NotificationType.AGENT_PROPERTY_ASSIGNED,
      title: 'New Property Assignment',
      message: `You have been assigned to property "${data.propertyTitle}" in ${data.propertyCity}.`,
      payload: basePayload,
      referenceId: data.assignmentId
    },
    // Notify Owner
    {
      recipientId: data.ownerId,
      type: NotificationType.AGENT_PROPERTY_ASSIGNED,
      title: 'Agent Assigned to Your Property',
      message: `Agent ${data.agentName} has been assigned to your property "${data.propertyTitle}".`,
      payload: basePayload,
      referenceId: data.assignmentId
    }];
    await this.emitBatch(notifications);
  }

  /**
   * ON AGENT PROPERTY UNASSIGNED
   *
   * Triggered when admin unassigns an agent from a property.
   *
   * Recipients:
   * - AGENT: "You have been unassigned from property X"
   * - OWNER: "Agent Y has been unassigned from your property X"
   */
  async onAgentPropertyUnassigned(data: {
    assignmentId: string;
    agentId: string;
    agentName: string;
    propertyId: string;
    propertyTitle: string;
    propertyCity: string;
    ownerId: string;
    ownerName: string;
    unassignedBy: string;
    unassignedByName: string;
  }): Promise<void> {
    logger.info(`[NotificationService] onAgentPropertyUnassigned: ${data.assignmentId}`);
    const basePayload: NotificationPayload = {
      triggeredBy: data.unassignedBy,
      triggeredByName: data.unassignedByName,
      triggeredByRole: 'ADMIN',
      propertyId: data.propertyId,
      propertyTitle: data.propertyTitle,
      propertyCity: data.propertyCity,
      agentId: data.agentId,
      agentName: data.agentName,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      assignmentId: data.assignmentId
    };
    const notifications: CreateNotificationInput[] = [
    // Notify Agent
    {
      recipientId: data.agentId,
      type: NotificationType.AGENT_PROPERTY_UNASSIGNED,
      title: 'Property Assignment Removed',
      message: `You have been unassigned from property "${data.propertyTitle}" in ${data.propertyCity}.`,
      payload: basePayload,
      referenceId: `unassign_${data.assignmentId}`
    },
    // Notify Owner
    {
      recipientId: data.ownerId,
      type: NotificationType.AGENT_PROPERTY_UNASSIGNED,
      title: 'Agent Unassigned from Your Property',
      message: `Agent ${data.agentName} has been unassigned from your property "${data.propertyTitle}".`,
      payload: basePayload,
      referenceId: `unassign_${data.assignmentId}`
    }];
    await this.emitBatch(notifications);
  }

  // ==========================================================================
  // EVENT EMITTERS - AGENT TENANT ASSIGNMENTS
  // ==========================================================================

  /**
   * ON AGENT TENANT ASSIGNED
   *
   * Triggered when admin assigns an agent to a tenant.
   *
   * Recipients:
   * - AGENT: "You have been assigned to tenant X"
   * - TENANT: "Agent Y has been assigned to assist you"
   */
  async onAgentTenantAssigned(data: {
    assignmentId: string;
    agentId: string;
    agentName: string;
    agentEmail: string;
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
    assignedBy: string;
    assignedByName: string;
    reason?: string;
  }): Promise<void> {
    logger.info(`[NotificationService] onAgentTenantAssigned: ${data.assignmentId}`);
    const basePayload: NotificationPayload = {
      triggeredBy: data.assignedBy,
      triggeredByName: data.assignedByName,
      triggeredByRole: 'ADMIN',
      agentId: data.agentId,
      agentName: data.agentName,
      agentEmail: data.agentEmail,
      tenantId: data.tenantId,
      tenantName: data.tenantName,
      tenantEmail: data.tenantEmail,
      assignmentId: data.assignmentId,
      reason: data.reason
    };
    const notifications: CreateNotificationInput[] = [
    // Notify Agent
    {
      recipientId: data.agentId,
      type: NotificationType.AGENT_TENANT_ASSIGNED,
      title: 'New Tenant Assignment',
      message: `You have been assigned to assist tenant "${data.tenantName}".`,
      payload: basePayload,
      referenceId: data.assignmentId
    },
    // Notify Tenant
    {
      recipientId: data.tenantId,
      type: NotificationType.AGENT_TENANT_ASSIGNED,
      title: 'Support Agent Assigned',
      message: `Agent ${data.agentName} has been assigned to assist you with your property search.`,
      payload: basePayload,
      referenceId: data.assignmentId
    }];
    await this.emitBatch(notifications);
  }

  /**
   * ON AGENT TENANT UNASSIGNED
   *
   * Triggered when admin unassigns an agent from a tenant.
   *
   * Recipients:
   * - AGENT: "You have been unassigned from tenant X"
   * - TENANT: "Agent Y is no longer assigned to assist you"
   */
  async onAgentTenantUnassigned(data: {
    assignmentId: string;
    agentId: string;
    agentName: string;
    tenantId: string;
    tenantName: string;
    unassignedBy: string;
    unassignedByName: string;
  }): Promise<void> {
    logger.info(`[NotificationService] onAgentTenantUnassigned: ${data.assignmentId}`);
    const basePayload: NotificationPayload = {
      triggeredBy: data.unassignedBy,
      triggeredByName: data.unassignedByName,
      triggeredByRole: 'ADMIN',
      agentId: data.agentId,
      agentName: data.agentName,
      tenantId: data.tenantId,
      tenantName: data.tenantName,
      assignmentId: data.assignmentId
    };
    const notifications: CreateNotificationInput[] = [
    // Notify Agent
    {
      recipientId: data.agentId,
      type: NotificationType.AGENT_TENANT_UNASSIGNED,
      title: 'Tenant Assignment Removed',
      message: `You have been unassigned from tenant "${data.tenantName}".`,
      payload: basePayload,
      referenceId: `unassign_${data.assignmentId}`
    },
    // Notify Tenant
    {
      recipientId: data.tenantId,
      type: NotificationType.AGENT_TENANT_UNASSIGNED,
      title: 'Support Agent Changed',
      message: `Agent ${data.agentName} is no longer assigned to assist you.`,
      payload: basePayload,
      referenceId: `unassign_${data.assignmentId}`
    }];
    await this.emitBatch(notifications);
  }

  // ==========================================================================
  // EVENT EMITTERS - PROPERTY NOTES
  // ==========================================================================

  /**
   * ON PROPERTY NOTE CREATED
   *
   * Triggered when admin or agent creates a property note.
   *
   * Recipients:
   * - OWNER: "A new note has been added to your property X"
   * - TENANT (if assigned): "A new note has been added to property X"
   *
   * NOTE: The author (admin/agent) does NOT receive a notification.
   */
  async onPropertyNoteCreated(data: {
    noteId: string;
    propertyId: string;
    propertyTitle: string;
    propertyCity: string;
    ownerId: string;
    ownerName: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    notePreview: string;
    assignedTenantIds?: string[]; // Tenants assigned via booking or agent
  }): Promise<void> {
    logger.info(`[NotificationService] onPropertyNoteCreated: ${data.noteId}`);
    const basePayload: NotificationPayload = {
      triggeredBy: data.authorId,
      triggeredByName: data.authorName,
      triggeredByRole: data.authorRole,
      propertyId: data.propertyId,
      propertyTitle: data.propertyTitle,
      propertyCity: data.propertyCity,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      noteId: data.noteId,
      notePreview: data.notePreview
    };
    const notifications: CreateNotificationInput[] = [];

    // Notify Owner (always)
    notifications.push({
      recipientId: data.ownerId,
      type: NotificationType.PROPERTY_NOTE_CREATED,
      title: 'New Note on Your Property',
      message: `${data.authorName} added a note to your property "${data.propertyTitle}": "${data.notePreview}"`,
      payload: basePayload,
      referenceId: data.noteId
    });

    // Notify assigned tenants (if any)
    if (data.assignedTenantIds && data.assignedTenantIds.length > 0) {
      for (const tenantId of data.assignedTenantIds) {
        notifications.push({
          recipientId: tenantId,
          type: NotificationType.PROPERTY_NOTE_CREATED,
          title: 'New Note on Property',
          message: `A new note has been added to property "${data.propertyTitle}": "${data.notePreview}"`,
          payload: basePayload,
          referenceId: `${data.noteId}_${tenantId}`
        });
      }
    }
    await this.emitBatch(notifications);
  }

  // ==========================================================================
  // HELPER: GET ASSIGNED TENANTS FOR PROPERTY
  // ==========================================================================

  /**
   * GET TENANTS ASSIGNED TO PROPERTY
   *
   * Finds all tenants who should receive notifications for a property:
   * 1. Tenants with approved bookings for the property
   * 2. Tenants assigned to agents who are assigned to the property
   *
   * @param propertyId - Property ID
   * @returns Array of tenant IDs
   */
  async getAssignedTenantsForProperty(propertyId: string): Promise<string[]> {
    try {
      const tenantIds = new Set<string>();

      // 1. Tenants with approved bookings
      const bookings = await prisma.booking.findMany({
        where: {
          roomId: propertyId,
          status: 'APPROVED',
          tenantId: {
            not: null
          }
        },
        select: {
          tenantId: true
        }
      });
      bookings.forEach((b) => {
        if (b.tenantId) tenantIds.add(b.tenantId);
      });

      // 2. Tenants assigned to agents who are assigned to this property
      const propertyAssignments = await prisma.agentPropertyAssignment.findMany({
        where: {
          propertyId,
          isActive: true
        },
        select: {
          agentId: true
        }
      });
      const agentIds = propertyAssignments.map((a) => a.agentId);
      if (agentIds.length > 0) {
        const tenantAssignments = await prisma.agentTenantAssignment.findMany({
          where: {
            agentId: {
              in: agentIds
            },
            isActive: true
          },
          select: {
            tenantId: true
          }
        });
        tenantAssignments.forEach((a) => tenantIds.add(a.tenantId));
      }
      return Array.from(tenantIds);
    } catch (error: any) {
      logger.error(`[NotificationService] Failed to get assigned tenants:`, error);
      return [];
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();