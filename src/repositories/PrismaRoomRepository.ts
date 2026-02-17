import {
  PrismaClient,
  Room as PrismaRoom,
  Prisma,
  ReviewStatus } from
'@prisma/client';
import { Room as DomainRoom } from '../models/Room';
import { IRoomRepository } from './interfaces';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
export class PrismaRoomRepository implements IRoomRepository {
  private prisma: PrismaClient;
  constructor(prismaClient?: PrismaClient) {
    // Use provided client or get singleton
    this.prisma = prismaClient || getPrismaClient();
  }

  /**
   * Map Prisma Room to domain Room type
   */
  private toDomain(r: PrismaRoom): DomainRoom {
    return {
      id: r.id,
      title: r.title,
      description: r.description || '',
      city: r.city || '',
      location: r.location,
      landmark: r.landmark || '',
      pricePerMonth: r.pricePerMonth,
      roomType: r.roomType as DomainRoom['roomType'],
      idealFor: (r.idealFor || []) as DomainRoom['idealFor'],
      amenities: r.amenities || [],
      images: r.images || [],
      rating: r.rating || 0,
      reviewsCount: r.reviewsCount || 0,
      isPopular: r.isPopular || false,
      isActive: r.isActive,
      ownerId: r.ownerId,
      createdAt:
      r.createdAt instanceof Date ?
      r.createdAt.toISOString() :
      String(r.createdAt),
      updatedAt:
      r.updatedAt instanceof Date ?
      r.updatedAt.toISOString() :
      String(r.updatedAt)
    };
  }

