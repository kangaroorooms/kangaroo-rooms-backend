import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { adminAssignmentService, ValidationError, NotFoundError } from '../services/AdminAssignmentService';
import { logger } from '../utils/logger';

/**
 * AdminAssignmentController - ADMIN-ONLY Assignment Management
 *
 * CRITICAL SAFETY RULES:
 * ✅ All routes require ADMIN role (enforced at route level)
 * ✅ Soft delete only (no hard deletes)
 * ✅ Full audit trail via assignedBy
 * ❌ NO booking access
 * ❌ NO payment access
 *
 * ENDPOINTS:
 * - POST   /api/admin/agents/:agentId/properties/:propertyId  (assign property)
 * - DELETE /api/admin/agents/:agentId/properties/:propertyId  (unassign property)
 * - POST   /api/admin/agents/:agentId/tenants/:tenantId       (assign tenant)
 * - DELETE /api/admin/agents/:agentId/tenants/:tenantId       (unassign tenant)
 * - GET    /api/admin/assignments/properties                   (list property assignments)
 * - GET    /api/admin/assignments/tenants                      (list tenant assignments)
 */
export class AdminAssignmentController {
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
  // PROPERTY ASSIGNMENT ENDPOINTS
  // ==========================================================================

  /**
   * POST /api/admin/agents/:agentId/properties/:propertyId
   *
   * Assign a property to an agent.
   *
   * Path Params:
   * - agentId: User ID (must be AGENT role)
   * - propertyId: Room ID
   *
   * Body (optional):
   * - notes: Assignment notes
   *
   * Response:
   * - 200/201: Assignment created/reactivated
   * - 400: Validation error (wrong role)
   * - 404: Agent or property not found
   * - 500: Server error
   */
  async assignPropertyToAgent(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        propertyId
      } = req.params;
      const {
        notes
      } = req.body || {};
      const adminId = req.user?.userId;
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[AdminAssignmentController] POST /agents/${agentId}/properties/${propertyId} by admin ${adminId}`);
      const result = await adminAssignmentService.assignPropertyToAgent(agentId, propertyId, adminId, notes);
      const statusCode = result.reactivated ? 200 : 201;
      const message = result.reactivated ? 'Property assignment reactivated' : 'Property assigned to agent';
      return res.status(statusCode).json({
        success: true,
        data: result,
        message
      });
    } catch (error: any) {
      return this.handleError(res, error, 'assign property to agent');
    }
  }

  /**
   * DELETE /api/admin/agents/:agentId/properties/:propertyId
   *
   * Unassign a property from an agent (soft delete).
   *
   * Path Params:
   * - agentId: User ID
   * - propertyId: Room ID
   *
   * Response:
   * - 200: Assignment deactivated
   * - 404: Assignment not found
   * - 500: Server error
   */
  async unassignPropertyFromAgent(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        propertyId
      } = req.params;
      const adminId = req.user?.userId;
      logger.info(`[AdminAssignmentController] DELETE /agents/${agentId}/properties/${propertyId} by admin ${adminId}`);
      const result = await adminAssignmentService.unassignPropertyFromAgent(agentId, propertyId);
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      return this.handleError(res, error, 'unassign property from agent');
    }
  }

  // ==========================================================================
  // TENANT ASSIGNMENT ENDPOINTS
  // ==========================================================================

  /**
   * POST /api/admin/agents/:agentId/tenants/:tenantId
   *
   * Assign a tenant to an agent.
   *
   * Path Params:
   * - agentId: User ID (must be AGENT role)
   * - tenantId: User ID (must be TENANT role)
   *
   * Body (optional):
   * - reason: Reason for assignment
   *
   * Response:
   * - 200/201: Assignment created/reactivated
   * - 400: Validation error (wrong role)
   * - 404: Agent or tenant not found
   * - 500: Server error
   */
  async assignTenantToAgent(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        tenantId
      } = req.params;
      const {
        reason
      } = req.body || {};
      const adminId = req.user?.userId;
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[AdminAssignmentController] POST /agents/${agentId}/tenants/${tenantId} by admin ${adminId}`);
      const result = await adminAssignmentService.assignTenantToAgent(agentId, tenantId, adminId, reason);
      const statusCode = result.reactivated ? 200 : 201;
      const message = result.reactivated ? 'Tenant assignment reactivated' : 'Tenant assigned to agent';
      return res.status(statusCode).json({
        success: true,
        data: result,
        message
      });
    } catch (error: any) {
      return this.handleError(res, error, 'assign tenant to agent');
    }
  }

  /**
   * DELETE /api/admin/agents/:agentId/tenants/:tenantId
   *
   * Unassign a tenant from an agent (soft delete).
   *
   * Path Params:
   * - agentId: User ID
   * - tenantId: User ID
   *
   * Response:
   * - 200: Assignment deactivated
   * - 404: Assignment not found
   * - 500: Server error
   */
  async unassignTenantFromAgent(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        tenantId
      } = req.params;
      const adminId = req.user?.userId;
      logger.info(`[AdminAssignmentController] DELETE /agents/${agentId}/tenants/${tenantId} by admin ${adminId}`);
      const result = await adminAssignmentService.unassignTenantFromAgent(agentId, tenantId);
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      return this.handleError(res, error, 'unassign tenant from agent');
    }
  }

  // ==========================================================================
  // LIST ENDPOINTS (for admin dashboard)
  // ==========================================================================

  /**
   * GET /api/admin/assignments/properties
   *
   * List all property assignments with optional filters.
   *
   * Query Params:
   * - agentId: Filter by agent
   * - propertyId: Filter by property
   * - isActive: Filter by active status (true/false)
   */
  async getPropertyAssignments(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        propertyId,
        isActive
      } = req.query;
      logger.info(`[AdminAssignmentController] GET /assignments/properties`);
      const filters: any = {};
      if (agentId) filters.agentId = agentId as string;
      if (propertyId) filters.propertyId = propertyId as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      const assignments = await adminAssignmentService.getPropertyAssignments(filters);
      return res.status(200).json({
        success: true,
        data: assignments,
        meta: {
          total: assignments.length
        }
      });
    } catch (error: any) {
      return this.handleError(res, error, 'fetch property assignments');
    }
  }

  /**
   * GET /api/admin/assignments/tenants
   *
   * List all tenant assignments with optional filters.
   *
   * Query Params:
   * - agentId: Filter by agent
   * - tenantId: Filter by tenant
   * - isActive: Filter by active status (true/false)
   */
  async getTenantAssignments(req: AuthRequest, res: Response) {
    try {
      const {
        agentId,
        tenantId,
        isActive
      } = req.query;
      logger.info(`[AdminAssignmentController] GET /assignments/tenants`);
      const filters: any = {};
      if (agentId) filters.agentId = agentId as string;
      if (tenantId) filters.tenantId = tenantId as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      const assignments = await adminAssignmentService.getTenantAssignments(filters);
      return res.status(200).json({
        success: true,
        data: assignments,
        meta: {
          total: assignments.length
        }
      });
    } catch (error: any) {
      return this.handleError(res, error, 'fetch tenant assignments');
    }
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  private handleError(res: Response, error: any, operation: string) {
    logger.error(`[AdminAssignmentController] Error in ${operation}:`, error);
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to ${operation}`
    });
  }
}

// Export singleton instance
export const adminAssignmentController = new AdminAssignmentController();