import { IRoomRepository } from '../repositories/interfaces';
import { Room, CreateRoomInput, UpdateRoomInput, RoomFilters } from '../models/Room';
import { CloudinaryService } from './CloudinaryService';
export class RoomService {
  private roomRepository: IRoomRepository;
  private cloudinaryService: CloudinaryService;
  constructor(roomRepository: IRoomRepository) {
    this.roomRepository = roomRepository;
    this.cloudinaryService = new CloudinaryService();
  }
  async getAllRooms(filters: RoomFilters): Promise<{
    rooms: Room[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const result = await this.roomRepository.findAll({
      city: filters.city,
      roomType: filters.roomType,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      isPopular: filters.isPopular,
      onlyActive: filters.onlyActive ?? true,
      isVerified: true,
      page,
      limit
    });
    return {
      ...result,
      page,
      limit
    };
  }
  async getRoomById(id: string): Promise<Room> {
    const room = await this.roomRepository.findById(id);
    if (!room) {
      throw new Error('Room not found');
    }
    return room;
  }

  /**
   * Create room - accepts single object with ownerId included
   * This matches the RoomController's call signature
   */
  async createRoom(roomData: any): Promise<Room> {
    console.log('[RoomService] Creating room with data:', JSON.stringify(roomData, null, 2));

    // Validate ownerId is present
    if (!roomData.ownerId) {
      throw new Error('ownerId is required');
    }

    // Pass data directly to repository
    return await this.roomRepository.create(roomData);
  }
  async updateRoom(id: string, ownerId: string, input: UpdateRoomInput): Promise<Room> {
    const room = await this.roomRepository.findById(id);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.ownerId !== ownerId) {
      throw new Error('You can only update your own properties');
    }
    // console.log('[RoomService] Updating room with data:', JSON.stringify(input, null, 2));
    const updatedRoom = await this.roomRepository.update(id, input);
    if (!updatedRoom) {
      throw new Error('Failed to update room');
    }
    return updatedRoom;
  }
  async deleteRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.ownerId !== userId) {
      throw new Error('Unauthorized to delete this room');
    }

    // Delete Cloudinary images before deleting room
    if (room.images && room.images.length > 0) {
      try {
        await this.cloudinaryService.deleteImages(room.images);
      } catch (error) {
        console.error('Error deleting Cloudinary images:', error);
        // Continue with room deletion even if image cleanup fails
      }
    }
    await this.roomRepository.delete(roomId);
  }
  async toggleRoomStatus(id: string, ownerId: string): Promise<Room> {
    // console.log('[RoomService] Toggling room status for room:', id);
    const room = await this.roomRepository.findById(id);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.ownerId !== ownerId) {
      throw new Error('You can only update your own properties');
    }
    // console.log('[RoomService] Toggling room status for room: from RoomService', id); // working
    const updatedRoom = await this.roomRepository.toggleRoomStatus(id);
    if (!updatedRoom) {
      throw new Error('Failed to update room status');
    }
    return updatedRoom;
  }

  //   async toggleRoomStatus(id: string, ownerId: string): Promise<Room> {
  //   const room = await this.roomRepository.findById(id);

  //   if (!room) throw new Error('Room not found');
  //   if (room.ownerId !== ownerId) {
  //     throw new Error('You can only update your own properties');
  //   }

  //   return this.roomRepository.update(id, {
  //     isActive: !room.isActive
  //   });
  // }

  async getOwnerRooms(ownerId: string): Promise<Room[]> {
    return this.roomRepository.findByOwnerId(ownerId);
  }
}