  /**
   * PRODUCTION-SAFE: Validate and normalize room data
   */
  private async normalizeAndValidateRoomData(data: any): Promise<any> {
    // 1. VALIDATE REQUIRED FIELDS
    const requiredFields = [
    'title',
    'city',
    'location',
    'pricePerMonth',
    'roomType',
    'ownerId'];

    for (const field of requiredFields) {
      if (
      data[field] === undefined ||
      data[field] === null ||
      data[field] === '')
      {
        throw new Error(`${field} is required`);
      }
    }

    // 2. NORMALIZE STRING FIELDS (trim whitespace)
    const normalizedData = {
      title: String(data.title).trim(),
      description: data.description ? String(data.description).trim() : '',
      city: data.city ? String(data.city).trim() : '',
      location: String(data.location).trim(),
      landmark: data.landmark ? String(data.landmark).trim() : '',
      pricePerMonth: Number(data.pricePerMonth),
      roomType: data.roomType ? String(data.roomType).trim() : '',
      idealFor: Array.isArray(data.idealFor) ?
      data.idealFor :
      data.idealFor ?
      [String(data.idealFor).trim()] :
      [],
      amenities: Array.isArray(data.amenities) ? data.amenities : [],
      images: Array.isArray(data.images) ? data.images : [],
      rating: 0,
      reviewsCount: 0,
      isPopular: false,
      reviewStatus: ReviewStatus.PENDING,
      isActive: true,
      ownerId: data.ownerId
    };
    return normalizedData;
  }
  async create(data: any): Promise<DomainRoom> {
    try {
      logger.info('Creating room', {
        ownerId: data.ownerId
      });

      // Normalize and validate data
      const normalizedData = await this.normalizeAndValidateRoomData(data);

      // Create room in database
      const room = await this.prisma.room.create({
        data: normalizedData,
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      logger.info('Room created successfully', {
        roomId: room.id
      });
      return this.toDomain(room);
    } catch (error: any) {
      logger.error('Error creating room', {
        error: error.message,
        code: error.code,
        meta: error.meta
      });

      // Re-throw validation errors as-is
      if (error.message && error.message.includes('is required')) {
        throw error;
      }

      // Handle Prisma-specific errors with detailed messages
      if (error.code === 'P2002') {
        throw new Error('A property with this information already exists');
      }
      if (error.code === 'P2003') {
        throw new Error(
          `Invalid reference: ${error.meta?.field_name || 'foreign key constraint failed'}`
        );
      }
      if (error.code === 'P2025') {
        throw new Error('Record not found');
      }

      // If it's a Prisma error, include more details
      if (error.code && error.code.startsWith('P')) {
        throw new Error(`Database error (${error.code}): ${error.message}`);
      }

      // Generic fallback with original error message for debugging
      throw new Error(`Failed to create room: ${error.message}`);
    }
  }
  async findById(id: string): Promise<DomainRoom | null> {
    try {
      const room = await this.prisma.room.findUnique({
        where: {
          id
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      return room ? this.toDomain(room) : null;
    } catch (error: any) {
      logger.error('Error finding room by id', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find room');
    }
  }

  /**
   * PRODUCTION-SAFE findAll with type-safe where clause
   * ✅ Uses Prisma.RoomWhereInput for compile-time validation
   * ✅ Removed isVerified (does not exist in schema)
   * ✅ Uses reviewStatus enum for verification filtering
   * ✅ Maps Prisma types to domain Room via toDomain()
   */
  async findAll(filters?: any): Promise<{
    rooms: DomainRoom[];
    total: number;
  }> {
    try {
      // ========== SAFE PAGINATION PARSING ==========
      const page = Math.max(parseInt(String(filters?.page)) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(String(filters?.limit)) || 20, 1),
        100
      );
      const skip = (page - 1) * limit;

      // ========== TYPE-SAFE WHERE CLAUSE ==========
      const where: Prisma.RoomWhereInput = {};

      // String filters
      if (
      filters?.city &&
      typeof filters.city === 'string' &&
      filters.city.trim())
      {
        where.city = filters.city.trim();
      }
      if (
      filters?.roomType &&
      typeof filters.roomType === 'string' &&
      filters.roomType.trim())
      {
        where.roomType = filters.roomType.trim();
      }

      // Numeric filters (price range)
      if (
      filters?.minPrice !== undefined &&
      filters?.minPrice !== '' &&
      filters?.minPrice !== null)
      {
        const minPrice = parseFloat(String(filters.minPrice));
        if (!isNaN(minPrice)) {
          where.pricePerMonth = {
            ...(where.pricePerMonth as object || {}),
            gte: minPrice
          };
        }
      }
      if (
      filters?.maxPrice !== undefined &&
      filters?.maxPrice !== '' &&
      filters?.maxPrice !== null)
      {
        const maxPrice = parseFloat(String(filters.maxPrice));
        if (!isNaN(maxPrice)) {
          where.pricePerMonth = {
            ...(where.pricePerMonth as object || {}),
            lte: maxPrice
          };
        }
      }

      // Boolean filters
      if (filters?.isPopular !== undefined && filters?.isPopular !== '') {
        where.isPopular =
        filters.isPopular === true || filters.isPopular === 'true';
      }
      if (filters?.onlyActive !== undefined && filters?.onlyActive !== '') {
        where.isActive =
        filters.onlyActive === true || filters.onlyActive === 'true';
      }

      // ✅ FIX: Use reviewStatus instead of isVerified (which doesn't exist)
      if (filters?.isVerified !== undefined && filters?.isVerified !== '') {
        const isVerified =
        filters.isVerified === true || filters.isVerified === 'true';
        if (isVerified) {
          where.reviewStatus = ReviewStatus.APPROVED;
        }
      }

      // ========== EXECUTE QUERIES ==========
      const total = await this.prisma.room.count({
        where
      });
      const prismaRooms = await this.prisma.room.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      return {
        rooms: prismaRooms.map((r) => this.toDomain(r)),
        total
      };
    } catch (error: any) {
      logger.error('Error finding all rooms', {
        error: error.message,
        code: error.code,
        meta: error.meta
      });
      throw new Error(`Failed to find rooms: ${error.message}`);
    }
  }
  async findByOwnerId(ownerId: string): Promise<DomainRoom[]> {
    try {
      const rooms = await this.prisma.room.findMany({
        where: {
          ownerId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      return rooms.map((r) => this.toDomain(r));
    } catch (error: any) {
      logger.error('Error finding rooms by owner', {
        error: error.message,
        stack: error.stack,
        ownerId
      });
      throw new Error('Failed to find rooms');
    }
  }
  async findByCity(city: string): Promise<DomainRoom[]> {
    try {
      const rooms = await this.prisma.room.findMany({
        where: {
          city
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      return rooms.map((r) => this.toDomain(r));
    } catch (error: any) {
      logger.error('Error finding rooms by city', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find rooms');
    }
  }
  async update(
  id: string,
  data: Partial<DomainRoom>)
  : Promise<DomainRoom | null> {
    try {
      const { id: _id, ownerId, createdAt, updatedAt, ...rest } = data;
      const safeUpdate: Prisma.RoomUpdateInput = {
        ...rest
      };
      const room = await this.prisma.room.update({
        where: {
          id
        },
        data: safeUpdate
      });
      logger.info('Room updated', {
        roomId: id
      });
      return this.toDomain(room);
    } catch (error: any) {
      logger.error('Error updating room', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to update room');
    }
  }
  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.room.delete({
        where: {
          id
        }
      });
      return true;
    } catch (error: any) {
      logger.error('Error deleting room', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to delete room');
    }
  }
  async search(filters: any): Promise<DomainRoom[]> {
    try {
      const where: Prisma.RoomWhereInput = {
        isActive: true
      };
      if (filters.city) {
        where.city = filters.city;
      }
      if (filters.minPrice || filters.maxPrice) {
        where.pricePerMonth = {};
        if (filters.minPrice)
        (where.pricePerMonth as any).gte = Number(filters.minPrice);
        if (filters.maxPrice)
        (where.pricePerMonth as any).lte = Number(filters.maxPrice);
      }
      if (filters.roomType) {
        where.roomType = filters.roomType;
      }
      const rooms = await this.prisma.room.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      return rooms.map((r) => this.toDomain(r));
    } catch (error: any) {
      logger.error('Error searching rooms', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to search rooms');
    }
  }
  async toggleRoomStatus(id: string): Promise<DomainRoom | null> {
    const room = await this.prisma.room.findUnique({
      where: {
        id
      },
      select: {
        isActive: true
      }
    });
    if (!room) return null;
    const updatedRoom = await this.prisma.room.update({
      where: {
        id
      },
      data: {
        isActive: !room.isActive
      }
    });
    return updatedRoom ? this.toDomain(updatedRoom) : null;
  }
}