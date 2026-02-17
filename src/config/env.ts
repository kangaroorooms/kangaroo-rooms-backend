import dotenv from 'dotenv';
import path from 'path';

/**
 * FORCE backend env loading (production-safe)
 * - Ignores dotenvx / auto loaders
 * - Overrides any previously loaded vars
 */
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: true
});

/**
 * Fail-fast helper
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
  return value;
}
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
export const env = {
  NODE_ENV,
  IS_PROD,
  PORT: Number(process.env.PORT || 3001),
  // Database
  DATABASE_URL: IS_PROD ?
  requireEnv('DATABASE_URL') :
  process.env.DATABASE_URL ||
  'postgresql://user:password@localhost:5432/kangaroo_rooms',
  // JWT
  JWT_SECRET: IS_PROD ?
  requireEnv('JWT_SECRET') :
  process.env.JWT_SECRET || 'dev-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Security
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  // Feature flags
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER !== 'false',
  ENABLE_PAYMENT_VERIFICATION:
  process.env.ENABLE_PAYMENT_VERIFICATION === 'true',
  ENABLE_PAYMENT_CONFIRMATION:
  process.env.ENABLE_PAYMENT_CONFIRMATION === 'true',
  // Razorpay
  RAZORPAY: {
    KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || ''
  },
  // Cloudinary
  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    API_KEY: process.env.CLOUDINARY_API_KEY || '',
    API_SECRET: process.env.CLOUDINARY_API_SECRET || ''
  },
  // Admin / Ops
  ADMIN_UPI_ID: process.env.ADMIN_UPI_ID || 'admin@upi'
};

/* ===========================
   PRODUCTION VALIDATIONS
=========================== */
if (IS_PROD) {
  // JWT safety
  if (env.JWT_SECRET.length < 32) {
    throw new Error(
      '❌ JWT_SECRET must be at least 32 characters in production'
    );
  }

  // CORS
  if (env.CORS_ORIGIN.includes('localhost')) {
    console.warn('⚠️ CORS_ORIGIN is localhost in production');
  }

  // Razorpay validation
  if (env.RAZORPAY.KEY_ID || env.RAZORPAY.KEY_SECRET) {
    if (!env.RAZORPAY.KEY_ID || !env.RAZORPAY.KEY_SECRET) {
      throw new Error('❌ Razorpay keys partially configured');
    }
    if (env.RAZORPAY.KEY_ID.startsWith('rzp_test_')) {
      throw new Error('❌ Razorpay TEST keys used in production');
    }
  }

  // Cloudinary validation
  if (
  !env.CLOUDINARY.CLOUD_NAME ||
  !env.CLOUDINARY.API_KEY ||
  !env.CLOUDINARY.API_SECRET)
  {
    throw new Error('❌ Cloudinary credentials missing in production');
  }
}

/* ===========================
   DERIVED CONFIG (NO ENV ACCESS)
=========================== */
export const config = {
  features: {
    enablePaymentVerification: env.ENABLE_PAYMENT_VERIFICATION,
    enablePaymentConfirmation: env.ENABLE_PAYMENT_CONFIRMATION,
    enableSwagger: env.ENABLE_SWAGGER
  },
  payment: {
    adminUpiId: env.ADMIN_UPI_ID
  }
};