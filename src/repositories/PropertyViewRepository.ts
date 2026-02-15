import { propertyViews } from '../data';
import { normalizeCity } from '../utils/normalize';

/**
 * Property View Repository
 *
 * Tracks property views for FREE tier limit enforcement
 * Uses centralized data from /data folder
 */
export class PropertyViewRepository {
  async create(data: {
    userId: string;
    roomId: string;
    city: string;
  }): Promise<any> {
    const newView = {
      id: String(propertyViews.length + 1),
      ...data,
      viewedAt: new Date(),
      createdAt: new Date()
    };
    propertyViews.push(newView);
    return newView;
  }
  async findByUserAndCity(userId: string, city: string): Promise<any[]> {
    const normalizedCity = normalizeCity(city);
    return propertyViews.filter((v) => v.userId === userId && normalizeCity(v.city) === normalizedCity);
  }
  async countByUserAndCity(userId: string, city: string): Promise<number> {
    const normalizedCity = normalizeCity(city);
    return propertyViews.filter((v) => v.userId === userId && normalizeCity(v.city) === normalizedCity).length;
  }

  // ✅ NEW METHOD: Check if user has viewed THIS SPECIFIC property
  async hasUserViewedProperty(userId: string, roomId: string): Promise<boolean> {
    return propertyViews.some((v) => v.userId === userId && v.roomId === roomId);
  }

  // ✅ NEW METHOD: Count UNIQUE properties viewed per city (for FREE tier limits)
  async countUniquePropertiesByUserAndCity(userId: string, city: string): Promise<number> {
    const normalizedCity = normalizeCity(city);
    const uniqueRoomIds = new Set(propertyViews.filter((v) => v.userId === userId && normalizeCity(v.city) === normalizedCity).map((v) => v.roomId));
    return uniqueRoomIds.size;
  }
}