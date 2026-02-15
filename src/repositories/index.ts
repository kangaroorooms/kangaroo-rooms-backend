/**
 * PRODUCTION REPOSITORY EXPORTS
 *
 * FIXED: All repositories receive the singleton Prisma client via constructor.
 * No more broken named imports from utils/prisma.
 */

import { getPrismaClient } from '../utils/prisma';
import { PrismaUserRepository } from './PrismaUserRepository';
import { PrismaRoomRepository } from './PrismaRoomRepository';
import { PrismaBookingRepository } from './PrismaBookingRepository';
import { PrismaTenantSubscriptionRepository } from './PrismaTenantSubscriptionRepository';
import { PrismaPaymentRepository } from './PrismaPaymentRepository';
import { PrismaPropertyViewRepository } from './PrismaPropertyViewRepository';

// Singleton Prisma
const prisma = getPrismaClient();

// ✅ REAL DATABASE REPOSITORIES — all using singleton client
export const userRepository = new PrismaUserRepository(prisma);
export const roomRepository = new PrismaRoomRepository(prisma);
export const bookingRepository = new PrismaBookingRepository(prisma);
export const tenantSubscriptionRepository = new PrismaTenantSubscriptionRepository(prisma);
export const paymentRepository = new PrismaPaymentRepository(prisma);
export const propertyViewRepository = new PrismaPropertyViewRepository(prisma);

// Export prisma if needed
export { prisma };

// Interfaces
export * from './interfaces';