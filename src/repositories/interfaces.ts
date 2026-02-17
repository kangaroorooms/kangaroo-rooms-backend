import { User } from '@prisma/client';
import { Room, RoomFilters } from '../models/Room';
import { Booking } from '../models/Booking';
import { TenantSubscription } from '../models/TenantSubscription';
import { Payment } from '../models/Payment';

/**
 * Repository Interfaces
 *
 * These define the contract that all repository implementations must follow.
 * This allows swapping between Dummy and Prisma implementations seamlessly.
 */

// ============================================================================
// USER REPOSITORY
// ============================================================================
export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, userData: Partial<User>): Promise<User | null>;
  findAll(): Promise<User[]>;
}

// ============================================================================
// ROOM REPOSITORY
// ============================================================================
export interface IRoomRepository {
  findAll(filters?: RoomFilters): Promise<{
    rooms: Room[];
    total: number;
  }>;
  findById(id: string): Promise<Room | null>;
  findByOwnerId(ownerId: string): Promise<Room[]>;
  create(roomData: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>): Promise<Room>;
  update(id: string, roomData: Partial<Room>): Promise<Room | null>;
  delete(id: string): Promise<boolean>;
  toggleRoomStatus(id: string): Promise<Room | null>;
}

// ============================================================================
// BOOKING REPOSITORY
// ============================================================================
export interface IBookingRepository {
  findAll(): Promise<Booking[]>;
  findById(id: string): Promise<Booking | null>;
  findByTenantId(tenantId: string, page?: number, limit?: number): Promise<{
    bookings: Booking[];
    total: number;
  }>;
  findByRoomId(roomId: string): Promise<Booking[]>;
  findByOwnerId(ownerId: string, page?: number, limit?: number): Promise<{
    bookings: Booking[];
    total: number;
  }>;
  create(bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking>;
  update(id: string, bookingData: Partial<Booking>): Promise<Booking | null>;
  delete(id: string): Promise<boolean>;

  /**
   * ATOMIC booking creation with transaction safety.
   * Validates room exists, is active, owner exists, and no duplicate booking.
   * Returns created booking or throws typed AppError.
   */
  createBookingTransactional(bookingData: {
    roomId: string;
    tenantId: string | null;
    tenantName: string;
    tenantEmail: string;
    tenantPhone: string;
    moveInDate: Date;
    message: string | null;
  }): Promise<Booking>;

  /**
   * OPTIMISTIC LOCK UPDATE — Only updates if current status matches expectedStatus.
   * Returns null if 0 rows affected (concurrent modification detected).
   */
  updateWithOptimisticLock(id: string, expectedStatus: string, data: Partial<Booking>): Promise<Booking | null>;
}

// ============================================================================
// TENANT SUBSCRIPTION REPOSITORY
// ============================================================================
export interface ITenantSubscriptionRepository {
  findActiveByUserId(userId: string): Promise<TenantSubscription[]>;
  findActiveByUserIdAndCity(userId: string, city: string): Promise<TenantSubscription | null>;
  findById(id: string): Promise<TenantSubscription | null>;
  create(data: Omit<TenantSubscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantSubscription>;
  update(id: string, data: Partial<TenantSubscription>): Promise<TenantSubscription | null>;
  incrementPropertyViews(id: string): Promise<TenantSubscription | null>;
}

// ============================================================================
// PAYMENT REPOSITORY
// ============================================================================
export interface IPaymentRepository {
  findAll(): Promise<Payment[]>;
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  findBySubscriptionId(subscriptionId: string): Promise<Payment[]>;
  create(paymentData: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment>;
  update(id: string, paymentData: Partial<Payment>): Promise<Payment | null>;
}

// ============================================================================
// PROPERTY VIEW REPOSITORY
// ============================================================================
export interface IPropertyViewRepository {
  create(data: {
    userId: string;
    roomId: string;
    city: string;
  }): Promise<any>;
  findByUserAndCity(userId: string, city: string): Promise<any[]>;
  countByUserAndCity(userId: string, city: string): Promise<number>;
}