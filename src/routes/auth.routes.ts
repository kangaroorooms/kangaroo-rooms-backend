import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/AuthController';
import { AuthService } from '../services/AuthService';
import { userRepository } from '../repositories';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { authRateLimiter } from '../middleware/security.middleware';
const router = Router();

/* ===========================
   ✅ ZOD SCHEMAS (INLINE)
   =========================== */
const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['TENANT', 'OWNER']),
  phone: z.string().optional(),
  city: z.string().optional()
});
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// ✅ CREATE SERVICE
const authService = new AuthService(userRepository);

// ✅ INJECT SERVICE INTO CONTROLLER
const authController = new AuthController(authService);

// Apply strict rate limiting
router.use(authRateLimiter);

// Register
router.post('/register', validateBody(RegisterSchema), authController.register);

// Login
router.post('/login', validateBody(LoginSchema), authController.login);

// Current user
router.get('/me', authMiddleware, authController.getCurrentUser);
export default router;