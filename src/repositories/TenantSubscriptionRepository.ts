import { TenantSubscription } from '../models/TenantSubscription';
import { subscriptions, payments } from '../data';
import { normalizeCity } from '../utils/normalize';
export class TenantSubscriptionRepository {
  /**
   * Find all active subscriptions for a user
   * CRITICAL: Returns multiple subscriptions (one per city)
   */
  async findActiveByUserId(userId: string): Promise<TenantSubscription[]> {
    const now = new Date();
    return subscriptions.filter((s) => s.userId === userId && s.status === 'active' && s.endDate > now).map((s) => this.mapToSubscription(s));
  }

  /**
   * Find active subscription for a specific user and city
   * Used for city-specific visibility checks
   */
  async findActiveByUserIdAndCity(userId: string, city: string): Promise<TenantSubscription | null> {
    const now = new Date();
    const normalizedCity = normalizeCity(city);
    const subscription = subscriptions.find((s) => s.userId === userId && normalizeCity(s.city) === normalizedCity && s.status === 'active' && s.endDate > now);
    return subscription ? this.mapToSubscription(subscription) : null;
  }
  async findById(id: string): Promise<TenantSubscription | null> {
    const subscription = subscriptions.find((s) => s.id === id);
    return subscription ? this.mapToSubscription(subscription) : null;
  }
  async create(data: Omit<TenantSubscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantSubscription> {
    const newSubscription = {
      id: String(subscriptions.length + 1),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    subscriptions.push(newSubscription);
    return this.mapToSubscription(newSubscription);
  }
  async update(id: string, data: Partial<TenantSubscription>): Promise<TenantSubscription | null> {
    const index = subscriptions.findIndex((s) => s.id === id);
    if (index === -1) return null;
    subscriptions[index] = {
      ...subscriptions[index],
      ...data,
      updatedAt: new Date()
    };
    return this.mapToSubscription(subscriptions[index]);
  }
  async incrementPropertyViews(id: string): Promise<TenantSubscription | null> {
    const index = subscriptions.findIndex((s) => s.id === id);
    if (index === -1) return null;
    subscriptions[index].propertyViewsUsed += 1;
    subscriptions[index].updatedAt = new Date();
    return this.mapToSubscription(subscriptions[index]);
  }
  private mapToSubscription(data: any): TenantSubscription {
    return {
      id: data.id,
      userId: data.userId,
      tier: data.tier,
      city: data.city,
      status: data.status,
      startDate: data.startDate,
      endDate: data.endDate,
      propertyViewsUsed: data.propertyViewsUsed,
      propertyViewsLimit: data.propertyViewsLimit,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}