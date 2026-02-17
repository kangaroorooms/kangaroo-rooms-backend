import { Response } from 'express';
import { TenantSubscriptionService } from '../services/TenantSubscriptionService';
import { PlanLimitService } from '../services/PlanLimitService';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { normalizeCity } from '../utils/normalize';
import { getPrismaClient } from '../utils/prisma';
export class TenantSubscriptionController {
  private planLimitService: PlanLimitService;
  constructor(private subscriptionService: TenantSubscriptionService, planLimitService?: PlanLimitService) {
    this.planLimitService = planLimitService || new PlanLimitService();
    // Bind all methods to preserve 'this' context
    this.getCurrent = this.getCurrent.bind(this);
    this.getPricing = this.getPricing.bind(this);
    this.createOrder = this.createOrder.bind(this);
    this.upgrade = this.upgrade.bind(this);
    this.verifyPayment = this.verifyPayment.bind(this);
    this.trackView = this.trackView.bind(this);
    this.getVisibility = this.getVisibility.bind(this);
  }

  /**
   * GET /current - Get current user subscriptions (all cities)
   */
  async getCurrent(req: AuthRequest, res: Response, next: any) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const subscriptions = await this.subscriptionService.getUserSubscriptions(userId);

      // Return all city subscriptions.
      // If none exist, return a single FREE placeholder for backward compatibility.
      if (subscriptions.length === 0) {
        return res.json({
          success: true,
          data: {
            plan: 'FREE',
            city: null,
            viewCount: 0,
            viewLimit: 10,
            canViewContact: false,
            canViewMap: false,
            hasCallSupport: false
          }
        });
      }

