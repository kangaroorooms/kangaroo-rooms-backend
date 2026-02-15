import { logger } from '../utils/logger';
import { getPrismaClient } from '../utils/prisma';
import { normalizeCity } from '../utils/normalize';
import crypto from 'crypto';

/**
 * TenantSubscriptionService — MULTI-CITY ARCHITECTURE
 *
 * Schema: @@unique([tenantId, city]) — one subscription per tenant per city.
 * All queries use composite key tenantId_city for city-scoped lookups.
 * All tenant-only lookups use findMany (returns all city subscriptions).
 */

// Default plan durations (days)
const PLAN_DURATION_DAYS: Record<string, number> = {
  FREE: 0,
  GOLD: 30,
  PLATINUM: 30
};
interface UpgradeSubscriptionInput {
  userId: string;
  plan: 'FREE' | 'GOLD' | 'PLATINUM';
  city: string;
  paymentId: string;
}
export class TenantSubscriptionService {
  private subscriptionRepository: any;
  private propertyViewRepository: any;
  private roomRepository: any;
  private prisma;
  constructor(subscriptionRepository: any, propertyViewRepository: any, roomRepository?: any) {
    this.subscriptionRepository = subscriptionRepository;
    this.propertyViewRepository = propertyViewRepository;
    this.roomRepository = roomRepository || null;
    this.prisma = getPrismaClient();
  }

