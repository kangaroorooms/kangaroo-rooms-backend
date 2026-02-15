import { Request, Response } from 'express';
import { RoomService } from '../services/RoomService';
import { AuthRequest } from '../middleware/auth.middleware';
export class RoomController {
  constructor(private roomService: RoomService) {
    // Bind all methods to preserve 'this' context
    this.createRoom = this.createRoom.bind(this);
    this.getAllRooms = this.getAllRooms.bind(this);
    this.getRoomById = this.getRoomById.bind(this);
    this.updateRoom = this.updateRoom.bind(this);
    this.deleteRoom = this.deleteRoom.bind(this);
    this.getOwnerRooms = this.getOwnerRooms.bind(this);
    this.toggleRoomStatus = this.toggleRoomStatus.bind(this);
  }
  async createRoom(req: Request, res: Response): Promise<void> {
    try {
      console.log('[RoomController] Creating room for owner:', req.user?.userId);
      console.log('[RoomController] Request body:', JSON.stringify(req.body, null, 2));
      const room = await this.roomService.createRoom({
        ...req.body,
        ownerId: req.user!.userId
      });
      console.log('[RoomController] Room created successfully:', room.id);
      res.status(201).json({
        success: true,
        data: room,
        message: 'Room created successfully'
      });
    } catch (error) {
      console.error('[RoomController] Error creating room:', error);
      if (error instanceof Error) {
        console.error('[RoomController] Error message:', error.message);

        // Provide specific error messages
        if (error.message.includes('City not found')) {
          res.status(400).json({
            success: false,
            message: error.message
          });
          return;
        }
      }
      res.status(400).json({
        success: false,
        message: 'Failed to create room',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  async getAllRooms(req: Request, res: Response) {
    try {
      const result = await this.roomService.getAllRooms(req.query);
      // ✅ FIX: Wrap response in standard { success, data, meta } format
      res.json({
        success: true,
        data: result.rooms,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  async getRoomById(req: Request, res: Response) {
    try {
      const {
        id
      } = req.params;
      const room = await this.roomService.getRoomById(id);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Room not found'
        });
      }
      // ✅ FIX: Wrap response in standard format
      res.json({
        success: true,
        data: room
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  async updateRoom(req: AuthRequest, res: Response) {
    try {
      const {
        id
      } = req.params;
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      // FIX: Correct parameter order - (id, ownerId, input) not (id, input, ownerId)
      const room = await this.roomService.updateRoom(id, ownerId, req.body);
      res.json(room);
    } catch (error: any) {
      res.status(400).json({
        message: error.message
      });
    }
  }
  async deleteRoom(req: AuthRequest, res: Response) {
    try {
      const {
        id
      } = req.params;
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      await this.roomService.deleteRoom(id, ownerId);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({
        message: error.message
      });
    }
  }
  async getOwnerRooms(req: AuthRequest, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      const rooms = await this.roomService.getOwnerRooms(ownerId);
      res.json(rooms);
    } catch (error: any) {
      res.status(500).json({
        message: error.message
      });
    }
  }
  async toggleRoomStatus(req: AuthRequest, res: Response) {
    try {
      const {
        id
      } = req.params;
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      const room = await this.roomService.toggleRoomStatus(id, ownerId);
      res.json({
        success: true,
        data: room,
        message: 'Room status updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}