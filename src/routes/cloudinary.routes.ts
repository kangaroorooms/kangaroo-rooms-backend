import { Router } from 'express';
import { CloudinaryController } from '../controllers/CloudinaryController';
import { authMiddleware } from '../middleware/auth.middleware';
const router = Router();
const cloudinaryController = new CloudinaryController();

// ✅ PUBLIC: get signature for upload
router.get('/signature', cloudinaryController.getUploadSignature);

// ✅ PROTECTED: delete image (OWNER only via JWT)
router.delete('/image/:publicId', authMiddleware, cloudinaryController.deleteImage);
export default router;