import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Helmet configuration for security headers
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  },
  crossOriginEmbedderPolicy: false
});

/**
 * CORS configuration
 * Allows requests from configured origins
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow server-to-server, Postman, curl
    if (!origin) return callback(null, true);
    const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

    // Check against allowed origins (remove blanket localhost in production)
    if (env.IS_PROD) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    } else {
      // Development: allow localhost
      if (origin.startsWith('http://localhost') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  preflightContinue: false,
  optionsSuccessStatus: 204
});

/**
 * General rate limiter for all routes
 * 100 requests per 15 minutes per IP
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 15 minutes
  max: 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for authentication routes
 * 5 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 15 minutes
  max: 5,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful requests
});