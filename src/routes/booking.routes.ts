import { Router } from 'express';
import { BookingController } from '../controllers/BookingController';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
import { bookingRateLimiter } from '../middleware/booking-rate-limit.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { BookingService } from '../services/BookingService';
import { PrismaBookingRepository } from '../repositories/PrismaBookingRepository';
import { PrismaRoomRepository } from '../repositories/PrismaRoomRepository';
import { Role } from '@prisma/client';
const router = Router();

// ✅ Dependency Injection (VERY IMPORTANT)
const bookingRepository = new PrismaBookingRepository();
const roomRepository = new PrismaRoomRepository();
const bookingService = new BookingService(bookingRepository, roomRepository);
const bookingController = new BookingController(bookingService);

// ✅ READ — Tenant bookings
// FIX: Frontend calls /bookings/my, keep /my-bookings as alias for backward compat
router.get('/my', authMiddleware, (req, res, next) => bookingController.getTenantBookings(req as any, res));
router.get('/my-bookings', authMiddleware, (req, res, next) => bookingController.getTenantBookings(req as any, res));

// ✅ READ — Owner bookings
// FIX: Frontend calls /bookings/owner — route was completely missing
router.get('/owner', authMiddleware, authorizeRoles(Role.OWNER, Role.ADMIN), (req, res, next) => bookingController.getOwnerBookings(req as any, res));

// ✅ CREATE
router.post('/', authMiddleware, authorizeRoles(Role.TENANT, Role.ADMIN), bookingRateLimiter, idempotencyMiddleware(), (req, res, next) => bookingController.createBooking(req as any, res, next));

// ✅ UPDATE STATUS
// FIX: Frontend calls PATCH, keep PUT as alias for backward compat
router.patch('/:id/status', authMiddleware, authorizeRoles(Role.ADMIN, Role.OWNER), (req, res, next) => bookingController.updateBookingStatus(req as any, res));
router.put('/:id/status', authMiddleware, authorizeRoles(Role.ADMIN, Role.OWNER), (req, res, next) => bookingController.updateBookingStatus(req as any, res));

// ✅ CANCEL BOOKING — Tenant can cancel their own pending bookings
router.patch('/:id/cancel', authMiddleware, authorizeRoles(Role.TENANT), (req, res) => bookingController.cancelBooking(req as any, res));
export default router;