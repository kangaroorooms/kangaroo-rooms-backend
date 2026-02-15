import { propertyViews } from '../data';
import { normalizeCity } from '../utils/normalize';
export interface PropertyView {
  id: string;
  userId: string;
  roomId: string;
  city: string;
  viewedAt: Date;
  createdAt: Date;
}
export class PropertyViewProvider {
  /**
   * Record a property view for subscription tracking
   */
  async recordView(userId: string, roomId: string, city: string): Promise<PropertyView> {
    const newView = {
      id: String(propertyViews.length + 1),
      userId,
      roomId,
      city,
      viewedAt: new Date(),
      createdAt: new Date()
    };
    propertyViews.push(newView);
    return newView;
  }

  /**
   * Get property views for a user in a specific city
   * Used for subscription limit enforcement
   */
  async getViewsByUserAndCity(userId: string, city: string): Promise<PropertyView[]> {
    const normalizedCity = normalizeCity(city);
    return propertyViews.filter((v) => v.userId === userId && normalizeCity(v.city) === normalizedCity);
  }

  /**
   * Get all property views for a user (across all cities)
   */
  async getViewsByUser(userId: string): Promise<PropertyView[]> {
    return propertyViews.filter((v) => v.userId === userId);
  }

  /**
   * Count property views for a user in a specific city
   */
  async countViewsByUserAndCity(userId: string, city: string): Promise<number> {
    const normalizedCity = normalizeCity(city);
    return propertyViews.filter((v) => v.userId === userId && normalizeCity(v.city) === normalizedCity).length;
  }
}