import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { Role } from '@prisma/client';
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: Role;
  };
}

/**
 * JWT Authentication Middleware
 *
 * FIX: Returns 401 (not 403) for invalid/expired tokens.
 * 401 = "who are you?" (authentication failure)
 * 403 = "I know who you are, but you can't do this" (authorization failure)
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      message: 'Access token required'
    });
  }
  try {
    const decoded = verifyToken(token) as {
      userId: string;
      role: Role;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Require ADMIN role
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication required'
    });
  }
  if (req.user.role !== Role.ADMIN) {
    return res.status(403).json({
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * Role-based authorization
 */
export const authorizeRoles = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required'
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
};