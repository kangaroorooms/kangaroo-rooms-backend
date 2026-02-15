import { Router } from 'express';
import { ContactController } from '../controllers/ContactController';
import { ContactService } from '../services/ContactService';
import { PlanLimitService } from '../services/PlanLimitService';
import { authMiddleware, authorizeRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
const router = Router();
const planLimitService = new PlanLimitService();
const contactService = new ContactService(undefined, planLimitService);
const contactController = new ContactController(contactService);

/**
 * GET /api/contacts/:roomId
 * Auth: TENANT only
 * Pure READ — no writes, no transactions
 * Returns owner contact if previously unlocked OR paid subscription active
 * Returns 403 CONTACT_LOCKED otherwise
 */
router.get('/:roomId', authMiddleware, authorizeRoles(Role.TENANT), (req, res) => contactController.readContact(req, res));

/**
 * POST /api/contacts/unlock
 * Auth: TENANT only
 * Body: { roomId: string }
 * Returns: { ownerName, ownerPhone, ownerEmail }
 * ⚠️ WRITE path — SERIALIZABLE transaction, limit enforcement, dedup
 */
router.post('/unlock', authMiddleware, authorizeRoles(Role.TENANT), (req, res) => contactController.unlockContact(req, res));
export default router;