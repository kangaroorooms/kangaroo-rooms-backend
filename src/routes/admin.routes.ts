import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { adminAssignmentController } from '../controllers/AdminAssignmentController';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';
const router = Router();
const adminController = new AdminController();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin);

// ============================================================================
// DASHBOARD
// ============================================================================

// Dashboard Stats
router.get('/stats', adminController.getStats);

// Activity Log
router.get('/activity', adminController.getActivity);

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// User Management
router.get('/users', adminController.getAllUsers);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.get('/tenants', adminController.getTenants);
router.get('/agents', adminController.getAgents);

// ============================================================================
// PROPERTY MANAGEMENT
// ============================================================================

// Property Management
router.get('/properties', adminController.getAllProperties);
router.patch('/properties/:id/approve', adminController.approveProperty);
router.patch('/properties/:id/reject', adminController.rejectProperty);
router.patch('/properties/:id/needs-correction', adminController.requestCorrection);
router.patch('/properties/:id/suspend', adminController.suspendProperty);

// ============================================================================
// AGENT ASSIGNMENT MANAGEMENT (NEW)
// ============================================================================

// Property Assignments
// POST   /api/admin/agents/:agentId/properties/:propertyId - Assign property to agent
// DELETE /api/admin/agents/:agentId/properties/:propertyId - Unassign property from agent
router.post('/agents/:agentId/properties/:propertyId', adminAssignmentController.assignPropertyToAgent);
router.delete('/agents/:agentId/properties/:propertyId', adminAssignmentController.unassignPropertyFromAgent);

// Tenant Assignments
// POST   /api/admin/agents/:agentId/tenants/:tenantId - Assign tenant to agent
// DELETE /api/admin/agents/:agentId/tenants/:tenantId - Unassign tenant from agent
router.post('/agents/:agentId/tenants/:tenantId', adminAssignmentController.assignTenantToAgent);
router.delete('/agents/:agentId/tenants/:tenantId', adminAssignmentController.unassignTenantFromAgent);

// Assignment Lists (for admin dashboard)
// GET /api/admin/assignments/properties - List all property assignments
// GET /api/admin/assignments/tenants    - List all tenant assignments
router.get('/assignments/properties', adminAssignmentController.getPropertyAssignments);
router.get('/assignments/tenants', adminAssignmentController.getTenantAssignments);
export default router;