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
router.get('/stats', (req, res, next) => adminController.getStats(req as any, res));

// Activity Log
router.get('/activity', (req, res, next) => adminController.getActivity(req as any, res));

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// User Management
router.get('/users', (req, res, next) => adminController.getAllUsers(req as any, res));
router.patch('/users/:userId/status', (req, res, next) => adminController.updateUserStatus(req as any, res));
router.get('/tenants', (req, res, next) => adminController.getTenants(req as any, res));
router.get('/agents', (req, res, next) => adminController.getAgents(req as any, res));

// ============================================================================
// PROPERTY MANAGEMENT
// ============================================================================

// Property Management
router.get('/properties', (req, res, next) => adminController.getAllProperties(req as any, res));
router.patch('/properties/:id/approve', (req, res, next) => adminController.approveProperty(req as any, res));
router.patch('/properties/:id/reject', (req, res, next) => adminController.rejectProperty(req as any, res));
router.patch('/properties/:id/needs-correction', (req, res, next) => adminController.requestCorrection(req as any, res));
router.patch('/properties/:id/suspend', (req, res, next) => adminController.suspendProperty(req as any, res));

// ============================================================================
// AGENT ASSIGNMENT MANAGEMENT (NEW)
// ============================================================================

// Property Assignments
router.post('/agents/:agentId/properties/:propertyId', (req, res, next) => adminAssignmentController.assignPropertyToAgent(req as any, res));
router.delete('/agents/:agentId/properties/:propertyId', (req, res, next) => adminAssignmentController.unassignPropertyFromAgent(req as any, res));

// Tenant Assignments
router.post('/agents/:agentId/tenants/:tenantId', (req, res, next) => adminAssignmentController.assignTenantToAgent(req as any, res));
router.delete('/agents/:agentId/tenants/:tenantId', (req, res, next) => adminAssignmentController.unassignTenantFromAgent(req as any, res));

// Assignment Lists (for admin dashboard)
router.get('/assignments/properties', (req, res, next) => adminAssignmentController.getPropertyAssignments(req as any, res));
router.get('/assignments/tenants', (req, res, next) => adminAssignmentController.getTenantAssignments(req as any, res));
export default router;