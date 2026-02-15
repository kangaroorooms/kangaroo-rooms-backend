import { getPrismaClient } from '../utils/prisma';
import { Role } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * AdminAssignmentService - ADMIN-ONLY Assignment Management
 *
 * CRITICAL SAFETY RULES:
 * ✅ ADMIN role required (enforced at route level)
 * ✅ Soft delete only (isActive = false)
 * ✅ Re-activation of existing assignments
 * ✅ Role validation (agentId → AGENT, tenantId → TENANT)
 * ✅ Auditability (assignedBy tracked)
 * ❌ NO hard deletes
 * ❌ NO booking access
 * ❌ NO payment access
 */

const prisma = getPrismaClient();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AssignmentResult {
  id: string;
  agentId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  assignedBy: string;
  reactivated: boolean;
}
export interface PropertyAssignmentResult extends AssignmentResult {
  propertyId: string;
  assignmentNotes: string | null;
  property: {
    id: string;
    title: string;
    city: string;
  };
  agent: {
    id: string;
    name: string;
    email: string;
  };
}
export interface TenantAssignmentResult extends AssignmentResult {
  tenantId: string;
  reason: string | null;
  tenant: {
    id: string;
    name: string;
    email: string;
  };
  agent: {
    id: string;
    name: string;
    email: string;
  };
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class AdminAssignmentService {
  constructor() {
    // Bind methods to preserve 'this' context
    this.assignPropertyToAgent = this.assignPropertyToAgent.bind(this);
    this.unassignPropertyFromAgent = this.unassignPropertyFromAgent.bind(this);
    this.assignTenantToAgent = this.assignTenantToAgent.bind(this);
    this.unassignTenantFromAgent = this.unassignTenantFromAgent.bind(this);
    this.getPropertyAssignments = this.getPropertyAssignments.bind(this);
    this.getTenantAssignments = this.getTenantAssignments.bind(this);
  }

  // ==========================================================================
  // PROPERTY ASSIGNMENTS
  // ==========================================================================

  /**
   * ASSIGN PROPERTY TO AGENT
   *
   * Creates a new assignment or reactivates an existing inactive one.
   *
   * @param agentId - User ID (must have AGENT role)
   * @param propertyId - Room ID
   * @param assignedBy - Admin user ID performing the assignment
   * @param notes - Optional assignment notes
   *
   * VALIDATION:
   * - agentId must exist and have AGENT role
   * - propertyId must exist
   * - If active assignment exists, returns it (idempotent)
   * - If inactive assignment exists, reactivates it
   *
   * AUDITABILITY:
   * - assignedBy is recorded
   * - createdAt/updatedAt timestamps maintained
   * - deactivatedAt cleared on reactivation
   */
  async assignPropertyToAgent(agentId: string, propertyId: string, assignedBy: string, notes?: string): Promise<PropertyAssignmentResult> {
    logger.info(`[AdminAssignmentService] Assigning property ${propertyId} to agent ${agentId}`);

    // STEP 1: Validate agent exists and has AGENT role
    const agent = await prisma.user.findUnique({
      where: {
        id: agentId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${agentId}`);
    }
    if (agent.role !== Role.AGENT) {
      throw new ValidationError(`User ${agentId} is not an AGENT (role: ${agent.role})`);
    }

    // STEP 2: Validate property exists
    const property = await prisma.room.findUnique({
      where: {
        id: propertyId
      },
      select: {
        id: true,
        title: true,
        city: true
      }
    });
    if (!property) {
      throw new NotFoundError(`Property not found: ${propertyId}`);
    }

    // STEP 3: Check for existing assignment (active or inactive)
    const existingAssignment = await prisma.agentPropertyAssignment.findUnique({
      where: {
        agentId_propertyId: {
          agentId,
          propertyId
        }
      }
    });
    let assignment;
    let reactivated = false;
    if (existingAssignment) {
      if (existingAssignment.isActive) {
        // Already active - return existing (idempotent)
        logger.info(`[AdminAssignmentService] Assignment already exists and is active`);
        assignment = existingAssignment;
      } else {
        // Reactivate inactive assignment
        logger.info(`[AdminAssignmentService] Reactivating inactive assignment`);
        assignment = await prisma.agentPropertyAssignment.update({
          where: {
            id: existingAssignment.id
          },
          data: {
            isActive: true,
            deactivatedAt: null,
            assignedBy: assignedBy,
            // Update who reactivated
            assignmentNotes: notes || existingAssignment.assignmentNotes
          }
        });
        reactivated = true;
      }
    } else {
      // Create new assignment
      logger.info(`[AdminAssignmentService] Creating new assignment`);
      assignment = await prisma.agentPropertyAssignment.create({
        data: {
          agentId,
          propertyId,
          assignedBy,
          assignmentNotes: notes || null,
          isActive: true
        }
      });
    }
    logger.info(`[AdminAssignmentService] Property assignment complete: ${assignment.id}`);
    return {
      id: assignment.id,
      agentId: assignment.agentId,
      propertyId: assignment.propertyId,
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      assignedBy: assignment.assignedBy,
      assignmentNotes: assignment.assignmentNotes,
      reactivated,
      property: {
        id: property.id,
        title: property.title,
        city: property.city
      },
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email
      }
    };
  }

  /**
   * UNASSIGN PROPERTY FROM AGENT
   *
   * Soft-deletes an assignment by setting isActive = false.
   *
   * @param agentId - User ID
   * @param propertyId - Room ID
   *
   * SAFETY:
   * - NO hard delete - only sets isActive = false
   * - Records deactivatedAt timestamp
   * - Idempotent - returns success even if already inactive
   */
  async unassignPropertyFromAgent(agentId: string, propertyId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    logger.info(`[AdminAssignmentService] Unassigning property ${propertyId} from agent ${agentId}`);

    // Find existing assignment
    const existingAssignment = await prisma.agentPropertyAssignment.findUnique({
      where: {
        agentId_propertyId: {
          agentId,
          propertyId
        }
      }
    });
    if (!existingAssignment) {
      throw new NotFoundError(`Assignment not found for agent ${agentId} and property ${propertyId}`);
    }
    if (!existingAssignment.isActive) {
      // Already inactive - idempotent success
      logger.info(`[AdminAssignmentService] Assignment already inactive`);
      return {
        success: true,
        message: 'Assignment already inactive'
      };
    }

    // Soft delete - set isActive = false
    await prisma.agentPropertyAssignment.update({
      where: {
        id: existingAssignment.id
      },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });
    logger.info(`[AdminAssignmentService] Property assignment deactivated: ${existingAssignment.id}`);
    return {
      success: true,
      message: 'Assignment deactivated successfully'
    };
  }

  // ==========================================================================
  // TENANT ASSIGNMENTS
  // ==========================================================================

  /**
   * ASSIGN TENANT TO AGENT
   *
   * Creates a new assignment or reactivates an existing inactive one.
   *
   * @param agentId - User ID (must have AGENT role)
   * @param tenantId - User ID (must have TENANT role)
   * @param assignedBy - Admin user ID performing the assignment
   * @param reason - Optional reason for assignment
   *
   * VALIDATION:
   * - agentId must exist and have AGENT role
   * - tenantId must exist and have TENANT role
   * - If active assignment exists, returns it (idempotent)
   * - If inactive assignment exists, reactivates it
   */
  async assignTenantToAgent(agentId: string, tenantId: string, assignedBy: string, reason?: string): Promise<TenantAssignmentResult> {
    logger.info(`[AdminAssignmentService] Assigning tenant ${tenantId} to agent ${agentId}`);

    // STEP 1: Validate agent exists and has AGENT role
    const agent = await prisma.user.findUnique({
      where: {
        id: agentId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${agentId}`);
    }
    if (agent.role !== Role.AGENT) {
      throw new ValidationError(`User ${agentId} is not an AGENT (role: ${agent.role})`);
    }

    // STEP 2: Validate tenant exists and has TENANT role
    const tenant = await prisma.user.findUnique({
      where: {
        id: tenantId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${tenantId}`);
    }
    if (tenant.role !== Role.TENANT) {
      throw new ValidationError(`User ${tenantId} is not a TENANT (role: ${tenant.role})`);
    }

    // STEP 3: Check for existing assignment (active or inactive)
    const existingAssignment = await prisma.agentTenantAssignment.findUnique({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId
        }
      }
    });
    let assignment;
    let reactivated = false;
    if (existingAssignment) {
      if (existingAssignment.isActive) {
        // Already active - return existing (idempotent)
        logger.info(`[AdminAssignmentService] Assignment already exists and is active`);
        assignment = existingAssignment;
      } else {
        // Reactivate inactive assignment
        logger.info(`[AdminAssignmentService] Reactivating inactive assignment`);
        assignment = await prisma.agentTenantAssignment.update({
          where: {
            id: existingAssignment.id
          },
          data: {
            isActive: true,
            deactivatedAt: null,
            assignedBy: assignedBy,
            // Update who reactivated
            reason: reason || existingAssignment.reason
          }
        });
        reactivated = true;
      }
    } else {
      // Create new assignment
      logger.info(`[AdminAssignmentService] Creating new assignment`);
      assignment = await prisma.agentTenantAssignment.create({
        data: {
          agentId,
          tenantId,
          assignedBy,
          reason: reason || null,
          isActive: true
        }
      });
    }
    logger.info(`[AdminAssignmentService] Tenant assignment complete: ${assignment.id}`);
    return {
      id: assignment.id,
      agentId: assignment.agentId,
      tenantId: assignment.tenantId,
      isActive: assignment.isActive,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      assignedBy: assignment.assignedBy,
      reason: assignment.reason,
      reactivated,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email
      },
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email
      }
    };
  }

  /**
   * UNASSIGN TENANT FROM AGENT
   *
   * Soft-deletes an assignment by setting isActive = false.
   *
   * @param agentId - User ID
   * @param tenantId - User ID
   *
   * SAFETY:
   * - NO hard delete - only sets isActive = false
   * - Records deactivatedAt timestamp
   * - Idempotent - returns success even if already inactive
   */
  async unassignTenantFromAgent(agentId: string, tenantId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    logger.info(`[AdminAssignmentService] Unassigning tenant ${tenantId} from agent ${agentId}`);

    // Find existing assignment
    const existingAssignment = await prisma.agentTenantAssignment.findUnique({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId
        }
      }
    });
    if (!existingAssignment) {
      throw new NotFoundError(`Assignment not found for agent ${agentId} and tenant ${tenantId}`);
    }
    if (!existingAssignment.isActive) {
      // Already inactive - idempotent success
      logger.info(`[AdminAssignmentService] Assignment already inactive`);
      return {
        success: true,
        message: 'Assignment already inactive'
      };
    }

    // Soft delete - set isActive = false
    await prisma.agentTenantAssignment.update({
      where: {
        id: existingAssignment.id
      },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });
    logger.info(`[AdminAssignmentService] Tenant assignment deactivated: ${existingAssignment.id}`);
    return {
      success: true,
      message: 'Assignment deactivated successfully'
    };
  }

  // ==========================================================================
  // READ OPERATIONS (for admin dashboard)
  // ==========================================================================

  /**
   * GET ALL PROPERTY ASSIGNMENTS
   *
   * Returns all property assignments (active and inactive) for admin view.
   */
  async getPropertyAssignments(filters?: {
    agentId?: string;
    propertyId?: string;
    isActive?: boolean;
  }) {
    const where: any = {};
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.propertyId) where.propertyId = filters.propertyId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    const assignments = await prisma.agentPropertyAssignment.findMany({
      where,
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
            location: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return assignments;
  }

  /**
   * GET ALL TENANT ASSIGNMENTS
   *
   * Returns all tenant assignments (active and inactive) for admin view.
   */
  async getTenantAssignments(filters?: {
    agentId?: string;
    tenantId?: string;
    isActive?: boolean;
  }) {
    const where: any = {};
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    const assignments = await prisma.agentTenantAssignment.findMany({
      where,
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
            email: true,
            phone: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return assignments;
  }
}

// Export singleton instance
export const adminAssignmentService = new AdminAssignmentService();