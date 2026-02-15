import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export class ProfileController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.getProfile = this.getProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
  }
  async getProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      const user = await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          address: true,
          createdAt: true
        }
      });
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({
        message: error.message
      });
    }
  }
  async updateProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          message: 'User not authenticated'
        });
      }
      const {
        name,
        phone,
        address
      } = req.body;
      const user = await prisma.user.update({
        where: {
          id: userId
        },
        data: {
          name,
          phone,
          address
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          address: true
        }
      });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({
        message: error.message
      });
    }
  }
}