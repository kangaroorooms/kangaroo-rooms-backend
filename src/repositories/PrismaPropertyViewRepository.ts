import { PropertyView, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';

/**
 * PrismaPropertyViewRepository — FIXED
 *
 * Changes:
 * 1. Uses getPrismaClient() singleton instead of broken named import
 * 2. Uses `propertyId` (actual schema field) instead of `roomId`
 * 3. Removed `city` field references (not on PropertyView schema)
 * 4. Uses unique constraint (tenantId, propertyId) for dedup
 */
export class PrismaPropertyViewRepository {
  private prisma: PrismaClient;
  constructor(prismaClient?: any) {
    this.prisma = prismaClient || getPrismaClient();
  }
  async create(data: {
    tenantId: string;
    propertyId: string;
  }): Promise<PropertyView> {
    try {
      return await this.prisma.propertyView.create({
        data: {
          tenantId: data.tenantId,
          propertyId: data.propertyId
        }
      });
    } catch (error: any) {
      // P2002 = unique constraint violation (already viewed)
      if (error?.code === 'P2002') {
        logger.info('Property view already exists, skipping', {
          tenantId: data.tenantId,
          propertyId: data.propertyId
        });
        // Return existing record
        const existing = await this.prisma.propertyView.findUnique({
          where: {
            tenantId_propertyId: {
              tenantId: data.tenantId,
              propertyId: data.propertyId
            }
          }
        });
        return existing!;
      }
      logger.error('Error creating property view', {
        error: error.message
      });
      throw new Error('Failed to create property view');
    }
  }
  async countByTenantId(tenantId: string): Promise<number> {
    try {
      return await this.prisma.propertyView.count({
        where: {
          tenantId
        }
      });
    } catch (error: any) {
      logger.error('Error counting property views', {
        error: error.message
      });
      throw new Error('Failed to count property views');
    }
  }

  /**
   * Count unique properties viewed by a user IN A SPECIFIC CITY
   * FIXED: Now actually filters by city via Room relation join
   */
  async countUniquePropertiesByUserAndCity(userId: string, city: string): Promise<number> {
    try {
      return await this.prisma.propertyView.count({
        where: {
          tenantId: userId,
          property: {
            city: {
              equals: city,
              mode: 'insensitive'
            }
          }
        }
      });
    } catch (error: any) {
      logger.error('Error counting unique property views', {
        error: error.message
      });
      return 0;
    }
  }
  async countByUserAndCity(userId: string, city: string): Promise<number> {
    try {
      return await this.prisma.propertyView.count({
        where: {
          tenantId: userId,
          property: {
            city: {
              equals: city,
              mode: 'insensitive'
            }
          }
        }
      });
    } catch (error: any) {
      logger.error('Error counting property views by city', {
        error: error.message
      });
      return 0;
    }
  }
  async hasUserViewedProperty(userId: string, propertyId: string): Promise<boolean> {
    try {
      const view = await this.prisma.propertyView.findUnique({
        where: {
          tenantId_propertyId: {
            tenantId: userId,
            propertyId
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
  async findByTenantId(tenantId: string): Promise<PropertyView[]> {
    try {
      return await this.prisma.propertyView.findMany({
        where: {
          tenantId
        },
        orderBy: {
          viewedAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding property views', {
        error: error.message
      });
      throw new Error('Failed to find property views');
    }
  }
  async findByPropertyId(propertyId: string): Promise<PropertyView[]> {
    try {
      return await this.prisma.propertyView.findMany({
        where: {
          propertyId
        },
        orderBy: {
          viewedAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding property views by property', {
        error: error.message
      });
      throw new Error('Failed to find property views');
    }
  }
  async getUniqueViewCount(propertyId: string): Promise<number> {
    try {
      return await this.prisma.propertyView.count({
        where: {
          propertyId
        }
      });
    } catch (error: any) {
      logger.error('Error getting unique view count', {
        error: error.message
      });
      throw new Error('Failed to get unique view count');
    }
  }
}