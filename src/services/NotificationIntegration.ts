import { notificationService } from './NotificationService';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';

/**
 * NotificationIntegration - Helper Functions for Triggering Notifications
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This module provides helper functions that can be called from existing
 * services to trigger notifications. These functions:
 *
 * 1. Gather all necessary context (user names, property titles, etc.)
 * 2. Call the appropriate NotificationService event emitter
 * 3. Handle all errors gracefully (fire-and-forget)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATION POINTS (WHERE TO CALL THESE):
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. AdminAssignmentService.assignPropertyToAgent()
 *    → Call: notifyAgentPropertyAssigned() AFTER successful assignment
 *
 * 2. AdminAssignmentService.unassignPropertyFromAgent()
 *    → Call: notifyAgentPropertyUnassigned() AFTER successful unassignment
 *
 * 3. AdminAssignmentService.assignTenantToAgent()
 *    → Call: notifyAgentTenantAssigned() AFTER successful assignment
 *
 * 4. AdminAssignmentService.unassignTenantFromAgent()
 *    → Call: notifyAgentTenantUnassigned() AFTER successful unassignment
 *
 * 5. PropertyNoteService.createPropertyNote()
 *    → Call: notifyPropertyNoteCreated() AFTER successful note creation
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY GUARANTEES:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ✅ All functions are fire-and-forget (errors logged, never thrown)
 * ✅ Core operation must succeed BEFORE calling notification
 * ✅ Notification failure cannot rollback core operation
 * ✅ No mutations to Booking, Payment, Subscription tables
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXAMPLE INTEGRATION:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * // In AdminAssignmentService.assignPropertyToAgent():
 *
 * async assignPropertyToAgent(...) {
 *   // ... existing logic ...
 *   const result = await prisma.agentPropertyAssignment.create(...);
 *
 *   // AFTER successful assignment, trigger notification (fire-and-forget)
 *   notifyAgentPropertyAssigned(result.id, adminId).catch(() => {});
 *
 *   return result;
 * }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const prisma = getPrismaClient();

// ============================================================================
// AGENT-PROPERTY ASSIGNMENT NOTIFICATIONS
// ============================================================================

/**
 * NOTIFY: Agent Property Assigned
 *
 * Call this AFTER AdminAssignmentService.assignPropertyToAgent() succeeds.
 *
 * @param assignmentId - The created/reactivated assignment ID
 * @param adminId - The admin who performed the assignment
 */