      // Return all subscriptions (multi-city)
      res.json({
        success: true,
        data: subscriptions
      });
    } catch (error: any) {
      logger.error('Error in getCurrent', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * GET /pricing?city=bangalore - Get pricing for city
   * ✅ PART 3: Implement getPricing method
   */
  async getPricing(req: AuthRequest, res: Response, next: any) {
    try {
      const {
        city
      } = req.query;

      // ✅ FIXED: Comprehensive city validation - reject undefined, null, empty
      if (!city || typeof city !== 'string' || city === 'undefined' || city === 'null' || city.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'City is required and must be a valid string'
        });
      }
      const normalizedCity = normalizeCity(city);
      const pricing = await this.subscriptionService.getPricing(normalizedCity);
      res.json({
        success: true,
        data: pricing
      });
    } catch (error: any) {
      logger.error('Error in getPricing', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * POST /create-order - Create payment order
   * ✅ PART 3: Implement createOrder method
   */
  async createOrder(req: AuthRequest, res: Response, next: any) {
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
        city
      } = req.body;

      // ✅ PART 2: Validate parameters
      if (!plan || !city) {
        return res.status(400).json({
          success: false,
          message: 'Plan and city are required'
        });
      }

      // ✅ PART 2: Validate plan is not FREE
      if (plan === 'FREE') {
        return res.status(400).json({
          success: false,
          message: 'FREE plan does not require payment'
        });
      }
      const normalizedCity = normalizeCity(city);
      const orderData = await this.subscriptionService.createOrder({
        plan,
        city: normalizedCity,
        amount: 0 // Service will calculate from pricing
      });
      res.json({
        success: true,
        data: orderData
      });
    } catch (error: any) {
      logger.error('Error in createOrder', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * POST /upgrade - Upgrade subscription after payment
   * ✅ PART 3: Implement upgrade method
   */
  async upgrade(req: AuthRequest, res: Response, next: any) {
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
        razorpay_payment_id
      } = req.body;

      // ✅ PART 2: Validate parameters
      if (!plan || !city) {
        return res.status(400).json({
          success: false,
          message: 'Plan and city are required'
        });
      }

      // ✅ SECURITY FIX: Require payment verification for paid plans
      if (plan.toUpperCase() !== 'FREE') {
        if (!razorpay_payment_id) {
          return res.status(400).json({
            success: false,
            message: 'Payment verification required. razorpay_payment_id is missing.'
          });
        }

        // Verify payment exists and is VERIFIED in database
        const prisma = getPrismaClient();
        const payment = await prisma.payment.findFirst({
          where: {
            razorpayPaymentId: razorpay_payment_id,
            status: 'VERIFIED'
          }
        });
        if (!payment) {
          return res.status(400).json({
            success: false,
            message: 'Payment verification required. Payment not found or not verified.'
          });
        }
      }
      const normalizedCity = normalizeCity(city);
      const subscription = await this.subscriptionService.upgradeSubscription({
        userId,
        plan,
        city: normalizedCity,
        paymentId: razorpay_payment_id
      });
      res.json({
        success: true,
        data: subscription,
        message: 'Subscription upgraded successfully'
      });
    } catch (error: any) {
      logger.error('Error in upgrade', {
        error: error.message
      });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * POST /verify-payment - Verify Razorpay payment
   * ✅ PART 3: Implement verifyPayment method
   */
  async verifyPayment(req: AuthRequest, res: Response, next: any) {
    try {
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
      const result = await this.subscriptionService.verifyPayment({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error in verifyPayment', {
        error: error.message
      });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * POST /track-view - Track property view (for FREE tier)
   * ✅ PART 3: Implement trackView method
   */
  async trackView(req: AuthRequest, res: Response, next: any) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const {
        propertyId
      } = req.body;
      if (!propertyId) {
        return res.status(400).json({
          success: false,
          message: 'Property ID is required'
        });
      }
      await this.subscriptionService.trackPropertyView(userId, propertyId);
      res.json({
        success: true,
        message: 'Property view tracked'
      });
    } catch (error: any) {
      logger.error('Error in trackView', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * GET /visibility?city=bangalore&roomId=123 - Check access permissions
   * ✅ FIXED: Uses database-driven PlanLimitService instead of hardcoded 10
   * ✅ FIXED: Enforces subscription expiry (expired → FREE)
   * ✅ FIXED: Now returns per-property isUnlocked flag via hasUserViewedProperty
   */
  async getVisibility(req: AuthRequest, res: Response, next: any) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const {
        city,
        roomId
      } = req.query;

      // ✅ PART 2: Validate parameters
      if (!city || typeof city !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'City is required'
        });
      }
      const normalizedCity = normalizeCity(city);

      // Get user's subscription for this city
      const subscription = await this.subscriptionService.getSubscriptionByCity(userId, normalizedCity);

      // ✅ FIX: Enforce expiry — expired subscription → treat as FREE
      let effectivePlan = 'FREE';
      if (subscription) {
        const now = new Date();
        const isExpired = subscription.expiresAt && new Date(subscription.expiresAt) <= now;
        if (!isExpired) {
          effectivePlan = subscription.plan.toUpperCase();
        }
      }

      // ✅ FIX: Get limit from database instead of hardcoded 10
      const limit = await this.planLimitService.getEffectiveLimit(effectivePlan, normalizedCity);

      // Get view count for limit enforcement
      const viewCount = await this.subscriptionService.getUniquePropertyCountByCity(userId, normalizedCity);

      // Determine permissions based on effective plan and database limit
      const isUnlimited = limit === null;
      const canViewContact = isUnlimited || viewCount < limit;
      const canViewMap = effectivePlan === 'GOLD' || effectivePlan === 'PLATINUM';
      const hasCallSupport = effectivePlan === 'PLATINUM';

      // ✅ NEW: Per-property unlock check — O(1) unique index lookup
      // Reuses existing hasUserViewedProperty (tenantId_propertyId composite key)
      let isUnlocked = false;
      if (roomId && typeof roomId === 'string') {
        isUnlocked = await this.subscriptionService.hasUserViewedProperty(userId, roomId);
      }
      res.json({
        success: true,
        data: {
          plan: effectivePlan,
          city: normalizedCity,
          viewCount,
          viewLimit: limit,
          // null = unlimited
          canViewContact,
          canViewMap,
          hasCallSupport,
          isUnlocked,
          message: !isUnlimited && viewCount >= limit ? 'Upgrade to view more properties' : null
        }
      });
    } catch (error: any) {
      logger.error('Error in getVisibility', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}