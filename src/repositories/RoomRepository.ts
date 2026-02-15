import { Room, RoomFilters } from '../models/Room';
import { rooms } from '../data';
import { normalizeCity } from '../utils/normalize';
export class RoomRepository {
  async findAll(filters?: RoomFilters): Promise<{
    rooms: Room[];
    total: number;
  }> {
    let filteredRooms = [...rooms];

    // Apply filters
    if (filters?.city) {
      const normalizedCity = normalizeCity(filters.city);
      filteredRooms = filteredRooms.filter((r) => r.city.toLowerCase() === normalizedCity);
    }
    if (filters?.roomType) {
      filteredRooms = filteredRooms.filter((r) => r.roomType === filters.roomType);
    }
    if (filters?.idealFor) {
      filteredRooms = filteredRooms.filter((r) => r.idealFor === filters.idealFor);
    }
    if (filters?.minPrice !== undefined) {
      filteredRooms = filteredRooms.filter((r) => r.pricePerMonth >= filters.minPrice!);
    }
    if (filters?.maxPrice !== undefined) {
      filteredRooms = filteredRooms.filter((r) => r.pricePerMonth <= filters.maxPrice!);
    }
    if (filters?.isPopular !== undefined) {
      filteredRooms = filteredRooms.filter((r) => r.isPopular === filters.isPopular);
    }
    if (filters?.isVerified !== undefined) {
      filteredRooms = filteredRooms.filter((r) => r.isVerified === filters.isVerified);
    }
    if (filters?.onlyActive) {
      filteredRooms = filteredRooms.filter((r) => r.isActive === true);
    }

    // Pagination
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRooms = filteredRooms.slice(startIndex, endIndex);
    return {
      rooms: paginatedRooms.map((r) => this.mapToRoom(r)),
      total: filteredRooms.length
    };
  }
  async findById(id: string): Promise<Room | null> {
    const room = rooms.find((r) => r.id === id);
    return room ? this.mapToRoom(room) : null;
  }
  async findByOwnerId(ownerId: string): Promise<Room[]> {
    return rooms.filter((r) => r.ownerId === ownerId).map((r) => this.mapToRoom(r));
  }
  async create(roomData: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>): Promise<Room> {
    const newRoom = {
      id: String(rooms.length + 1),
      ...roomData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    rooms.push(newRoom as any);
    return this.mapToRoom(newRoom as any);
  }
  async update(id: string, roomData: Partial<Room>): Promise<Room | null> {
    const index = rooms.findIndex((r) => r.id === id);
    if (index === -1) return null;
    rooms[index] = {
      ...rooms[index],
      ...roomData,
      updatedAt: new Date()
    } as any;
    return this.mapToRoom(rooms[index]);
  }
  async delete(id: string): Promise<boolean> {
    const index = rooms.findIndex((r) => r.id === id);
    if (index === -1) return false;
    rooms.splice(index, 1);
    return true;
  }
  // async toggleStatus(id: string): Promise<Room | null> {
  //   const index = rooms.findIndex((r) => r.id === id);
  //   if (index === -1) return null;
  //   rooms[index].isActive = !rooms[index].isActive;
  //   rooms[index].updatedAt = new Date();
  //   return this.mapToRoom(rooms[index]);
  // }
  async toggleRoomStatus(id: string): Promise<Room | null> {
    const index = rooms.findIndex((r) => r.id === id);
    if (index === -1) return null;
    rooms[index].isActive = !rooms[index].isActive;
    rooms[index].updatedAt = new Date();
    return this.mapToRoom(rooms[index]);
  }
  private mapToRoom(data: any): Room {
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      city: data.city,
      location: data.location,
      landmark: data.landmark,
      pricePerMonth: data.pricePerMonth,
      roomType: data.roomType,
      idealFor: data.idealFor,
      amenities: data.amenities,
      images: data.images,
      rating: data.rating,
      reviewsCount: data.reviewsCount,
      isPopular: data.isPopular,
      isVerified: data.isVerified,
      isActive: data.isActive,
      ownerId: data.ownerId,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString()
    };
  }
}