export async function notifyAgentPropertyAssigned(assignmentId: string, adminId: string): Promise<void> {
  try {
    logger.info(`[NotificationIntegration] Preparing AGENT_PROPERTY_ASSIGNED for ${assignmentId}`);

    // Fetch assignment with all related data
    const assignment = await prisma.agentPropertyAssignment.findUnique({
      where: {
        id: assignmentId
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        property: {
          select: {
            id: true,
            title: true,
            city: true,
            ownerId: true,
            owner: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });
    if (!assignment) {
      logger.warn(`[NotificationIntegration] Assignment not found: ${assignmentId}`);
      return;
    }

    // Fetch admin info
    const admin = await prisma.user.findUnique({
      where: {
        id: adminId
      },
      select: {
        id: true,
        name: true
      }
    });

    // Emit notification
    await notificationService.onAgentPropertyAssigned({
      assignmentId: assignment.id,
      agentId: assignment.agent.id,
      agentName: assignment.agent.name,
      agentEmail: assignment.agent.email,
      propertyId: assignment.property.id,
      propertyTitle: assignment.property.title,
      propertyCity: assignment.property.city,
      ownerId: assignment.property.owner.id,
      ownerName: assignment.property.owner.name,
      assignedBy: adminId,
      assignedByName: admin?.name || 'Admin',
      assignmentNotes: assignment.assignmentNotes || undefined
    });
    logger.info(`[NotificationIntegration] AGENT_PROPERTY_ASSIGNED sent for ${assignmentId}`);
  } catch (error: any) {
    // Fire-and-forget: log but never throw
    logger.error(`[NotificationIntegration] Failed to notify AGENT_PROPERTY_ASSIGNED:`, error);
  }
}

/**
 * NOTIFY: Agent Property Unassigned
 *
 * Call this AFTER AdminAssignmentService.unassignPropertyFromAgent() succeeds.
 *
 * @param agentId - The agent who was unassigned
 * @param propertyId - The property they were unassigned from
 * @param adminId - The admin who performed the unassignment
 */
export async function notifyAgentPropertyUnassigned(agentId: string, propertyId: string, adminId: string): Promise<void> {
  try {
    logger.info(`[NotificationIntegration] Preparing AGENT_PROPERTY_UNASSIGNED for agent ${agentId}, property ${propertyId}`);

    // Fetch agent
    const agent = await prisma.user.findUnique({
      where: {
        id: agentId
      },
      select: {
        id: true,
        name: true
      }
    });

    // Fetch property with owner
    const property = await prisma.room.findUnique({
      where: {
        id: propertyId
      },
      select: {
        id: true,
        title: true,
        city: true,
        owner: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Fetch admin
    const admin = await prisma.user.findUnique({
      where: {
        id: adminId
      },
      select: {
        id: true,
        name: true
      }
    });
    if (!agent || !property) {
      logger.warn(`[NotificationIntegration] Agent or property not found`);
      return;
    }

    // Find the assignment ID (may be deactivated now)
    const assignment = await prisma.agentPropertyAssignment.findUnique({
      where: {
        agentId_propertyId: {
          agentId,
          propertyId
        }
      },
      select: {
        id: true
      }
    });

    // Emit notification
    await notificationService.onAgentPropertyUnassigned({
      assignmentId: assignment?.id || `${agentId}_${propertyId}`,
      agentId: agent.id,
      agentName: agent.name,
      propertyId: property.id,
      propertyTitle: property.title,
      propertyCity: property.city,
      ownerId: property.owner.id,
      ownerName: property.owner.name,
      unassignedBy: adminId,
      unassignedByName: admin?.name || 'Admin'
    });
    logger.info(`[NotificationIntegration] AGENT_PROPERTY_UNASSIGNED sent`);
  } catch (error: any) {
    logger.error(`[NotificationIntegration] Failed to notify AGENT_PROPERTY_UNASSIGNED:`, error);
  }
}

// ============================================================================
// AGENT-TENANT ASSIGNMENT NOTIFICATIONS
// ============================================================================

/**
 * NOTIFY: Agent Tenant Assigned
 *
 * Call this AFTER AdminAssignmentService.assignTenantToAgent() succeeds.
 *
 * @param assignmentId - The created/reactivated assignment ID
 * @param adminId - The admin who performed the assignment
 */
export async function notifyAgentTenantAssigned(assignmentId: string, adminId: string): Promise<void> {
  try {
    logger.info(`[NotificationIntegration] Preparing AGENT_TENANT_ASSIGNED for ${assignmentId}`);

    // Fetch assignment with all related data
    const assignment = await prisma.agentTenantAssignment.findUnique({
      where: {
        id: assignmentId
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        tenant: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    if (!assignment) {
      logger.warn(`[NotificationIntegration] Assignment not found: ${assignmentId}`);
      return;
    }

    // Fetch admin info
    const admin = await prisma.user.findUnique({
      where: {
        id: adminId
      },
      select: {
        id: true,
        name: true
      }
    });

    // Emit notification
    await notificationService.onAgentTenantAssigned({
      assignmentId: assignment.id,
      agentId: assignment.agent.id,
      agentName: assignment.agent.name,
      agentEmail: assignment.agent.email,
      tenantId: assignment.tenant.id,
      tenantName: assignment.tenant.name,
      tenantEmail: assignment.tenant.email,
      assignedBy: adminId,
      assignedByName: admin?.name || 'Admin',
      reason: assignment.reason || undefined
    });
    logger.info(`[NotificationIntegration] AGENT_TENANT_ASSIGNED sent for ${assignmentId}`);
  } catch (error: any) {
    logger.error(`[NotificationIntegration] Failed to notify AGENT_TENANT_ASSIGNED:`, error);
  }
}

/**
 * NOTIFY: Agent Tenant Unassigned
 *
 * Call this AFTER AdminAssignmentService.unassignTenantFromAgent() succeeds.
 *
 * @param agentId - The agent who was unassigned
 * @param tenantId - The tenant they were unassigned from
 * @param adminId - The admin who performed the unassignment
 */
export async function notifyAgentTenantUnassigned(agentId: string, tenantId: string, adminId: string): Promise<void> {
  try {
    logger.info(`[NotificationIntegration] Preparing AGENT_TENANT_UNASSIGNED for agent ${agentId}, tenant ${tenantId}`);

    // Fetch agent
    const agent = await prisma.user.findUnique({
      where: {
        id: agentId
      },
      select: {
        id: true,
        name: true
      }
    });

    // Fetch tenant
    const tenant = await prisma.user.findUnique({
      where: {
        id: tenantId
      },
      select: {
        id: true,
        name: true
      }
    });

    // Fetch admin
    const admin = await prisma.user.findUnique({
      where: {
        id: adminId
      },
      select: {
        id: true,
        name: true
      }
    });
    if (!agent || !tenant) {
      logger.warn(`[NotificationIntegration] Agent or tenant not found`);
      return;
    }

    // Find the assignment ID (may be deactivated now)
    const assignment = await prisma.agentTenantAssignment.findUnique({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId
        }
      },
      select: {
        id: true
      }
    });

    // Emit notification
    await notificationService.onAgentTenantUnassigned({
      assignmentId: assignment?.id || `${agentId}_${tenantId}`,
      agentId: agent.id,
      agentName: agent.name,
      tenantId: tenant.id,
      tenantName: tenant.name,
      unassignedBy: adminId,
      unassignedByName: admin?.name || 'Admin'
    });
    logger.info(`[NotificationIntegration] AGENT_TENANT_UNASSIGNED sent`);
  } catch (error: any) {
    logger.error(`[NotificationIntegration] Failed to notify AGENT_TENANT_UNASSIGNED:`, error);
  }
}

// ============================================================================
// PROPERTY NOTE NOTIFICATIONS
// ============================================================================

/**
 * NOTIFY: Property Note Created
 *
 * Call this AFTER PropertyNoteService.createPropertyNote() succeeds.
 *
 * @param noteId - The created note ID
 * @param propertyId - The property the note was added to
 * @param authorId - The user who created the note
 * @param authorRole - The role of the author (ADMIN or AGENT)
 */
export async function notifyPropertyNoteCreated(noteId: string, propertyId: string, authorId: string, authorRole: string): Promise<void> {
  try {
    logger.info(`[NotificationIntegration] Preparing PROPERTY_NOTE_CREATED for ${noteId}`);

    // Fetch note
    const note = await prisma.propertyNote.findUnique({
      where: {
        id: noteId
      },
      select: {
        id: true,
        content: true,
        author: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });
    if (!note) {
      logger.warn(`[NotificationIntegration] Note not found: ${noteId}`);
      return;
    }

    // Fetch property with owner
    const property = await prisma.room.findUnique({
      where: {
        id: propertyId
      },
      select: {
        id: true,
        title: true,
        city: true,
        owner: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    if (!property) {
      logger.warn(`[NotificationIntegration] Property not found: ${propertyId}`);
      return;
    }

    // Get assigned tenants
    const assignedTenantIds = await notificationService.getAssignedTenantsForProperty(propertyId);

    // Create preview (first 100 chars)
    const notePreview = note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content;

    // Emit notification
    await notificationService.onPropertyNoteCreated({
      noteId: note.id,
      propertyId: property.id,
      propertyTitle: property.title,
      propertyCity: property.city,
      ownerId: property.owner.id,
      ownerName: property.owner.name,
      authorId: note.author.id,
      authorName: note.author.name,
      authorRole: note.author.role,
      notePreview,
      assignedTenantIds
    });
    logger.info(`[NotificationIntegration] PROPERTY_NOTE_CREATED sent for ${noteId}`);
  } catch (error: any) {
    logger.error(`[NotificationIntegration] Failed to notify PROPERTY_NOTE_CREATED:`, error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const notificationIntegration = {
  notifyAgentPropertyAssigned,
  notifyAgentPropertyUnassigned,
  notifyAgentTenantAssigned,
  notifyAgentTenantUnassigned,
  notifyPropertyNoteCreated
};