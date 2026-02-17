import { Router } from 'express';
import { OwnerController } from '../controllers/OwnerController';
import { OwnerService } from '../services/OwnerService';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { roomRepository, bookingRepository } from '../repositories';
const router = Router();

// Instantiate service with Prisma repositories
const ownerService = new OwnerService(roomRepository as any,
// PrismaRoomRepository
bookingRepository as any); // PrismaBookingRepository
// Instantiate controller with service
const ownerController = new OwnerController(ownerService);

/**
 * Owner dashboard summary
 */
router.get('/me/summary', authMiddleware, authorizeRoles(Role.OWNER, Role.ADMIN), (req, res, next) => ownerController.getSummary(req as any, res));

/**
 * Owner rooms
 */
router.get('/me/rooms', authMiddleware, authorizeRoles(Role.OWNER, Role.ADMIN), (req, res, next) => ownerController.getMyRooms(req as any, res));

/**
 * Owner bookings
 */
router.get('/me/bookings', authMiddleware, authorizeRoles(Role.OWNER, Role.ADMIN), (req, res, next) => ownerController.getMyBookings(req as any, res));
export default router;