import { IBookingRepository } from './interfaces';
import { Booking, BookingStatus } from '../models/Booking';
import { getPrismaClient } from '../utils/prisma';
import { NotFoundError, DuplicateBookingError, BusinessLogicError, mapPrismaError } from '../errors/AppErrors';
import { logger } from '../utils/logger';
import { writeOutboxEvent } from '../services/OutboxWriter';
import { OutboxAggregateType, OutboxEventType, BookingCreatedPayload } from '../services/OutboxEventTypes';

/**
 * PRODUCTION-GRADE Prisma Booking Repository
 *
 * Key improvements:
 * 1. createBookingTransactional — atomic operation with prisma.$transaction
 * 2. Proper Prisma error mapping via mapPrismaError
 * 3. Typed errors instead of generic Error()
 * 4. Consistent date handling (Date objects, not strings)
 */
export class PrismaBookingRepository implements IBookingRepository {
  private prisma;
  constructor(prismaClient?: any) {
    this.prisma = prismaClient || getPrismaClient();
  }
  async findById(id: string): Promise<Booking | null> {
    const booking = await this.prisma.booking.findUnique({
      where: {
        id
      }
    });
    return booking ? this.toDomain(booking) : null;
  }
  async findAll(): Promise<Booking[]> {
    const bookings = await this.prisma.booking.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    return bookings.map(this.toDomain);
  }
  async findByRoomId(roomId: string): Promise<Booking[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return bookings.map(this.toDomain);
  }
  async findByOwnerId(ownerId: string, page: number = 1, limit: number = 20): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;
    const [bookings, total] = await Promise.all([this.prisma.booking.findMany({
      where: {
        ownerId
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    }), this.prisma.booking.count({
      where: {
        ownerId
      }
    })]);
    return {
      bookings: bookings.map(this.toDomain),
      total
    };
  }
  async findByTenantId(tenantId: string, page: number = 1, limit: number = 20): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const skip = (page - 1) * limit;
    const [bookings, total] = await Promise.all([this.prisma.booking.findMany({
      where: {
        tenantId
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    }), this.prisma.booking.count({
      where: {
        tenantId
      }
    })]);
    return {
      bookings: bookings.map(this.toDomain),
      total
    };
  }
  async create(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking> {
    try {
      const created = await this.prisma.booking.create({
        data: {
          roomId: booking.roomId,
          ownerId: booking.ownerId,
          tenantId: booking.tenantId || null,
          tenantName: booking.tenantName,
          tenantEmail: booking.tenantEmail,
          tenantPhone: booking.tenantPhone,
          moveInDate: booking.moveInDate,
          message: booking.message || null,
          status: booking.status || 'PENDING'
        }
      });
      return this.toDomain(created);
    } catch (error: any) {
      throw mapPrismaError(error);
    }
  }

  /**
   * ATOMIC BOOKING CREATION — prisma.$transaction + OUTBOX EVENT
   *
   * Guarantees ALL of these in a single database transaction:
   * 1. Room exists
   * 2. Room isActive = true
   * 3. Owner exists (via room.ownerId FK)
   * 4. No duplicate booking (same tenant + room + moveInDate with active status)
   * 5. Creates booking
   * 6. ★ NEW: Writes BOOKING_CREATED outbox event
   *
   * If ANY step fails, the entire transaction rolls back.
   * No partial state. No race conditions. No ghost bookings.
   *
   * WHY THE OUTBOX EVENT IS IN THE SAME TRANSACTION:
   * Before: Booking committed → notification fired async → server crashes → notification LOST
   * After:  Booking + outbox event committed atomically → worker delivers notification later
   *
   * The outbox event is just another row in PostgreSQL. Same transaction,
   * same ACID guarantees. If the booking exists, the event exists.
   * If the transaction rolls back, neither exists. Zero ghost bookings.
   */
  async createBookingTransactional(bookingData: {
    roomId: string;
    tenantId: string | null;
    tenantName: string;
    tenantEmail: string;
    tenantPhone: string;
    moveInDate: Date;
    message: string | null;
  }): Promise<Booking> {
    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        // STEP 1: Verify room exists and is active
        const room = await tx.room.findUnique({
          where: {
            id: bookingData.roomId
          },
          select: {
            id: true,
            isActive: true,
            ownerId: true,
            title: true,
            city: true
          }
        });
        if (!room) {
          throw new NotFoundError('Room', bookingData.roomId);
        }
        if (!room.isActive) {
          throw new BusinessLogicError('Room is not currently available for booking');
        }

        // STEP 2: Verify owner exists
        const owner = await tx.user.findUnique({
          where: {
            id: room.ownerId
          },
          select: {
            id: true,
            name: true
          }
        });
        if (!owner) {
          throw new NotFoundError('Room owner');
        }

        // STEP 3: Check for duplicate ACTIVE booking (same tenant + same room)
        // Lead-based model: one active booking per tenant per property.
        // Tenant can retry after rejection. Multiple tenants can book same property.
        const existingBooking = await tx.booking.findFirst({
          where: {
            roomId: bookingData.roomId,
            tenantEmail: bookingData.tenantEmail.toLowerCase(),
            status: {
              in: ['PENDING', 'APPROVED']
            }
          }
        });
        if (existingBooking) {
          throw new DuplicateBookingError();
        }

        // STEP 4: Create booking atomically
        const normalizedDate = new Date(bookingData.moveInDate);
        normalizedDate.setUTCHours(0, 0, 0, 0);
        const booking = await tx.booking.create({
          data: {
            roomId: bookingData.roomId,
            ownerId: room.ownerId,
            tenantId: bookingData.tenantId,
            tenantName: bookingData.tenantName,
            tenantEmail: bookingData.tenantEmail.toLowerCase(),
            tenantPhone: bookingData.tenantPhone,
            moveInDate: normalizedDate,
            message: bookingData.message,
            status: 'PENDING'
          }
        });

        // ★ STEP 5: Write BOOKING_CREATED outbox event (SAME TRANSACTION)
        // This is the key to eliminating ghost bookings.
        // If this transaction commits, the event is guaranteed to exist.
        // The outbox worker will pick it up and send the notification.
        const outboxPayload: BookingCreatedPayload = {
          bookingId: booking.id,
          roomId: room.id,
          roomTitle: room.title,
          roomCity: room.city,
          ownerId: room.ownerId,
          ownerName: owner.name,
          tenantId: bookingData.tenantId,
          tenantName: bookingData.tenantName,
          tenantEmail: bookingData.tenantEmail.toLowerCase(),
          tenantPhone: bookingData.tenantPhone,
          moveInDate: normalizedDate.toISOString(),
          message: bookingData.message,
          status: 'PENDING',
          createdAt: booking.createdAt.toISOString()
        };
        await writeOutboxEvent(tx, {
          aggregateType: OutboxAggregateType.BOOKING,
          aggregateId: booking.id,
          eventType: OutboxEventType.BOOKING_CREATED,
          payload: outboxPayload
        });
        return {
          booking,
          room
        };
      }, {
        isolationLevel: 'Serializable',
        timeout: 10000
      });
      logger.info('Booking created via transaction (with outbox event)', {
        bookingId: result.booking.id,
        roomId: result.room.id,
        roomTitle: result.room.title
      });
      return this.toDomain(result.booking);
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      throw mapPrismaError(error);
    }
  }
  async update(id: string, data: Partial<Booking>): Promise<Booking | null> {
    try {
      const updated = await this.prisma.booking.update({
        where: {
          id
        },
        data: {
          ...(data.status && {
            status: data.status
          }),
          ...(data.tenantName && {
            tenantName: data.tenantName
          }),
          ...(data.tenantEmail && {
            tenantEmail: data.tenantEmail
          }),
          ...(data.tenantPhone && {
            tenantPhone: data.tenantPhone
          }),
          ...(data.moveInDate && {
            moveInDate: data.moveInDate
          }),
          ...(data.message !== undefined && {
            message: data.message
          })
        }
      });
      return this.toDomain(updated);
    } catch (error: any) {
      if (error?.code === 'P2025') return null;
      throw mapPrismaError(error);
    }
  }

  /**
   * OPTIMISTIC LOCK UPDATE — Only updates if current status matches expectedStatus.
   * Returns null if 0 rows affected (concurrent modification detected).
   */
  async updateWithOptimisticLock(id: string, expectedStatus: string, data: Partial<Booking>): Promise<Booking | null> {
    try {
      // updateMany allows WHERE on non-unique fields; returns count
      const result = await this.prisma.booking.updateMany({
        where: {
          id,
          status: expectedStatus as any
        },
        data: {
          ...(data.status && {
            status: data.status
          })
        }
      });
      if (result.count === 0) {
        return null; // Concurrent modification — status already changed
      }

      // Fetch and return the updated booking
      const updated = await this.prisma.booking.findUnique({
        where: {
          id
        }
      });
      return updated ? this.toDomain(updated) : null;
    } catch (error: any) {
      throw mapPrismaError(error);
    }
  }
  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.booking.delete({
        where: {
          id
        }
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') return false;
      throw mapPrismaError(error);
    }
  }

  /**
   * Convert Prisma model to domain model
   * Normalizes dates to ISO strings for API consistency
   * Normalizes status to lowercase for frontend compatibility
   */
  private toDomain(prismaBooking: any): Booking {
    return {
      id: prismaBooking.id,
      roomId: prismaBooking.roomId,
      ownerId: prismaBooking.ownerId,
      tenantId: prismaBooking.tenantId,
      tenantName: prismaBooking.tenantName,
      tenantEmail: prismaBooking.tenantEmail,
      tenantPhone: prismaBooking.tenantPhone,
      moveInDate: prismaBooking.moveInDate instanceof Date ? prismaBooking.moveInDate.toISOString() : prismaBooking.moveInDate,
      message: prismaBooking.message,
      status: (typeof prismaBooking.status === 'string' ? prismaBooking.status.toLowerCase() : prismaBooking.status) as BookingStatus,
      createdAt: prismaBooking.createdAt instanceof Date ? prismaBooking.createdAt.toISOString() : prismaBooking.createdAt,
      updatedAt: prismaBooking.updatedAt instanceof Date ? prismaBooking.updatedAt.toISOString() : prismaBooking.updatedAt
    };
  }
}