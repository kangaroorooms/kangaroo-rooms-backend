import { Booking } from '../models/Booking';
import { bookings } from '../data';
export class BookingRepository {
  async findAll(): Promise<Booking[]> {
    return bookings.map((b) => this.mapToBooking(b));
  }
  async findById(id: string): Promise<Booking | null> {
    const booking = bookings.find((b) => b.id === id);
    return booking ? this.mapToBooking(booking) : null;
  }
  async findByTenantId(tenantId: string, page: number = 1, limit: number = 20): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const tenantBookings = bookings.filter((b) => b.tenantId === tenantId);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedBookings = tenantBookings.slice(startIndex, endIndex);
    return {
      bookings: paginatedBookings.map((b) => this.mapToBooking(b)),
      total: tenantBookings.length
    };
  }
  async findByRoomId(roomId: string): Promise<Booking[]> {
    return bookings.filter((b) => b.roomId === roomId).map((b) => this.mapToBooking(b));
  }
  async findByOwnerId(ownerId: string, page: number = 1, limit: number = 20): Promise<{
    bookings: Booking[];
    total: number;
  }> {
    const ownerBookings = bookings.filter((b) => b.ownerId === ownerId);

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedBookings = ownerBookings.slice(startIndex, endIndex);
    return {
      bookings: paginatedBookings.map((b) => this.mapToBooking(b)),
      total: ownerBookings.length
    };
  }
  async create(bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking> {
    const newBooking = {
      id: String(bookings.length + 1),
      ...bookingData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    bookings.push(newBooking);
    return this.mapToBooking(newBooking);
  }
  async update(id: string, bookingData: Partial<Booking>): Promise<Booking | null> {
    const index = bookings.findIndex((b) => b.id === id);
    if (index === -1) return null;
    bookings[index] = {
      ...bookings[index],
      ...bookingData,
      updatedAt: new Date()
    };
    return this.mapToBooking(bookings[index]);
  }
  async delete(id: string): Promise<boolean> {
    const index = bookings.findIndex((b) => b.id === id);
    if (index === -1) return false;
    bookings.splice(index, 1);
    return true;
  }
  private mapToBooking(data: any): Booking {
    return {
      id: data.id,
      roomId: data.roomId,
      tenantId: data.tenantId,
      ownerId: data.ownerId,
      tenantName: data.tenantName,
      tenantEmail: data.tenantEmail,
      tenantPhone: data.tenantPhone,
      moveInDate: data.moveInDate,
      message: data.message,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}