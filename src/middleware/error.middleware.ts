import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
export class AppError extends Error {
  constructor(public statusCode: number, public message: string, public isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
export function errorHandler(err: Error | AppError, req: Request, res: Response, next: NextFunction) {
  // Log error with context
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    requestId: (req as any).requestId
  }, 'Request error');

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message
    });
  }

  // Handle unknown errors (don't leak details in production)
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(500).json({
    success: false,
    message
  });
}