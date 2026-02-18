import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env variable: ${key}`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

export const env = {
  NODE_ENV,
  IS_PROD,
  PORT: Number(process.env.PORT || 3001),

  DATABASE_URL: IS_PROD
    ? requireEnv('DATABASE_URL')
    : process.env.DATABASE_URL || '',

  JWT_SECRET: IS_PROD
    ? requireEnv('JWT_SECRET')
    : process.env.JWT_SECRET || 'dev-secret',

  CORS_ORIGIN: process.env.CORS_ORIGIN || '',

  RAZORPAY: {
    KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || ''
  },

  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    API_KEY: process.env.CLOUDINARY_API_KEY || '',
    API_SECRET: process.env.CLOUDINARY_API_SECRET || ''
  }
};
