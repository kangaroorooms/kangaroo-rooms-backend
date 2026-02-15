import { Router } from 'express';
import { TenantSubscriptionController } from '../controllers/TenantSubscriptionController';
import { TenantSubscriptionService } from '../services/TenantSubscriptionService';
import { PlanLimitService } from '../services/PlanLimitService';
import { tenantSubscriptionRepository, propertyViewRepository, roomRepository } from '../repositories';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();

// Initialize services with singleton repository instances
const subscriptionService = new TenantSubscriptionService(tenantSubscriptionRepository, propertyViewRepository, roomRepository);
const planLimitService = new PlanLimitService();

// Initialize controller with both services
const controller = new TenantSubscriptionController(subscriptionService, planLimitService);

/**
 * ROUTES
 */

// GET /current - Get current subscription status
router.get('/current', authMiddleware, (req, res, next) => controller.getCurrent(req, res, next));

// GET /pricing?city=Jaipur - Get pricing for city
router.get('/pricing', (req, res, next) => controller.getPricing(req, res, next));

// POST /create-order - Create payment order
router.post('/create-order', authMiddleware, (req, res, next) => controller.createOrder(req, res, next));

// POST /upgrade - Upgrade subscription (after payment)
router.post('/upgrade', authMiddleware, (req, res, next) => controller.upgrade(req, res, next));

// POST /verify-payment - Verify payment
router.post('/verify-payment', authMiddleware, (req, res, next) => controller.verifyPayment(req, res, next));

// POST /track-view - Track property view (for FREE tier)
router.post('/track-view', authMiddleware, (req, res, next) => controller.trackView(req, res, next));

// GET /visibility?city=Jaipur&roomId=123 - Check access permissions
router.get('/visibility', authMiddleware, (req, res, next) => controller.getVisibility(req, res, next));
export default router;