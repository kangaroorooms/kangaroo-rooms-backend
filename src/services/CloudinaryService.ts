import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * CloudinaryService
 * Handles Cloudinary upload signature generation and image management
 */
export class CloudinaryService {
  constructor() {
    // Verify Cloudinary is configured
    if (!env.CLOUDINARY.CLOUD_NAME || !env.CLOUDINARY.API_KEY || !env.CLOUDINARY.API_SECRET) {
      throw new Error('Cloudinary credentials not configured');
    }

    // Configure Cloudinary (idempotent - safe to call multiple times)
    cloudinary.config({
      cloud_name: env.CLOUDINARY.CLOUD_NAME,
      api_key: env.CLOUDINARY.API_KEY,
      api_secret: env.CLOUDINARY.API_SECRET,
      secure: true
    });
    logger.info('CloudinaryService initialized', {
      cloudName: env.CLOUDINARY.CLOUD_NAME,
      apiKey: env.CLOUDINARY.API_KEY.substring(0, 6) + '***'
    });
  }

  /**
   * Generate upload signature for client-side uploads
   * The signature must include ALL parameters that will be sent to Cloudinary
   */
  generateSignature(paramsToSign: Record<string, any>) {
    const timestamp = Math.floor(Date.now() / 1000);

    // Prepare params for signing (must match what client sends)
    const signatureParams = {
      timestamp,
      ...paramsToSign
    };

    // Generate signature using Cloudinary's utility
    const signature = cloudinary.utils.api_sign_request(signatureParams, env.CLOUDINARY.API_SECRET);
    logger.info('Generated Cloudinary signature', {
      timestamp,
      folder: paramsToSign.folder
    });
    return {
      signature,
      timestamp,
      ...paramsToSign // Include all params that were signed
    };
  }

  /**
   * Delete multiple images from Cloudinary
   */
  async deleteImages(imageUrls: string[]): Promise<void> {
    if (!imageUrls?.length) return;
    const results = await Promise.allSettled(imageUrls.map(async (url) => {
      const publicId = this.extractPublicId(url);
      if (!publicId) {
        logger.warn('Could not extract public ID from URL', {
          url
        });
        return;
      }
      try {
        const result = await cloudinary.uploader.destroy(publicId);
        logger.info('Deleted image from Cloudinary', {
          publicId,
          result
        });
        return result;
      } catch (error) {
        logger.error('Failed to delete image from Cloudinary', {
          publicId,
          error
        });
        throw error;
      }
    }));

    // Log summary
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    logger.info('Cloudinary batch delete completed', {
      successful,
      failed,
      total: imageUrls.length
    });
  }

  /**
   * Extract Cloudinary public ID from URL
   * Example: https://res.cloudinary.com/cloud/image/upload/v1234567890/folder/image.jpg
   * Returns: folder/image
   */
  private extractPublicId(url: string): string | null {
    try {
      // Match pattern: /v{version}/{public_id}.{extension}
      const match = url.match(/\/v\d+\/(.+)\.\w+$/);
      return match ? match[1] : null;
    } catch (error) {
      logger.error('Error extracting public ID', {
        url,
        error
      });
      return null;
    }
  }

  /**
   * Validate if URL is a valid Cloudinary URL
   */
  isValidCloudinaryUrl(url: string): boolean {
    return typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes(env.CLOUDINARY.CLOUD_NAME);
  }
}