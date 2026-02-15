/**
 * PRODUCTION-GRADE ERROR HIERARCHY
 *
 * Staff Engineer Pattern: Typed errors with HTTP status codes.
 * Controllers catch these and return proper HTTP responses.
 *
 * NEVER throw generic Error() in services — always use these.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  constructor(statusCode: number, message: string, code: string = 'UNKNOWN_ERROR', isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// 400 — VALIDATION ERRORS
// ============================================================================

export class ValidationError extends AppError {
  public readonly details: any[];
  constructor(message: string, details: any[] = []) {
    super(400, message, 'VALIDATION_ERROR');
    this.details = details;
  }
}
export class InvalidDateError extends AppError {
  constructor(message: string = 'Invalid or past date provided') {
    super(400, message, 'INVALID_DATE');
  }
}
export class IdempotencyConflictError extends AppError {
  constructor(message: string = 'Idempotency key reused with different payload') {
    super(message, 409);
    this.name = 'IdempotencyConflictError';
  }
}
export class IdempotencyKeyMissingError extends AppError {
  constructor(message: string = 'Idempotency-Key header is required') {
    super(message, 400);
    this.name = 'IdempotencyKeyMissingError';
  }
}

// ============================================================================
// 401 — AUTHENTICATION ERRORS
// ============================================================================

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
  }
}

// ============================================================================
// 403 — AUTHORIZATION ERRORS
// ============================================================================

export class ForbiddenError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(403, message, 'FORBIDDEN');
  }
}

// ============================================================================
// 404 — NOT FOUND ERRORS
// ============================================================================

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID "${id}" not found` : `${resource} not found`;
    super(404, message, 'NOT_FOUND');
  }
}

// ============================================================================
// 409 — CONFLICT / DUPLICATE ERRORS
// ============================================================================

export class DuplicateError extends AppError {
  constructor(message: string = 'Duplicate resource detected') {
    super(409, message, 'DUPLICATE');
  }
}
export class DuplicateBookingError extends AppError {
  constructor() {
    super(409, 'You already have an active booking request for this room on this date', 'DUPLICATE_BOOKING');
  }
}

// ============================================================================
// 422 — BUSINESS LOGIC ERRORS
// ============================================================================

export class BusinessLogicError extends AppError {
  constructor(message: string) {
    super(422, message, 'BUSINESS_LOGIC_ERROR');
  }
}
export class InvalidStatusTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(422, `Cannot change booking status from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION');
  }
}

// ============================================================================
// 429 — RATE LIMIT ERRORS
// ============================================================================

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
  }
}

// ============================================================================
// 500 — INTERNAL ERRORS
// ============================================================================

export class InternalError extends AppError {
  constructor(message: string = 'An unexpected error occurred') {
    super(500, message, 'INTERNAL_ERROR', false);
  }
}

// ============================================================================
// PRISMA ERROR MAPPER
// ============================================================================

/**
 * Maps Prisma error codes to typed AppErrors.
 * Call this in repository catch blocks.
 */
export function mapPrismaError(error: any): AppError {
  const code = error?.code;
  switch (code) {
    case 'P2002':
      {
        // Unique constraint violation
        const target = error?.meta?.target;
        if (target?.includes('roomId') && target?.includes('tenantEmail') && target?.includes('moveInDate')) {
          return new DuplicateBookingError();
        }
        return new DuplicateError(`Duplicate entry: ${target?.join(', ') || 'unknown field'}`);
      }
    case 'P2025':
      // Record not found
      return new NotFoundError('Record');
    case 'P2003':
      // Foreign key constraint failed
      return new ValidationError('Referenced record does not exist');
    case 'P2014':
      // Required relation violation
      return new ValidationError('Required relation is missing');
    default:
      return new InternalError(process.env.NODE_ENV === 'production' ? 'Database operation failed' : `Database error: ${error?.message || 'unknown'}`);
  }
}