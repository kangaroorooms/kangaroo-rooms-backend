import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyToken } from '../utils/jwt';
import { Role } from '@prisma/client';

/**
 * AuthRequest — used by controllers that need typed user access.
 * Kept as a re-export alias so controllers don't break.
 */
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
 *
 * Typed as RequestHandler so Express router.use() accepts it.
 */
export const authMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({
      message: 'Access token required'
    });
    return;
  }
  try {
    const decoded = verifyToken(token) as {
      userId: string;
      role: Role;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      message: 'Invalid or expired token'
    });
    return;
  }
};

/**
 * Require ADMIN role
 * Typed as RequestHandler for router.use() compatibility.
 */
export const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({
      message: 'Authentication required'
    });
    return;
  }
  if (req.user.role !== Role.ADMIN) {
    res.status(403).json({
      message: 'Admin access required'
    });
    return;
  }
  next();
};

/**
 * Role-based authorization
 * Returns RequestHandler for router.use() compatibility.
 */
export const authorizeRoles = (...allowedRoles: (Role | string)[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        message: 'Authentication required'
      });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
      return;
    }
    next();
  };
};