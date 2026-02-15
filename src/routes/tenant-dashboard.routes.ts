import { Router } from 'express';
import { TenantDashboardController } from '../controllers/TenantDashboardController';
import { TenantDashboardService } from '../services/TenantDashboardService';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
const router = Router();

// Dependency injection
const dashboardService = new TenantDashboardService();
const controller = new TenantDashboardController(dashboardService);

/**
 * GET /tenant/dashboard
 *
 * SECURITY: authMiddleware + authorizeRoles('TENANT')
 * Owners, agents, and admins CANNOT hit this endpoint.
 */
router.get('/dashboard', authMiddleware, authorizeRoles('TENANT'), (req, res, next) => controller.getDashboard(req, res, next));
export default router;