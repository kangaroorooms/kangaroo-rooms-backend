import { Router } from 'express';
import { BookingController } from '../controllers/BookingController';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
import { bookingRateLimiter } from '../middleware/booking-rate-limit.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { BookingService } from '../services/BookingService';
import { PrismaBookingRepository } from '../repositories/PrismaBookingRepository';
import { PrismaRoomRepository } from '../repositories/PrismaRoomRepository';
const router = Router();

// ✅ Dependency Injection (VERY IMPORTANT)
const bookingRepository = new PrismaBookingRepository();
const roomRepository = new PrismaRoomRepository();
const bookingService = new BookingService(bookingRepository, roomRepository);
const bookingController = new BookingController(bookingService);

// ✅ READ — Tenant bookings
// FIX: Frontend calls /bookings/my, keep /my-bookings as alias for backward compat
router.get('/my', authMiddleware, bookingController.getTenantBookings);
router.get('/my-bookings', authMiddleware, bookingController.getTenantBookings);

// ✅ READ — Owner bookings
// FIX: Frontend calls /bookings/owner — route was completely missing
router.get('/owner', authMiddleware, authorizeRoles('OWNER', 'ADMIN'), bookingController.getOwnerBookings);

// ✅ CREATE
router.post('/', authMiddleware, authorizeRoles('TENANT', 'ADMIN'), bookingRateLimiter, idempotencyMiddleware(), bookingController.createBooking);

// ✅ UPDATE STATUS
// FIX: Frontend calls PATCH, keep PUT as alias for backward compat
router.patch('/:id/status', authMiddleware, authorizeRoles('ADMIN', 'OWNER'), bookingController.updateBookingStatus);
router.put('/:id/status', authMiddleware, authorizeRoles('ADMIN', 'OWNER'), bookingController.updateBookingStatus);
export default router;