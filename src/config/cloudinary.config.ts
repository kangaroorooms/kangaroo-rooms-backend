import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

/**
 * Cloudinary Configuration
 * Single source of truth for Cloudinary initialization
 *
 * This configuration is used by CloudinaryService and other parts of the application
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY.CLOUD_NAME,
  api_key: env.CLOUDINARY.API_KEY,
  api_secret: env.CLOUDINARY.API_SECRET,
  secure: true
});

// Export configured instance
export default cloudinary;

// Export for type safety
export { cloudinary };