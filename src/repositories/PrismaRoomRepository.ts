import { PrismaClient, Room, Prisma, ReviewStatus } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
export class PrismaRoomRepository {
  private prisma: PrismaClient;
  constructor(prismaClient?: PrismaClient) {
    // Use provided client or get singleton
    this.prisma = prismaClient || getPrismaClient();
    console.log('[PrismaRoomRepository] Initialized with Prisma client');
  }

  /**
   * PRODUCTION-SAFE: Validate and normalize room data
   */
  private async normalizeAndValidateRoomData(data: any): Promise<any> {
    console.log('[PrismaRoomRepository] Raw input data:', JSON.stringify(data, null, 2));

    // 1. VALIDATE REQUIRED FIELDS
    const requiredFields = ['title', 'city', 'location', 'pricePerMonth', 'roomType', 'ownerId'];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        console.error(`[PrismaRoomRepository] Missing required field: ${field}`);
        throw new Error(`${field} is required`);
      }
    }
    console.log('[PrismaRoomRepository] All required fields present');

    // 2. NORMALIZE STRING FIELDS (trim whitespace)
    const normalizedData = {
      title: String(data.title).trim(),
      description: data.description ? String(data.description).trim() : '',
      city: data.city ? String(data.city).trim() : '',
      location: String(data.location).trim(),
      landmark: data.landmark ? String(data.landmark).trim() : '',
      pricePerMonth: Number(data.pricePerMonth),
      roomType: data.roomType ? String(data.roomType).trim() : '',
      idealFor: Array.isArray(data.idealFor) ? data.idealFor : data.idealFor ? [String(data.idealFor).trim()] : [],
      amenities: Array.isArray(data.amenities) ? data.amenities : [],
      images: Array.isArray(data.images) ? data.images : [],
      rating: 0,
      reviewsCount: 0,
      isPopular: false,
      reviewStatus: ReviewStatus.PENDING,
      isActive: true,
      ownerId: data.ownerId
    };
    console.log('[PrismaRoomRepository] Normalized data for Prisma:', JSON.stringify(normalizedData, null, 2));
    return normalizedData;
  }
  async create(data: any): Promise<Room> {
    try {
      console.log('[PrismaRoomRepository] ========== CREATE ROOM START ==========');
      console.log('[PrismaRoomRepository] Input data:', JSON.stringify(data, null, 2));

      // Normalize and validate data
      const normalizedData = await this.normalizeAndValidateRoomData(data);
      console.log('[PrismaRoomRepository] Calling Prisma create...');

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
      console.log('[PrismaRoomRepository] ✅ Room created successfully:', room.id);
      console.log('[PrismaRoomRepository] ========== CREATE ROOM END ==========');
      return room;
    } catch (error: any) {
      console.error('[PrismaRoomRepository] ========== CREATE ROOM ERROR ==========');
      console.error('[PrismaRoomRepository] Error type:', error.constructor.name);
      console.error('[PrismaRoomRepository] Error message:', error.message);
      console.error('[PrismaRoomRepository] Error code:', error.code);
      console.error('[PrismaRoomRepository] Full error:', error);
      if (error.stack) {
        console.error('[PrismaRoomRepository] Stack trace:', error.stack);
      }

      // Log Prisma-specific error details
      if (error.meta) {
        console.error('[PrismaRoomRepository] Prisma meta:', error.meta);
      }
      if (error.clientVersion) {
        console.error('[PrismaRoomRepository] Prisma client version:', error.clientVersion);
      }
      console.error('[PrismaRoomRepository] ========================================');

      // Re-throw validation errors as-is
      if (error.message && error.message.includes('is required')) {
        throw error;
      }

      // Handle Prisma-specific errors with detailed messages
      if (error.code === 'P2002') {
        throw new Error('A property with this information already exists');
      }
      if (error.code === 'P2003') {
        throw new Error(`Invalid reference: ${error.meta?.field_name || 'foreign key constraint failed'}`);
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
  async findById(id: string): Promise<Room | null> {
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
      return room;
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
   */
  async findAll(filters?: any): Promise<{
    rooms: Room[];
    total: number;
  }> {
    try {
      console.log('[PrismaRoomRepository] ========== FIND ALL START ==========');
      console.log('[PrismaRoomRepository] Raw filters:', JSON.stringify(filters, null, 2));

      // ========== SAFE PAGINATION PARSING ==========
      const page = Math.max(parseInt(String(filters?.page)) || 1, 1);
      const limit = Math.min(Math.max(parseInt(String(filters?.limit)) || 20, 1), 100);
      const skip = (page - 1) * limit;
      console.log('[PrismaRoomRepository] Pagination:', {
        page,
        limit,
        skip
      });

      // ========== TYPE-SAFE WHERE CLAUSE ==========
      const where: Prisma.RoomWhereInput = {};

      // String filters
      if (filters?.city && typeof filters.city === 'string' && filters.city.trim()) {
        where.city = filters.city.trim();
      }
      if (filters?.roomType && typeof filters.roomType === 'string' && filters.roomType.trim()) {
        where.roomType = filters.roomType.trim();
      }

      // Numeric filters (price range)
      if (filters?.minPrice !== undefined && filters?.minPrice !== '' && filters?.minPrice !== null) {
        const minPrice = parseFloat(String(filters.minPrice));
        if (!isNaN(minPrice)) {
          where.pricePerMonth = {
            ...(where.pricePerMonth as object || {}),
            gte: minPrice
          };
        }
      }
      if (filters?.maxPrice !== undefined && filters?.maxPrice !== '' && filters?.maxPrice !== null) {
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
        where.isPopular = filters.isPopular === true || filters.isPopular === 'true';
      }
      if (filters?.onlyActive !== undefined && filters?.onlyActive !== '') {
        where.isActive = filters.onlyActive === true || filters.onlyActive === 'true';
      }

      // ✅ FIX: Use reviewStatus instead of isVerified (which doesn't exist)
      // If isVerified filter is requested, map it to reviewStatus = APPROVED
      if (filters?.isVerified !== undefined && filters?.isVerified !== '') {
        const isVerified = filters.isVerified === true || filters.isVerified === 'true';
        if (isVerified) {
          where.reviewStatus = ReviewStatus.APPROVED;
        }
      }
      console.log('[PrismaRoomRepository] Where clause:', JSON.stringify(where, null, 2));

      // ========== EXECUTE QUERIES ==========
      const total = await this.prisma.room.count({
        where
      });
      console.log('[PrismaRoomRepository] Total count:', total);
      const rooms = await this.prisma.room.findMany({
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
      console.log('[PrismaRoomRepository] Rooms found:', rooms.length);
      console.log('[PrismaRoomRepository] ========== FIND ALL SUCCESS ==========');
      return {
        rooms,
        total
      };
    } catch (error: any) {
      console.error('[PrismaRoomRepository] ========== FIND ALL ERROR ==========');
      console.error('[PrismaRoomRepository] Error type:', error.constructor.name);
      console.error('[PrismaRoomRepository] Error message:', error.message);
      console.error('[PrismaRoomRepository] Error code:', error.code);
      if (error.meta) {
        console.error('[PrismaRoomRepository] Prisma meta:', JSON.stringify(error.meta, null, 2));
      }
      if (error.stack) {
        console.error('[PrismaRoomRepository] Stack:', error.stack);
      }
      console.error('[PrismaRoomRepository] ==========================================');
      logger.error('Error finding all rooms', {
        error: error.message,
        code: error.code,
        meta: error.meta
      });
      throw new Error(`Failed to find rooms: ${error.message}`);
    }
  }
  async findByOwnerId(ownerId: string): Promise<Room[]> {
    try {
      const rooms = await this.prisma.room.findMany({
        where: {
          ownerId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      return rooms;
    } catch (error: any) {
      logger.error('Error finding rooms by owner', {
        error: error.message,
        stack: error.stack,
        ownerId
      });
      throw new Error('Failed to find rooms');
    }
  }
  async findByCity(city: string): Promise<Room[]> {
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
      return rooms;
    } catch (error: any) {
      logger.error('Error finding rooms by city', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find rooms');
    }
  }
  async update(id: string, data: Partial<Room>): Promise<Room> {
    try {
      const updateData = {
        ...data
      };
      const room = await this.prisma.room.update({
        where: {
          id
        },
        data: updateData
      });
      console.log(`[PrismaRoomRepository] Room ${id} updated`);
      return room;
    } catch (error: any) {
      logger.error('Error updating room', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to update room');
    }
  }
  async delete(id: string): Promise<Room> {
    try {
      const room = await this.prisma.room.delete({
        where: {
          id
        }
      });
      return room;
    } catch (error: any) {
      logger.error('Error deleting room', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to delete room');
    }
  }
  async search(filters: any): Promise<Room[]> {
    try {
      const where: Prisma.RoomWhereInput = {
        isActive: true
      };
      if (filters.city) {
        where.city = filters.city;
      }
      if (filters.minPrice || filters.maxPrice) {
        where.pricePerMonth = {};
        if (filters.minPrice) (where.pricePerMonth as any).gte = Number(filters.minPrice);
        if (filters.maxPrice) (where.pricePerMonth as any).lte = Number(filters.maxPrice);
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
      return rooms;
    } catch (error: any) {
      logger.error('Error searching rooms', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to search rooms');
    }
  }
  async toggleRoomStatus(id: string): Promise<Room | null> {
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
    return updatedRoom;
  }
}