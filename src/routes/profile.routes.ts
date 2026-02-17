import { Router } from 'express';
import { z } from 'zod';
import { ProfileController } from '../controllers/ProfileController';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
const router = Router();

// =======================
// ZOD SCHEMA (INLINE)
// =======================
const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  city: z.string().optional()
});

// Controller
const profileController = new ProfileController();

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/', authMiddleware, (req, res, next) => profileController.getProfile(req as any, res));

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 */
router.put('/', authMiddleware, validateBody(UpdateProfileSchema), (req, res, next) => profileController.updateProfile(req as any, res));
export default router;