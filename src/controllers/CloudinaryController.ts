import { Request, Response } from "express";
import cloudinary from "../config/cloudinary.config";
export class CloudinaryController {
  constructor() {
    this.getUploadSignature = this.getUploadSignature.bind(this);
    this.deleteImage = this.deleteImage.bind(this);
  }

  /**
   * PUBLIC
   * Used by frontend to upload images directly to Cloudinary
   */
  getUploadSignature(req: Request, res: Response) {
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = "kangaroo/properties";
      const signature = cloudinary.utils.api_sign_request({
        timestamp,
        folder
      }, process.env.CLOUDINARY_API_SECRET!);
      return res.json({
        success: true,
        timestamp,
        signature,
        folder,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to generate upload signature"
      });
    }
  }

  /**
   * PROTECTED
   * Deletes image from Cloudinary
   */
  async deleteImage(req: Request, res: Response) {
    try {
      const {
        publicId
      } = req.body; // ✅ FIXED

      if (!publicId) {
        return res.status(400).json({
          success: false,
          message: "publicId is required"
        });
      }
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result !== "ok") {
        return res.status(400).json({
          success: false,
          message: "Failed to delete image from Cloudinary"
        });
      }
      return res.json({
        success: true,
        message: "Image deleted successfully"
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Image delete failed"
      });
    }
  }
}