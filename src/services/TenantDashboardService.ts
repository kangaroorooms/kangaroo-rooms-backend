import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';

/**
 * TenantDashboardService — MULTI-CITY ARCHITECTURE
 *
 * Returns all city subscriptions for the tenant.
 * Phone masking uses ANY active subscription (not city-specific for dashboard).
 */

export interface TenantDashboardBooking {
  id: string;
  roomId: string;
  moveInDate: string;
  message: string | null;
  status: string;
  createdAt: string;
  room: {
    id: string;
    title: string;
    city: string;
    pricePerMonth: number;
    images: string[];
  };
  owner: {
    name: string;
    phone: string | null;
  };
}
export interface TenantDashboardSubscription {
  id: string;
  plan: string;
  city: string;
  startedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}
export interface TenantDashboardRecentView {
  id: string;
  title: string;
  city: string;
  pricePerMonth: number;
  images: string[];
  roomType: string;
  viewedAt: string;
}
export interface TenantDashboardData {
  bookings: TenantDashboardBooking[];
  subscriptions: TenantDashboardSubscription[];
  recentlyViewed: TenantDashboardRecentView[];
}
export class TenantDashboardService {
  private prisma;
  constructor(prismaClient?: any) {
    this.prisma = prismaClient || getPrismaClient();
  }

  /**
   * GET DASHBOARD — Aggregated endpoint
   *
   * MULTI-CITY: Returns ALL subscriptions (one per city).
   * Phone masking: visible if tenant has ANY active subscription or booking is APPROVED.
   */
  async getDashboard(tenantId: string): Promise<TenantDashboardData> {
    let bookingsRaw: any[] = [];
    let subscriptionsRaw: any[] = [];
    let viewsRaw: any[] = [];
    try {
      logger.info('[DASHBOARD DIAG] Fetching bookings...', {
        tenantId
      });
      bookingsRaw = await this.fetchBookings(tenantId);
      logger.info('[DASHBOARD DIAG] Bookings OK', {
        count: bookingsRaw.length
      });
    } catch (err: any) {
      logger.error('[DASHBOARD DIAG] BOOKINGS QUERY FAILED:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        meta: err?.meta
      });
      throw err;
    }
    try {
      logger.info('[DASHBOARD DIAG] Fetching subscriptions...', {
        tenantId
      });
      subscriptionsRaw = await this.fetchSubscriptions(tenantId);
      logger.info('[DASHBOARD DIAG] Subscriptions OK', {
        count: subscriptionsRaw.length
      });
    } catch (err: any) {
      logger.error('[DASHBOARD DIAG] SUBSCRIPTION QUERY FAILED:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        meta: err?.meta
      });
      throw err;
    }
    try {
      logger.info('[DASHBOARD DIAG] Fetching recently viewed...', {
        tenantId
      });
      viewsRaw = await this.fetchRecentlyViewed(tenantId);
      logger.info('[DASHBOARD DIAG] Recently viewed OK', {
        count: viewsRaw.length
      });
    } catch (err: any) {
      logger.error('[DASHBOARD DIAG] RECENTLY VIEWED QUERY FAILED:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        meta: err?.meta
      });
      throw err;
    }

    // Compute isActive for each subscription
    const now = new Date();
    const subscriptions: TenantDashboardSubscription[] = subscriptionsRaw.map((s: any) => ({
      id: s.id,
      plan: s.plan,
      city: s.city,
      startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
      expiresAt: s.expiresAt ? s.expiresAt instanceof Date ? s.expiresAt.toISOString() : s.expiresAt : null,
      isActive: !s.expiresAt || (s.expiresAt instanceof Date ? s.expiresAt > now : new Date(s.expiresAt) > now)
    }));

    // Phone masking: visible if tenant has ANY active subscription
    const hasAnyActiveSubscription = subscriptions.some((s) => s.isActive);

    // Map bookings with owner phone masking
    const bookings: TenantDashboardBooking[] = bookingsRaw.map((b: any) => {
      const canSeePhone = hasAnyActiveSubscription || b.status === 'APPROVED';
      return {
        id: b.id,
        roomId: b.roomId,
        moveInDate: b.moveInDate instanceof Date ? b.moveInDate.toISOString() : b.moveInDate,
        message: b.message || null,
        status: b.status,
        createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
        room: {
          id: b.room.id,
          title: b.room.title,
          city: b.room.city,
          pricePerMonth: b.room.pricePerMonth,
          images: b.room.images || []
        },
        owner: {
          name: b.owner.name,
          phone: canSeePhone ? b.owner.phone || null : null
        }
      };
    });

    // Map recently viewed
    const recentlyViewed: TenantDashboardRecentView[] = viewsRaw.filter((v: any) => v.property !== null).map((v: any) => ({
      id: v.property.id,
      title: v.property.title,
      city: v.property.city,
      pricePerMonth: v.property.pricePerMonth,
      images: v.property.images || [],
      roomType: v.property.roomType,
      viewedAt: v.viewedAt instanceof Date ? v.viewedAt.toISOString() : v.viewedAt
    }));
    logger.info('Tenant dashboard fetched', {
      tenantId,
      bookingCount: bookings.length,
      subscriptionCount: subscriptions.length,
      recentViewCount: recentlyViewed.length
    });
    return {
      bookings,
      subscriptions,
      recentlyViewed
    };
  }

  /**
   * FETCH BOOKINGS
   */
  private async fetchBookings(tenantId: string) {
    return this.prisma.booking.findMany({
      where: {
        tenantId
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        room: {
          select: {
            id: true,
            title: true,
            city: true,
            pricePerMonth: true,
            images: true
          }
        },
        owner: {
          select: {
            name: true,
            phone: true
          }
        }
      }
    });
  }

  /**
   * FETCH SUBSCRIPTIONS — ALL CITIES
   *
   * Uses findMany to return every subscription row for this tenant.
   * One row per city.
   */
  private async fetchSubscriptions(tenantId: string) {
    return this.prisma.tenantSubscription.findMany({
      where: {
        tenantId
      },
      orderBy: {
        startedAt: 'desc'
      }
    });
  }

  /**
   * FETCH RECENTLY VIEWED
   */
  private async fetchRecentlyViewed(tenantId: string) {
    return this.prisma.propertyView.findMany({
      where: {
        tenantId,
        property: {
          isActive: true,
          reviewStatus: 'APPROVED'
        }
      },
      orderBy: {
        viewedAt: 'desc'
      },
      take: 5,
      select: {
        viewedAt: true,
        property: {
          select: {
            id: true,
            title: true,
            city: true,
            pricePerMonth: true,
            images: true,
            roomType: true
          }
        }
      }
    });
  }
}