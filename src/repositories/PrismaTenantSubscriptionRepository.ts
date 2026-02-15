import { TenantSubscription } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
import { normalizeCity } from '../utils/normalize';

/**
 * PrismaTenantSubscriptionRepository — MULTI-CITY ARCHITECTURE
 *
 * Schema: @@unique([tenantId, city])
 *
 * Rules:
 * - tenant only → findMany (returns all city subscriptions)
 * - tenant + city → findUnique with composite key tenantId_city
 * - ZERO findUnique({ where: { tenantId } }) calls
 */
export class PrismaTenantSubscriptionRepository {
  private prisma;
  constructor(prismaClient?: any) {
    this.prisma = prismaClient || getPrismaClient();
  }
  async create(data: {
    tenantId: string;
    plan: string;
    city: string;
    expiresAt?: Date;
  }): Promise<TenantSubscription> {
    try {
      const normalizedCity = normalizeCity(data.city);
      return await this.prisma.tenantSubscription.create({
        data: {
          tenantId: data.tenantId,
          plan: data.plan,
          city: normalizedCity,
          expiresAt: data.expiresAt || null
        }
      });
    } catch (error: any) {
      logger.error('Error creating subscription', {
        error: error.message
      });
      throw new Error('Failed to create subscription');
    }
  }
  async findById(id: string): Promise<TenantSubscription | null> {
    try {
      return await this.prisma.tenantSubscription.findUnique({
        where: {
          id
        }
      });
    } catch (error: any) {
      logger.error('Error finding subscription by id', {
        error: error.message
      });
      throw new Error('Failed to find subscription');
    }
  }

  /**
   * Find ALL subscriptions for a tenant (all cities).
   * Returns array — one entry per city.
   */
  async findByTenantId(tenantId: string): Promise<TenantSubscription[]> {
    try {
      return await this.prisma.tenantSubscription.findMany({
        where: {
          tenantId
        },
        orderBy: {
          startedAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding subscriptions by tenant id', {
        error: error.message
      });
      throw new Error('Failed to find subscriptions');
    }
  }

  /**
   * Find subscription for a specific tenant + city.
   * Uses composite unique key tenantId_city.
   */
  async findByTenantIdAndCity(tenantId: string, city: string): Promise<TenantSubscription | null> {
    try {
      const normalizedCity = normalizeCity(city);
      return await this.prisma.tenantSubscription.findUnique({
        where: {
          tenantId_city: {
            tenantId,
            city: normalizedCity
          }
        }
      });
    } catch (error: any) {
      logger.error('Error finding subscription by tenant+city', {
        error: error.message
      });
      throw new Error('Failed to find subscription');
    }
  }

  /**
   * Find all ACTIVE subscriptions for a user (all cities).
   * "Active" = expiresAt is null or in the future.
   */
  async findActiveByUserId(userId: string): Promise<TenantSubscription[]> {
    try {
      const now = new Date();
      const subscriptions = await this.prisma.tenantSubscription.findMany({
        where: {
          tenantId: userId
        }
      });

      // Filter to active only
      return subscriptions.filter((s: TenantSubscription) => !s.expiresAt || s.expiresAt > now);
    } catch (error: any) {
      logger.error('Error finding active subscriptions', {
        error: error.message
      });
      throw new Error('Failed to find subscriptions');
    }
  }

  /**
   * Find active subscription for a specific user + city.
   * Uses composite unique key — direct DB lookup, no app-level filtering.
   */
  async findActiveByUserIdAndCity(userId: string, city: string): Promise<TenantSubscription | null> {
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
      if (!subscription) return null;

      // Check expiry
      if (subscription.expiresAt && subscription.expiresAt < new Date()) return null;
      return subscription;
    } catch (error: any) {
      logger.error('Error finding active subscription by city', {
        error: error.message
      });
      throw new Error('Failed to find subscription');
    }
  }
  async findAll(): Promise<TenantSubscription[]> {
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
          },
          payment: {
            select: {
              id: true,
              amount: true,
              status: true
            }
          }
        }
      });
    } catch (error: any) {
      logger.error('Error finding all subscriptions', {
        error: error.message
      });
      throw new Error('Failed to find subscriptions');
    }
  }
  async update(id: string, data: Partial<TenantSubscription>): Promise<TenantSubscription> {
    try {
      return await this.prisma.tenantSubscription.update({
        where: {
          id
        },
        data
      });
    } catch (error: any) {
      logger.error('Error updating subscription', {
        error: error.message
      });
      throw new Error('Failed to update subscription');
    }
  }
}