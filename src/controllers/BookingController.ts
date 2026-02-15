import { Request, Response, NextFunction } from 'express';
import { BookingService } from '../services/BookingService';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../errors/AppErrors';
import { logger } from '../utils/logger';
export class BookingController {
  constructor(private bookingService: BookingService) {}

  /**
   * CREATE BOOKING
   * FIX: Use handleError (which checks errors/AppErrors.ts) instead of next()
   *      which delegates to error.middleware.ts with a DIFFERENT AppError class.
   */
  createBooking = async (
  req: Request,
  res: Response,
  next: NextFunction)
  : Promise<void> => {
    try {
      const userId = (req as AuthRequest).user?.userId;
      const bookingData = {
        ...req.body,
        userId
      };
      const booking = await this.bookingService.createBooking(bookingData);
      logger.info('Booking created', {
        bookingId: booking.id,
        userId
      });
      res.status(201).json({
        success: true,
        data: this.sanitizeBooking(booking),
        message: 'Booking created successfully'
      });
    } catch (error: any) {
      this.handleError(res, error);
    }
  };

  /**
   * GET BOOKING BY ID — FIXED: Added authorization check
   */
  getBookingById = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      const booking = await this.bookingService.getBookingById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      // SECURITY FIX: Only allow access to own bookings or admin
      if (
      userRole !== 'ADMIN' &&
      booking.tenantId !== userId &&
      booking.ownerId !== userId)
      {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this booking'
        });
      }
      return res.json({
        success: true,
        data: this.sanitizeBooking(booking)
      });
    } catch (error: any) {
      return this.handleError(res, error);
    }
  };

  /**
   * CANCEL BOOKING
   */
  cancelBooking = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }
      const booking = await this.bookingService.cancelBooking(id, userId);
      return res.json({
        success: true,
        data: this.sanitizeBooking(booking),
        message: 'Booking cancelled successfully'
      });
    } catch (error: any) {
      return this.handleError(res, error);
    }
  };

  /**
   * TENANT BOOKINGS
   */
  getTenantBookings = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const result = await this.bookingService.getUserBookings(userId);
      const bookings = Array.isArray(result) ? result : result.bookings;
      const total = Array.isArray(result) ? result.length : result.total;
      return res.json({
        success: true,
        data: bookings.map(this.sanitizeBooking),
        meta: {
          page: 1,
          limit: 20,
          total
        }
      });
    } catch (error: any) {
      return this.handleError(res, error);
    }
  };

  /**
   * OWNER BOOKINGS
   */
  getOwnerBookings = async (req: AuthRequest, res: Response) => {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const result = await this.bookingService.getOwnerBookings(ownerId);
      const bookings = Array.isArray(result) ? result : result.bookings;
      const total = Array.isArray(result) ? result.length : result.total;
      return res.json({
        success: true,
        data: bookings.map(this.sanitizeBooking),
        meta: {
          page: 1,
          limit: 20,
          total
        }
      });
    } catch (error: any) {
      return this.handleError(res, error);
    }
  };

  /**
   * UPDATE STATUS
   */
  updateBookingStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      const booking = await this.bookingService.updateBookingStatus(
        id,
        status,
        userId
      );
      return res.json({
        success: true,
        data: booking ? this.sanitizeBooking(booking) : null,
        message: 'Booking status updated successfully'
      });
    } catch (error: any) {
      return this.handleError(res, error);
    }
  };

  /**
   * ERROR HANDLER
   */
  private handleError(res: Response, error: any): Response {
    if (error instanceof AppError) {
      logger.warn('Booking error', {
        code: error.code,
        message: error.message
      });
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    logger.error('Unexpected booking error', {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message:
      process.env.NODE_ENV === 'production' ?
      'Internal server error' :
      error.message
    });
  }

  /**
   * SANITIZER
   * Normalizes status to lowercase for frontend compatibility.
   * Defense-in-depth: even if upstream forgets, API output is always lowercase.
   */
  private sanitizeBooking = (booking: any) => ({
    id: booking.id,
    roomId: booking.roomId,
    ownerId: booking.ownerId,
    tenantId: booking.tenantId || null,
    tenantName: booking.tenantName,
    tenantEmail: booking.tenantEmail,
    tenantPhone: booking.tenantPhone,
    moveInDate: booking.moveInDate,
    message: booking.message || null,
    status:
    typeof booking.status === 'string' ?
    booking.status.toLowerCase() :
    booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  });
}