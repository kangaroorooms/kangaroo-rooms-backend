import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';

// FIXED: Use singleton instead of new PrismaClient()
const prisma = getPrismaClient();
export class AdminController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.getAllUsers = this.getAllUsers.bind(this);
    this.updateUserStatus = this.updateUserStatus.bind(this);
    this.getTenants = this.getTenants.bind(this);
    this.getAgents = this.getAgents.bind(this);
    this.getStats = this.getStats.bind(this);
    this.getAllProperties = this.getAllProperties.bind(this);
    this.approveProperty = this.approveProperty.bind(this);
    this.rejectProperty = this.rejectProperty.bind(this);
    this.requestCorrection = this.requestCorrection.bind(this);
    this.suspendProperty = this.suspendProperty.bind(this);
    this.getActivity = this.getActivity.bind(this);
  }

  /**
   * GET /api/admin/stats
   * Get dashboard statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      // Use Promise.all for parallel queries with correct reviewStatus field
      const [totalUsers, totalOwners, totalProperties, pendingApprovals, activeListings, rejected, suspended, needsCorrection] = await Promise.all([prisma.user.count(), prisma.user.count({
        where: {
          role: Role.OWNER
        }
      }), prisma.room.count(), prisma.room.count({
        where: {
          reviewStatus: 'PENDING'
        }
      }), prisma.room.count({
        where: {
          reviewStatus: 'APPROVED'
        }
      }), prisma.room.count({
        where: {
          reviewStatus: 'REJECTED'
        }
      }), prisma.room.count({
        where: {
          reviewStatus: 'REJECTED'
        }
      }), prisma.room.count({
        where: {
          reviewStatus: 'NEEDS_CORRECTION'
        }
      })]);
      const stats = {
        totalUsers,
        totalOwners,
        totalProperties,
        pendingApprovals,
        activeListings,
        rejected,
        needsCorrection,
        totalBookings: 0
      };
      logger.info('Admin stats fetched', {
        stats
      });
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error fetching stats', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch stats'
      });
    }
  }

  /**
   * GET /api/admin/users
   * Get all users with optional filters
   */
  async getAllUsers(req: Request, res: Response) {
    try {
      const {
        role,
        status,
        search
      } = req.query;
      const where: any = {};
      if (role && role !== 'all') {
        const roleUpper = (role as string).toUpperCase();
        if (roleUpper === 'OWNER' || roleUpper === 'TENANT' || roleUpper === 'ADMIN' || roleUpper === 'AGENT') {
          where.role = roleUpper as Role;
        }
      }
      if (status && status !== 'all') {
        where.isActive = status === 'active';
      }
      if (search) {
        where.OR = [{
          name: {
            contains: search as string,
            mode: 'insensitive'
          }
        }, {
          email: {
            contains: search as string,
            mode: 'insensitive'
          }
        }];
      }
      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          phone: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      const transformedUsers = users.map((user) => ({
        ...user,
        role: user.role.toLowerCase(),
        status: user.isActive ? 'active' : 'disabled'
      }));
      logger.info(`Admin: Fetched ${transformedUsers.length} users`);
      res.json({
        success: true,
        data: transformedUsers,
        meta: {
          total: transformedUsers.length,
          page: 1,
          limit: transformedUsers.length
        }
      });
    } catch (error: any) {
      logger.error('Error fetching users', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }

  /**
   * PATCH /api/admin/users/:userId/status
   * Update user status (enable/disable)
   */
  async updateUserStatus(req: Request, res: Response) {
    try {
      const {
        userId
      } = req.params;
      const {
        status,
        isActive
      } = req.body;
      const activeStatus = isActive !== undefined ? isActive : status === 'active';
      const user = await prisma.user.update({
        where: {
          id: userId
        },
        data: {
          isActive: activeStatus
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          phone: true,
          createdAt: true,
          updatedAt: true
        }
      });
      const transformedUser = {
        ...user,
        role: user.role.toLowerCase(),
        status: user.isActive ? 'active' : 'disabled'
      };
      logger.info(`Admin: Updated user ${userId} status to ${activeStatus ? 'active' : 'disabled'}`);
      res.json({
        success: true,
        data: transformedUser,
        message: `User ${activeStatus ? 'activated' : 'disabled'} successfully`
      });
    } catch (error: any) {
      logger.error('Error updating user status', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to update user status'
      });
    }
  }

  /**
   * GET /api/admin/properties
   * Get all properties with optional filters
   * CRITICAL: Works with existing properties (backward compatible)
   */
  async getAllProperties(req: Request, res: Response) {
    try {
      const {
        status,
        search
      } = req.query;
      const where: any = {};
      if (status && status !== 'all') {
        const statusMap: Record<string, string> = {
          pending: 'PENDING',
          approved: 'APPROVED',
          rejected: 'REJECTED',
          needs_correction: 'NEEDS_CORRECTION'
        };
        where.reviewStatus = statusMap[status as string] || status;
      }
      if (search) {
        where.OR = [{
          title: {
            contains: search as string,
            mode: 'insensitive'
          }
        }, {
          location: {
            contains: search as string,
            mode: 'insensitive'
          }
        }];
      }
      const properties = await prisma.room.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      const transformedProperties = properties.map((property) => ({
        ...property,
        reviewStatus: property.reviewStatus?.toLowerCase() || 'approved'
      }));
      logger.info(`Admin: Fetched ${transformedProperties.length} properties`);
      res.json({
        success: true,
        data: transformedProperties,
        meta: {
          total: transformedProperties.length,
          page: 1,
          limit: transformedProperties.length
        }
      });
    } catch (error: any) {
      logger.error('Error fetching properties', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch properties'
      });
    }
  }

  /**
   * PATCH /api/admin/properties/:id/approve
   * Approve a property
   */
  async approveProperty(req: Request, res: Response) {
    try {
      const {
        id
      } = req.params;
      const property = await prisma.room.update({
        where: {
          id
        },
        data: {
          reviewStatus: 'APPROVED',
          isActive: true
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      logger.info(`Admin: Approved property ${id}`);
      res.json({
        success: true,
        data: property,
        message: 'Property approved successfully'
      });
    } catch (error: any) {
      logger.error('Error approving property', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to approve property'
      });
    }
  }

  /**
   * PATCH /api/admin/properties/:id/reject
   * Reject a property
   */
  async rejectProperty(req: Request, res: Response) {
    try {
      const {
        id
      } = req.params;
      const {
        reason
      } = req.body;
      const property = await prisma.room.update({
        where: {
          id
        },
        data: {
          reviewStatus: 'REJECTED',
          isActive: false,
          adminFeedback: reason ? {
            reason: 'other',
            reasonLabel: 'Rejected',
            message: reason,
            adminId: (req as AuthRequest).user?.userId || 'admin',
            adminName: 'Admin',
            createdAt: new Date().toISOString()
          } : undefined
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      logger.info(`Admin: Rejected property ${id}`);
      res.json({
        success: true,
        data: property,
        message: 'Property rejected'
      });
    } catch (error: any) {
      logger.error('Error rejecting property', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to reject property'
      });
    }
  }

  /**
   * PATCH /api/admin/properties/:id/needs-correction
   * Request corrections on a property
   */
  async requestCorrection(req: Request, res: Response) {
    try {
      const {
        id
      } = req.params;
      const {
        reason,
        message
      } = req.body;
      const property = await prisma.room.update({
        where: {
          id
        },
        data: {
          reviewStatus: 'NEEDS_CORRECTION',
          isActive: false,
          adminFeedback: {
            reason: reason || 'other',
            reasonLabel: 'Needs Correction',
            message: message || 'Please update the property details',
            adminId: (req as AuthRequest).user?.userId || 'admin',
            adminName: 'Admin',
            createdAt: new Date().toISOString()
          }
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      logger.info(`Admin: Requested correction for property ${id}`);
      res.json({
        success: true,
        data: property,
        message: 'Correction requested'
      });
    } catch (error: any) {
      logger.error('Error requesting correction', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to request correction'
      });
    }
  }

  /**
   * PATCH /api/admin/properties/:id/suspend
   * Suspend a property
   */
  async suspendProperty(req: Request, res: Response) {
    try {
      const {
        id
      } = req.params;
      const {
        reason
      } = req.body;
      const property = await prisma.room.update({
        where: {
          id
        },
        data: {
          reviewStatus: 'REJECTED',
          isActive: false,
          adminFeedback: reason ? {
            reason: 'policy_violation',
            reasonLabel: 'Suspended',
            message: reason,
            adminId: (req as AuthRequest).user?.userId || 'admin',
            adminName: 'Admin',
            createdAt: new Date().toISOString()
          } : undefined
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      logger.info(`Admin: Suspended property ${id}`);
      res.json({
        success: true,
        data: property,
        message: 'Property suspended'
      });
    } catch (error: any) {
      logger.error('Error suspending property', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to suspend property'
      });
    }
  }

  /**
   * GET /api/admin/activity
   * Get recent activity log
   */
  async getActivity(req: Request, res: Response) {
    try {
      const activities: any[] = [];
      res.json({
        success: true,
        data: activities
      });
    } catch (error: any) {
      logger.error('Error fetching activity', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch activity log'
      });
    }
  }
  async getTenants(req: Request, res: Response) {
    try {
      const tenants = await prisma.user.findMany({
        where: {
          role: Role.TENANT
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });
      logger.info(`Admin: Fetched ${tenants.length} tenants`);
      res.json(tenants);
    } catch (error: any) {
      logger.error('Error fetching tenants', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tenants'
      });
    }
  }
  async getAgents(req: Request, res: Response) {
    try {
      const agents = await prisma.user.findMany({
        where: {
          role: Role.AGENT
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });
      logger.info(`Admin: Fetched ${agents.length} agents`);
      res.json(agents);
    } catch (error: any) {
      logger.error('Error fetching agents', {
        error: error.message
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch agents'
      });
    }
  }
}