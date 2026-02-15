import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';

/**
 * AgentService - READ-ONLY Service for Agent Role
 *
 * CRITICAL SAFETY RULES:
 * ❌ NO write operations (create, update, delete)
 * ❌ NO access to Booking table
 * ❌ NO access to Payment table
 * ❌ NO access to TenantSubscription table
 * ❌ NO review status mutations
 * ✅ READ-ONLY access to assigned properties
 * ✅ READ-ONLY access to assigned tenants
 *
 * All queries filter by agentId to ensure agents only see their own assignments.
 */

const prisma = getPrismaClient();

// ============================================================================
// TYPE DEFINITIONS (Response DTOs)
// ============================================================================

/**
 * Property data visible to agents
 * Intentionally excludes: bookings, payments, sensitive owner data
 */
export interface AgentPropertyView {
  id: string;
  title: string;
  city: string;
  location: string;
  landmark: string;
  pricePerMonth: number;
  roomType: string;
  reviewStatus: string;
  isActive: boolean;
  images: string[];
  createdAt: Date;
  // Owner info (minimal, non-sensitive)
  owner: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  // Assignment metadata
  assignment: {
    id: string;
    assignmentNotes: string | null;
    assignedAt: Date;
    isActive: boolean;
  };
}

/**
 * Tenant data visible to agents
 * Intentionally excludes: bookings, payments, subscriptions
 */
export interface AgentTenantView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  createdAt: Date;
  // Assignment metadata
  assignment: {
    id: string;
    reason: string | null;
    assignedAt: Date;
    isActive: boolean;
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class AgentService {
  constructor() {
    // Bind methods to preserve 'this' context
    this.getAssignedProperties = this.getAssignedProperties.bind(this);
    this.getAssignedTenants = this.getAssignedTenants.bind(this);
  }

  /**
   * GET ASSIGNED PROPERTIES
   *
   * Fetches all properties assigned to a specific agent.
   *
   * @param agentId - The authenticated agent's user ID
   * @returns Array of properties with owner info and assignment metadata
   *
   * SECURITY:
   * - Filters by agentId (agent sees only their assignments)
   * - Filters by isActive=true (only active assignments)
   * - NO include on bookings (blocked)
   * - NO include on payments (blocked)
   * - Returns empty array if no assignments (no error thrown)
   */
  async getAssignedProperties(agentId: string): Promise<AgentPropertyView[]> {
    logger.info(`[AgentService] Fetching properties for agent: ${agentId}`);
    try {
      // Query assignments with property and owner data
      // CRITICAL: No include on bookings or payments
      const assignments = await prisma.agentPropertyAssignment.findMany({
        where: {
          agentId: agentId,
          isActive: true
        },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              location: true,
              landmark: true,
              pricePerMonth: true,
              roomType: true,
              reviewStatus: true,
              isActive: true,
              images: true,
              createdAt: true,
              // Owner info (minimal)
              owner: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true
                }
              }
              // ❌ NO bookings - intentionally excluded
              // ❌ NO payments - not on Room model anyway
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Transform to response DTO
      const properties: AgentPropertyView[] = assignments.map((assignment) => ({
        id: assignment.property.id,
        title: assignment.property.title,
        city: assignment.property.city,
        location: assignment.property.location,
        landmark: assignment.property.landmark,
        pricePerMonth: assignment.property.pricePerMonth,
        roomType: assignment.property.roomType,
        reviewStatus: assignment.property.reviewStatus.toLowerCase(),
        isActive: assignment.property.isActive,
        images: assignment.property.images,
        createdAt: assignment.property.createdAt,
        owner: {
          id: assignment.property.owner.id,
          name: assignment.property.owner.name,
          email: assignment.property.owner.email,
          phone: assignment.property.owner.phone
        },
        assignment: {
          id: assignment.id,
          assignmentNotes: assignment.assignmentNotes,
          assignedAt: assignment.createdAt,
          isActive: assignment.isActive
        }
      }));
      logger.info(`[AgentService] Found ${properties.length} assigned properties for agent: ${agentId}`);
      return properties;
    } catch (error: any) {
      logger.error(`[AgentService] Error fetching properties for agent ${agentId}:`, error);
      throw new Error('Failed to fetch assigned properties');
    }
  }

  /**
   * GET ASSIGNED TENANTS
   *
   * Fetches all tenants assigned to a specific agent.
   *
   * @param agentId - The authenticated agent's user ID
   * @returns Array of tenants with assignment metadata
   *
   * SECURITY:
   * - Filters by agentId (agent sees only their assignments)
   * - Filters by isActive=true (only active assignments)
   * - NO include on bookings (blocked)
   * - NO include on payments (blocked)
   * - NO include on tenantSubscription (blocked)
   * - Returns empty array if no assignments (no error thrown)
   */
  async getAssignedTenants(agentId: string): Promise<AgentTenantView[]> {
    logger.info(`[AgentService] Fetching tenants for agent: ${agentId}`);
    try {
      // Query assignments with tenant data
      // CRITICAL: No include on bookings, payments, or subscriptions
      const assignments = await prisma.agentTenantAssignment.findMany({
        where: {
          agentId: agentId,
          isActive: true
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              city: true,
              createdAt: true
              // ❌ NO bookings - intentionally excluded
              // ❌ NO tenantSubscription - intentionally excluded
              // ❌ NO ownedBookings - intentionally excluded
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Transform to response DTO
      const tenants: AgentTenantView[] = assignments.map((assignment) => ({
        id: assignment.tenant.id,
        name: assignment.tenant.name,
        email: assignment.tenant.email,
        phone: assignment.tenant.phone,
        city: assignment.tenant.city,
        createdAt: assignment.tenant.createdAt,
        assignment: {
          id: assignment.id,
          reason: assignment.reason,
          assignedAt: assignment.createdAt,
          isActive: assignment.isActive
        }
      }));
      logger.info(`[AgentService] Found ${tenants.length} assigned tenants for agent: ${agentId}`);
      return tenants;
    } catch (error: any) {
      logger.error(`[AgentService] Error fetching tenants for agent ${agentId}:`, error);
      throw new Error('Failed to fetch assigned tenants');
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();