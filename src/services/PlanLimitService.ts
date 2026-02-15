import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
import { normalizeCity } from '../utils/normalize';

/**
 * PlanLimitService — Database-driven contact limit resolution.
 *
 * Resolution priority:
 * 1. City-specific override: (plan='FREE', city='bangalore') → 5
 * 2. Global plan default:   (plan='FREE', city=NULL)         → 10
 * 3. Hardcoded safety net:  FREE → 10 (only if DB has no rows)
 *
 * Returns:
 * - number: the contact limit for this plan+city
 * - null:   unlimited (paid plans)
 */

const FALLBACK_FREE_LIMIT = 10;
export class PlanLimitService {
  private prisma: PrismaClient;
  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || getPrismaClient();
  }

  /**
   * Get the effective contact limit for a plan in a city.
   *
   * @param plan - Effective plan name (e.g., 'FREE', 'GOLD', 'PLATINUM')
   * @param city - City name for city-specific override lookup
   * @returns number (limit) or null (unlimited)
   */
  async getEffectiveLimit(plan: string, city: string): Promise<number | null> {
    const normalizedPlan = plan.toUpperCase();
    const normalizedCity = normalizeCity(city);
    try {
      // 1. Check city-specific override first
      const cityOverride = await this.prisma.planLimit.findUnique({
        where: {
          plan_city: {
            plan: normalizedPlan,
            city: normalizedCity
          }
        }
      });
      if (cityOverride) {
        logger.debug('PlanLimit: city override found', {
          plan: normalizedPlan,
          city: normalizedCity,
          contactLimit: cityOverride.contactLimit
        });
        return cityOverride.contactLimit; // null = unlimited
      }

      // 2. Check global plan default (city = null)
      //    Prisma doesn't support null in unique where, so use findFirst
      const globalDefault = await this.prisma.planLimit.findFirst({
        where: {
          plan: normalizedPlan,
          city: null
        }
      });
      if (globalDefault) {
        logger.debug('PlanLimit: global default found', {
          plan: normalizedPlan,
          contactLimit: globalDefault.contactLimit
        });
        return globalDefault.contactLimit; // null = unlimited
      }

      // 3. Hardcoded safety fallback (only if DB has no config at all)
      logger.warn('PlanLimit: no DB config found, using hardcoded fallback', {
        plan: normalizedPlan,
        city: normalizedCity
      });
      if (normalizedPlan === 'FREE') {
        return FALLBACK_FREE_LIMIT;
      }

      // Paid plans default to unlimited if no DB config
      return null;
    } catch (error: any) {
      logger.error('PlanLimit: error fetching limit, using fallback', {
        plan: normalizedPlan,
        city: normalizedCity,
        error: error.message
      });

      // Safety: if DB is down, FREE gets hardcoded limit, paid gets unlimited
      return normalizedPlan === 'FREE' ? FALLBACK_FREE_LIMIT : null;
    }
  }
}