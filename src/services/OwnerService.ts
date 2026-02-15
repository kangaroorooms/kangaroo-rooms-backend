import { PrismaRoomRepository } from '../repositories/PrismaRoomRepository';
import { PrismaBookingRepository } from '../repositories/PrismaBookingRepository';
export class OwnerService {
  private roomRepository: PrismaRoomRepository;
  private bookingRepository: PrismaBookingRepository;
  constructor(roomRepository: PrismaRoomRepository, bookingRepository: PrismaBookingRepository) {
    this.roomRepository = roomRepository;
    this.bookingRepository = bookingRepository;
  }

  /**
   * Get owner dashboard summary with stats
   */
  async getOwnerSummary(ownerId: string) {
    // Fetch rooms and bookings in parallel
    const [rooms, bookingsResult] = await Promise.all([this.roomRepository.findByOwnerId(ownerId), this.bookingRepository.findByOwnerId(ownerId)]);
    const bookings = bookingsResult.bookings;

    // Calculate stats
    const totalRooms = rooms.length;
    const activeRooms = rooms.filter((r) => r.isActive).length;
    const totalLeads = bookings.length;
    const approvedBookings = bookings.filter((b) => b.status === 'APPROVED');

    // Calculate total earnings from approved bookings
    const totalEarnings = approvedBookings.reduce((sum, booking) => {
      const room = rooms.find((r) => r.id === booking.roomId);
      return sum + (room?.pricePerMonth || 0);
    }, 0);
    return {
      totalRooms,
      activeRooms,
      totalLeads,
      totalEarnings
    };
  }

  /**
   * Get all rooms owned by this owner
   */
  async getOwnerRooms(ownerId: string) {
    return this.roomRepository.findByOwnerId(ownerId);
  }

  /**
   * Get all bookings for owner's properties
   */
  async getOwnerBookings(ownerId: string) {
    const result = await this.bookingRepository.findByOwnerId(ownerId);
    return result.bookings;
  }
}