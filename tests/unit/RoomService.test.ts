import { RoomService } from '../../src/services/RoomService';
import { IRoomRepository } from '../../src/repositories/interfaces';
import { Room } from '../../src/models/Room';

// Mock repository
const mockRoomRepository: jest.Mocked<IRoomRepository> = {
  findById: jest.fn(),
  findAll: jest.fn(),
  findByOwnerId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};
describe('RoomService', () => {
  let roomService: RoomService;
  beforeEach(() => {
    roomService = new RoomService(mockRoomRepository);
    jest.clearAllMocks();
  });
  describe('getRooms', () => {
    it('should return paginated rooms with filters', async () => {
      const mockRooms: Room[] = [{
        id: '1',
        title: 'Test Room',
        description: 'Test Description',
        city: 'Mumbai',
        location: 'Bandra',
        landmark: 'Station',
        pricePerMonth: 25000,
        roomType: '2BHK',
        idealFor: ['Professionals'],
        amenities: ['WiFi'],
        images: [],
        rating: 4.5,
        reviewsCount: 10,
        isPopular: true,
        isVerified: true,
        isActive: true,
        ownerId: 'owner1',
        createdAt: new Date(),
        updatedAt: new Date()
      }];
      mockRoomRepository.findAll.mockResolvedValue({
        rooms: mockRooms,
        total: 1
      });
      const result = await roomService.getRooms({
        city: 'Mumbai',
        page: 1,
        limit: 20
      });
      expect(result.rooms).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockRoomRepository.findAll).toHaveBeenCalledWith({
        city: 'Mumbai',
        page: 1,
        limit: 20
      });
    });
    it('should handle empty results', async () => {
      mockRoomRepository.findAll.mockResolvedValue({
        rooms: [],
        total: 0
      });
      const result = await roomService.getRooms();
      expect(result.rooms).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
  describe('getRoomById', () => {
    it('should return a room by id', async () => {
      const mockRoom: Room = {
        id: '1',
        title: 'Test Room',
        description: 'Test Description',
        city: 'Mumbai',
        location: 'Bandra',
        landmark: 'Station',
        pricePerMonth: 25000,
        roomType: '2BHK',
        idealFor: ['Professionals'],
        amenities: ['WiFi'],
        images: [],
        rating: 4.5,
        reviewsCount: 10,
        isPopular: true,
        isVerified: true,
        isActive: true,
        ownerId: 'owner1',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockRoomRepository.findById.mockResolvedValue(mockRoom);
      const result = await roomService.getRoomById('1');
      expect(result).toEqual(mockRoom);
      expect(mockRoomRepository.findById).toHaveBeenCalledWith('1');
    });
    it('should return null for non-existent room', async () => {
      mockRoomRepository.findById.mockResolvedValue(null);
      const result = await roomService.getRoomById('999');
      expect(result).toBeNull();
    });
  });
});