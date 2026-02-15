import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ContactService } from '../services/ContactService';
import { AppError } from '../errors/AppErrors';
import { logger } from '../utils/logger';
export class ContactController {
  private contactService: ContactService;
  constructor(contactService: ContactService) {
    this.contactService = contactService;
    this.unlockContact = this.unlockContact.bind(this);
    this.readContact = this.readContact.bind(this);
  }

  /**
   * GET /api/contacts/:roomId
   * Auth: TENANT only
   *
   * Pure READ path — no writes, no transactions, no counting.
   * Returns owner contact if:
   *   1. PropertyView exists (previously unlocked), OR
   *   2. Paid subscription active for room's city
   * Otherwise: 403 CONTACT_LOCKED
   */
  async readContact(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }
      const {
        roomId
      } = req.params;
      if (!roomId || typeof roomId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'roomId is required'
        });
        return;
      }
      const result = await this.contactService.readContact(tenantId, roomId);
      res.status(200).json({
        success: true,
        data: {
          ownerName: result.ownerName,
          ownerPhone: result.ownerPhone,
          ownerEmail: result.ownerEmail,
          alreadyUnlocked: result.alreadyUnlocked
        }
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
          code: error.code
        });
        return;
      }
      logger.error('Unexpected error in readContact', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        message: 'Failed to read contact'
      });
    }
  }

  /**
   * POST /api/contacts/unlock
   * Body: { roomId: string }
   * Auth: TENANT only
   *
   * Returns owner contact ONLY after subscription + limit validation.
   */
  async unlockContact(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.userId;
      if (!tenantId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }
      const {
        roomId
      } = req.body;
      if (!roomId || typeof roomId !== 'string') {
        res.status(400).json({
          success: false,
          message: 'roomId is required and must be a string'
        });
        return;
      }
      const result = await this.contactService.unlockContact(tenantId, roomId);
      res.status(200).json({
        success: true,
        data: {
          ownerName: result.ownerName,
          ownerPhone: result.ownerPhone,
          ownerEmail: result.ownerEmail
        },
        meta: {
          alreadyUnlocked: result.alreadyUnlocked
        }
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
          code: error.code
        });
        return;
      }
      logger.error('Unexpected error in unlockContact', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        message: 'Failed to unlock contact'
      });
    }
  }
}