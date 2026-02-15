import { pricingTiers, getPricingByTier } from '../data';
export interface SubscriptionTier {
  tier: 'free' | 'basic' | 'premium';
  name: string;
  price: number;
  propertyViewsLimit: number;
  duration: number;
  features: string[];
}
export class SubscriptionProvider {
  /**
   * Get all available pricing tiers
   */
  getTiers(): SubscriptionTier[] {
    return pricingTiers;
  }

  /**
   * Get pricing details for a specific tier
   */
  getTierDetails(tier: 'free' | 'basic' | 'premium'): SubscriptionTier | undefined {
    return getPricingByTier(tier);
  }

  /**
   * Calculate subscription end date based on tier
   */
  calculateEndDate(startDate: Date, tier: 'free' | 'basic' | 'premium'): Date {
    const tierDetails = getPricingByTier(tier);
    if (!tierDetails) {
      throw new Error(`Invalid tier: ${tier}`);
    }
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + tierDetails.duration);
    return endDate;
  }

  /**
   * Check if a subscription has reached its view limit
   */
  hasReachedViewLimit(viewsUsed: number, viewsLimit: number): boolean {
    if (viewsLimit === -1) return false; // unlimited
    return viewsUsed >= viewsLimit;
  }
}