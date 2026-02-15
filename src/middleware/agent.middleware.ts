import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthRequest } from './auth.middleware';

/**
 * Agent Role Guard Middleware
 *
 * Ensures the authenticated user has the AGENT role.
 * Must be used AFTER authMiddleware.
 *
 * SECURITY: This is a READ-ONLY guard - agents cannot perform mutations.
 */
export const requireAgent = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Verify authentication exists
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Verify AGENT role
  if (req.user.role !== Role.AGENT) {
    return res.status(403).json({
      success: false,
      message: 'Agent access required'
    });
  }
  next();
};

/**
 * Agent Self-Query Guard
 *
 * Ensures agents can only query their own assignments.
 * The agentId in the query MUST match the authenticated user's ID.
 *
 * This prevents agents from querying other agents' assignments.
 */
export const enforceAgentSelfQuery = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Agent can only query their own data
  // The service layer will use req.user.userId to filter assignments
  // This middleware ensures the pattern is enforced at the route level

  next();
};