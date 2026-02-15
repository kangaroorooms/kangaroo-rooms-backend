import { Response } from 'express';
import { OwnerService } from '../services/OwnerService';
import { AuthRequest } from '../middleware/auth.middleware';
export class OwnerController {
  constructor(private ownerService: OwnerService) {
    // Bind all methods to preserve 'this' context
    this.getSummary = this.getSummary.bind(this);
    this.getMyRooms = this.getMyRooms.bind(this);
    this.getMyBookings = this.getMyBookings.bind(this);
  }

  /**
   * Get owner dashboard summary
   * GET /api/owners/me/summary
   */
  async getSummary(req: AuthRequest, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const summary = await this.ownerService.getOwnerSummary(ownerId);
      return res.json({
        success: true,
        data: summary
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch owner summary'
      });
    }
  }

  /**
   * Get owner's rooms/properties
   * GET /api/owners/me/rooms
   */
  async getMyRooms(req: AuthRequest, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const rooms = await this.ownerService.getOwnerRooms(ownerId);
      return res.json({
        success: true,
        data: rooms
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch owner rooms'
      });
    }
  }

  /**
   * Get owner's bookings
   * GET /api/owners/me/bookings
   */
  async getMyBookings(req: AuthRequest, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const bookings = await this.ownerService.getOwnerBookings(ownerId);
      return res.json({
        success: true,
        data: bookings
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch owner bookings'
      });
    }
  }
}