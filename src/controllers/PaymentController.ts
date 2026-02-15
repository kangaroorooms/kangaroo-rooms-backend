import { Request, Response, NextFunction } from 'express';
import { TenantSubscriptionService } from '../services/TenantSubscriptionService';
import { PrismaPaymentRepository } from '../repositories/PrismaPaymentRepository';
import { RazorpayService } from '../services/RazorpayService';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { PaymentStatus } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { normalizeCity } from '../utils/normalize';

/**
 * PaymentController — MULTI-CITY ARCHITECTURE
 *
 * Payment verification uses composite upsert: tenantId_city.
 * Each payment activates a subscription for its specific city only.
 * Paying for Kota never overwrites Bangalore subscription.
 */
export class PaymentController {
  private subscriptionService: TenantSubscriptionService;
  private paymentRepository: PrismaPaymentRepository;
  private razorpayService: RazorpayService;
  constructor(subscriptionService: TenantSubscriptionService, paymentRepository: PrismaPaymentRepository) {
    this.subscriptionService = subscriptionService;
    this.paymentRepository = paymentRepository;
    this.razorpayService = new RazorpayService();

    // Bind all methods
    this.createOrder = this.createOrder.bind(this);
    this.verifyPayment = this.verifyPayment.bind(this);
    this.getPaymentHistory = this.getPaymentHistory.bind(this);
  }

  /**
   * POST /api/payments/initiate
   * Create Razorpay order + DB payment record
   */
  async createOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const {
        plan,
        city,
        amount
      } = req.body;
      if (!plan || !city) {
        return res.status(400).json({
          success: false,
          message: 'Plan and city are required'
        });
      }

      // Use subscription service to create order (handles pricing lookup + Razorpay)
      const orderData = await this.subscriptionService.createOrder({
        plan,
        city,
        amount: amount || 0
      });

      // Save payment record in DB
      const payment = await this.paymentRepository.create({
        tenantId: userId,
        orderId: orderData.orderId,
        amount: typeof orderData.amount === 'number' ? orderData.amount : parseInt(orderData.amount, 10),
        plan,
        city,
        status: PaymentStatus.CREATED
      });
      logger.info('Payment order created', {
        paymentId: payment.id,
        orderId: orderData.orderId
      });
      return res.status(201).json({
        success: true,
        data: {
          orderId: orderData.orderId,
          amount: orderData.amount,
          currency: orderData.currency,
          paymentId: payment.id
        }
      });
    } catch (error: any) {
      logger.error('Error creating payment order', {
        error: error.message
      });
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create payment order'
      });
    }
  }

  /**
   * POST /api/payments/verify
   * Verify Razorpay signature + activate subscription
   *
   * MULTI-CITY FIX: Uses composite upsert tenantId_city.
   * Payment for Kota creates/updates Kota subscription only.
   * Bangalore subscription remains untouched.
   */
  async verifyPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing payment verification parameters'
        });
      }

      // Step 1: Find payment record
      const payment = await this.paymentRepository.findByOrderId(razorpay_order_id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Step 2: Already verified — idempotent response
      if (payment.status === PaymentStatus.VERIFIED) {
        logger.warn('Payment already verified', {
          paymentId: payment.id
        });
        return res.json({
          success: true,
          message: 'Payment already verified',
          data: {
            payment
          }
        });
      }

      // Step 3: Verify Razorpay signature
      const isValid = this.razorpayService.verifyPayment({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      if (!isValid) {
        await this.paymentRepository.update(payment.id, {
          status: PaymentStatus.FAILED
        });
        logger.error('Payment signature verification failed', {
          paymentId: payment.id
        });
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        });
      }

      // Step 4: Mark as VERIFIED + upgrade subscription ATOMICALLY
      const prisma = getPrismaClient();
      const result = await prisma.$transaction(async (tx: any) => {
        // Re-read payment inside transaction with lock
        const lockedPayment = await tx.payment.findUnique({
          where: {
            id: payment.id
          }
        });
        if (!lockedPayment || lockedPayment.status === 'VERIFIED') {
          return {
            alreadyProcessed: true,
            payment: lockedPayment,
            subscription: null
          };
        }

        // Mark payment as VERIFIED
        const updatedPayment = await tx.payment.update({
          where: {
            id: payment.id
          },
          data: {
            status: PaymentStatus.VERIFIED,
            utr: razorpay_payment_id,
            verifiedAt: new Date()
          }
        });

        // Upgrade subscription INSIDE transaction — COMPOSITE UPSERT
        const PLAN_DURATION_DAYS: Record<string, number> = {
          FREE: 0,
          GOLD: 30,
          PLATINUM: 30
        };
        const normalizedPlan = payment.plan.toUpperCase();
        const normalizedCity = normalizeCity(payment.city);
        const durationDays = PLAN_DURATION_DAYS[normalizedPlan] || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        // MULTI-CITY: Upsert by tenantId + city composite key
        // This creates a NEW subscription row for this city if none exists,
        // or updates the existing one for this city.
        // Subscriptions for OTHER cities are never touched.
        const subscription = await tx.tenantSubscription.upsert({
          where: {
            tenantId_city: {
              tenantId: userId,
              city: normalizedCity
            }
          },
          create: {
            tenantId: userId,
            plan: normalizedPlan,
            city: normalizedCity,
            expiresAt
          },
          update: {
            plan: normalizedPlan,
            expiresAt
          }
        });
        return {
          alreadyProcessed: false,
          payment: updatedPayment,
          subscription
        };
      }, {
        isolationLevel: 'Serializable',
        timeout: 10000
      });
      if (result.alreadyProcessed) {
        return res.json({
          success: true,
          message: 'Payment already verified',
          data: {
            payment: result.payment
          }
        });
      }
      logger.info('Payment verified + subscription upgraded atomically', {
        paymentId: payment.id,
        subscriptionId: result.subscription?.id
      });
      return res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          payment: result.payment,
          subscription: result.subscription
        }
      });
    } catch (error: any) {
      logger.error('Error verifying payment', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment'
      });
    }
  }

  /**
   * GET /api/payments/history
   */
  async getPaymentHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const payments = await this.paymentRepository.findByTenantId(userId);
      return res.json({
        success: true,
        data: payments
      });
    } catch (error: any) {
      logger.error('Error fetching payment history', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  }
}