import { Router } from 'express';
import { CloudinaryController } from '../controllers/CloudinaryController';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();
const cloudinaryController = new CloudinaryController();

// ✅ SECURED: require authentication for upload signature
router.get('/signature', authMiddleware, cloudinaryController.getUploadSignature);

// ✅ PROTECTED: delete image (OWNER only via JWT)
router.delete('/image/:publicId', authMiddleware, cloudinaryController.deleteImage);
export default router;