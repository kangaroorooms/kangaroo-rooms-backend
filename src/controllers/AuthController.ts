import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AuthService } from '../services/AuthService';
import { Role } from '@prisma/client';
export class AuthController {
  constructor(private authService: AuthService) {
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.getCurrentUser = this.getCurrentUser.bind(this);
  }

  // =======================
  // GET CURRENT USER
  // =======================
  async getCurrentUser(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: 'Unauthorized'
        });
      }
      const user = await this.authService.getUserById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      return res.json({
        success: true,
        data: user
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch current user'
      });
    }
  }

  // =======================
  // REGISTER
  // =======================
  async register(req: Request, res: Response) {
    // console.log(req.body);
    try {
      const {
        email,
        password,
        name,
        role
      } = req.body;
      if (!email || !password || !name || !role) {
        return res.status(400).json({
          success: false,
          message: 'Email, password, name, and role are required'
        });
      }
      const roleMap: Record<string, Role> = {
        tenant: Role.TENANT,
        owner: Role.OWNER,
        agent: Role.AGENT,
        admin: Role.ADMIN
      };
      const normalizedRole = String(role).toLowerCase();
      if (!roleMap[normalizedRole]) {
        // console.log(normalizedRole);
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be tenant or owner'
        });
      }
      const result = await this.authService.register(email, password, name, roleMap[normalizedRole]);
      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.message === 'User already registered') {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: error.message || 'Registration failed'
      });
    }
  }

  // =======================
  // LOGIN
  // =======================
  async login(req: Request, res: Response) {
    try {
      const {
        email,
        password
      } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }
      const result = await this.authService.login(email, password);
      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }
}