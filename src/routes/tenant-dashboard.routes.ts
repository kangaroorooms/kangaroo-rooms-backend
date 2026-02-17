import { Router } from 'express';
import { TenantDashboardController } from '../controllers/TenantDashboardController';
import { TenantDashboardService } from '../services/TenantDashboardService';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
const router = Router();

// Dependency injection
const dashboardService = new TenantDashboardService();
const controller = new TenantDashboardController(dashboardService);

/**
 * GET /tenant/dashboard
 *
 * SECURITY: authMiddleware + authorizeRoles(Role.TENANT)
 * Owners, agents, and admins CANNOT hit this endpoint.
 */
router.get('/dashboard', authMiddleware, authorizeRoles(Role.TENANT), (req, res, next) => controller.getDashboard(req as any, res, next));
export default router;