  /**
   * CREATE ORDER (for payment flow)
   */
  async createOrder(data: {
    plan: string;
    city: string;
    amount: number;
  }) {
    try {
      const {
        plan,
        city
      } = data;
      const normalizedPlan = plan.toUpperCase();
      const normalizedCity = normalizeCity(city);
      const validPlans = ['FREE', 'GOLD', 'PLATINUM'];
      if (!validPlans.includes(normalizedPlan)) {
        throw new Error('Invalid plan. Must be FREE, GOLD, or PLATINUM');
      }
      const pricing = await this.prisma.cityPricing.findUnique({
        where: {
          city_plan: {
            city: normalizedCity,
            plan: normalizedPlan
          }
        }
      });
      if (!pricing) {
        throw new Error(`Pricing not found for ${normalizedCity} - ${normalizedPlan}`);
      }

      // Lazy-load Razorpay only when needed
      let razorpay;
      try {
        const Razorpay = require('razorpay');
        razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID || '',
          key_secret: process.env.RAZORPAY_KEY_SECRET || ''
        });
      } catch {
        throw new Error('Razorpay SDK not available');
      }
      const order = await razorpay.orders.create({
        amount: pricing.price * 100,
        // paise
        currency: 'INR',
        receipt: `sub_${Date.now()}`
      });
      logger.info('Razorpay order created', {
        orderId: order.id,
        plan: normalizedPlan,
        city: normalizedCity
      });
      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      };
    } catch (error: any) {
      logger.error('Error creating order', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * VERIFY PAYMENT
   */
  async verifyPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const body = data.razorpay_order_id + '|' + data.razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(body).digest('hex');
    if (expectedSignature !== data.razorpay_signature) {
      logger.error('Razorpay signature mismatch');
      throw new Error('Payment verification failed');
    }
    logger.info('Payment verified successfully', {
      paymentId: data.razorpay_payment_id
    });
    return {
      success: true
    };
  }

  /**
   * UPGRADE SUBSCRIPTION — MULTI-CITY
   *
   * Uses composite upsert: tenantId_city.
   * Buying Kota GOLD does NOT overwrite Bangalore GOLD.
   * Each city gets its own independent subscription row.
   */
  async upgradeSubscription(input: UpgradeSubscriptionInput) {
    try {
      const {
        userId,
        plan,
        city,
        paymentId
      } = input;
      const normalizedPlan = plan.toUpperCase();
      const normalizedCity = normalizeCity(city);
      const validPlans = ['FREE', 'GOLD', 'PLATINUM'];
      if (!validPlans.includes(normalizedPlan)) {
        throw new Error('Invalid plan. Must be FREE, GOLD, or PLATINUM');
      }

      // Calculate expiry
      const durationDays = PLAN_DURATION_DAYS[normalizedPlan] || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Composite upsert: tenantId + city
      // Creates new row if tenant has no subscription for this city.
      // Updates existing row if tenant already has a subscription for this city.
      // Never touches subscriptions for other cities.
      const subscription = await this.prisma.tenantSubscription.upsert({
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
      logger.info('Subscription upgraded successfully', {
        userId,
        subscriptionId: subscription.id,
        plan: normalizedPlan,
        city: normalizedCity
      });
      return subscription;
    } catch (error: any) {
      logger.error('Error upgrading subscription', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * GET USER SUBSCRIPTIONS — ALL CITIES
   *
   * Returns every subscription row for this tenant (one per city).
   * Uses findMany since tenantId is no longer unique.
   */
  async getUserSubscriptions(userId: string) {
    try {
      const subscriptions = await this.prisma.tenantSubscription.findMany({
        where: {
          tenantId: userId
        },
        orderBy: {
          startedAt: 'desc'
        }
      });
      return subscriptions;
    } catch (error: any) {
      logger.error('Error fetching user subscriptions', {
        error: error.message
      });
      throw new Error('Failed to fetch subscriptions');
    }
  }

  /**
   * GET SUBSCRIPTION BY CITY — COMPOSITE LOOKUP
   *
   * Direct database-level lookup using @@unique([tenantId, city]).
   * No app-level filtering. No fetching wrong city's data.
   */
  async getSubscriptionByCity(userId: string, city: string) {
    try {
      const normalizedCity = normalizeCity(city);
      const subscription = await this.prisma.tenantSubscription.findUnique({
        where: {
          tenantId_city: {
            tenantId: userId,
            city: normalizedCity
          }
        }
      });
      return subscription;
    } catch (error: any) {
      logger.error('Error fetching subscription by city', {
        error: error.message
      });
      throw new Error('Failed to fetch subscription');
    }
  }

  /**
   * GET PRICING FOR CITY
   */
  async getPricing(city: string) {
    try {
      const normalizedCity = normalizeCity(city);
      const pricingRecords = await this.prisma.cityPricing.findMany({
        where: {
          city: normalizedCity
        },
        orderBy: {
          price: 'asc'
        }
      });
      if (pricingRecords.length === 0) {
        throw new Error(`City pricing not configured for ${normalizedCity}`);
      }
      return pricingRecords.map((p: any) => ({
        plan: p.plan,
        price: p.price,
        features: p.plan === 'PLATINUM' ? ['Unlimited views', 'Contact info', 'Call support'] : p.plan === 'GOLD' ? ['Unlimited views', 'Contact info'] : ['Limited property views']
      }));
    } catch (error: any) {
      logger.error('Error fetching pricing', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * GET VIEW COUNT BY CITY
   */
  async getViewCountByCity(userId: string, city: string): Promise<number> {
    try {
      const normalizedCity = normalizeCity(city);
      const count = await this.prisma.propertyView.count({
        where: {
          tenantId: userId,
          city: normalizedCity
        }
      });
      return count;
    } catch (error: any) {
      logger.error('Error fetching view count', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * GET UNIQUE PROPERTY COUNT BY CITY
   */
  async getUniquePropertyCountByCity(userId: string, city: string): Promise<number> {
    try {
      const normalizedCity = normalizeCity(city);
      const count = await this.prisma.propertyView.count({
        where: {
          tenantId: userId,
          city: normalizedCity
        }
      });
      return count;
    } catch (error: any) {
      logger.error('Error fetching unique property count', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * CHECK IF USER HAS VIEWED PROPERTY
   */
  async hasUserViewedProperty(userId: string, roomId: string): Promise<boolean> {
    try {
      const view = await this.prisma.propertyView.findUnique({
        where: {
          tenantId_propertyId: {
            tenantId: userId,
            propertyId: roomId
          }
        }
      });
      return !!view;
    } catch (error: any) {
      logger.error('Error checking property view', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * RECORD PROPERTY VIEW
   */
  async recordPropertyView(userId: string, roomId: string, city: string) {
    try {
      const normalizedCity = normalizeCity(city);
      await this.prisma.propertyView.upsert({
        where: {
          tenantId_propertyId: {
            tenantId: userId,
            propertyId: roomId
          }
        },
        create: {
          tenantId: userId,
          propertyId: roomId,
          city: normalizedCity
        },
        update: {} // No-op on duplicate
      });
      logger.info('Property view recorded', {
        userId,
        roomId,
        city: normalizedCity
      });
    } catch (error: any) {
      logger.error('Error recording property view', {
        error: error.message
      });
      // Non-critical — don't throw
    }
  }

  /**
   * TRACK PROPERTY VIEW
   */
  async trackPropertyView(userId: string, propertyId: string) {
    try {
      let city = 'unknown';
      if (this.roomRepository) {
        const room = await this.roomRepository.findById(propertyId);
        if (room) city = room.city || 'unknown';
      } else {
        const room = await this.prisma.room.findUnique({
          where: {
            id: propertyId
          },
          select: {
            city: true
          }
        });
        if (room) city = room.city;
      }
      await this.recordPropertyView(userId, propertyId, city);
      return {
        success: true
      };
    } catch (error: any) {
      logger.error('Error tracking property view', {
        error: error.message
      });
      return {
        success: false
      };
    }
  }

  /**
   * GET ALL SUBSCRIPTIONS (admin)
   */
  async getAllSubscriptions() {
    try {
      return await this.prisma.tenantSubscription.findMany({
        orderBy: {
          startedAt: 'desc'
        },
        include: {
          tenant: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });
    } catch (error: any) {
      logger.error('Error fetching all subscriptions', {
        error: error.message
      });
      throw new Error('Failed to fetch subscriptions');
    }
  }
}