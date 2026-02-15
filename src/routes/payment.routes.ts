import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { TenantSubscriptionService } from '../services/TenantSubscriptionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { tenantSubscriptionRepository, propertyViewRepository, paymentRepository, roomRepository } from '../repositories';
const router = Router();

/**
 * FIXED: Pass roomRepository to TenantSubscriptionService to eliminate runtime require()
 */
const subscriptionService = new TenantSubscriptionService(tenantSubscriptionRepository, propertyViewRepository, roomRepository);
const paymentController = new PaymentController(subscriptionService, paymentRepository);

// Create Razorpay order
router.post('/initiate', authMiddleware, (req, res, next) => paymentController.createOrder(req, res, next));

// Verify payment + activate subscription
router.post('/verify', authMiddleware, (req, res, next) => paymentController.verifyPayment(req, res, next));

// Payment history
router.get('/history', authMiddleware, (req, res, next) => paymentController.getPaymentHistory(req, res, next));
export default router;