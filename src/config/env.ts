import dotenv from "dotenv";

dotenv.config();

/**
 * Helper to require env in production
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

export const env = {
  NODE_ENV,
  IS_PROD,

  PORT: Number(process.env.PORT || 3001),

  // DATABASE
  DATABASE_URL: IS_PROD
    ? requireEnv("DATABASE_URL")
    : process.env.DATABASE_URL ||
      "postgresql://user:password@localhost:5432/kangaroo_rooms",

  // JWT
  JWT_SECRET: IS_PROD
    ? requireEnv("JWT_SECRET")
    : process.env.JWT_SECRET || "dev-secret",

  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",

  // FEATURES
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER !== "false",
  ENABLE_PAYMENT_VERIFICATION:
    process.env.ENABLE_PAYMENT_VERIFICATION === "true",
  ENABLE_PAYMENT_CONFIRMATION:
    process.env.ENABLE_PAYMENT_CONFIRMATION === "true",

  // Razorpay
  RAZORPAY: {
    KEY_ID: process.env.RAZORPAY_KEY_ID || "",
    KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  },

  // Cloudinary
  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
    API_KEY: process.env.CLOUDINARY_API_KEY || "",
    API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  },

  ADMIN_UPI_ID: process.env.ADMIN_UPI_ID || "admin@upi",
};
