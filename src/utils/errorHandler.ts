import { AppError } from '../errors/AppError.ts';
import { logger } from './logger.ts';
import {
  DatabaseError,
  DatabaseConnectionError,
  ExternalServiceError,
} from '../errors/DomainErrors.ts';

/**
 * Check if error is an operational error (expected, handled)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Handle database errors and convert to appropriate AppError
 */
export function handleDatabaseError(error: unknown, context?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error as any;

  // PostgreSQL specific errors
  if (err.code) {
    switch (err.code) {
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
        return new DatabaseConnectionError(err);

      case '23505': // Unique constraint violation
        return new DatabaseError('A record with this information already exists.', err, {
          context,
          pgCode: err.code,
        });

      case '23503': // Foreign key constraint violation
        return new DatabaseError('Cannot perform this operation due to related records.', err, {
          context,
          pgCode: err.code,
        });

      case '23502': // Not null constraint violation
        return new DatabaseError('Required field is missing.', err, { context, pgCode: err.code });

      default:
        return new DatabaseError(`Database operation failed${context ? `: ${context}` : ''}`, err, {
          context,
          pgCode: err.code,
        });
    }
  }

  // Generic database error
  return new DatabaseError(
    `Database operation failed${context ? `: ${context}` : ''}`,
    err instanceof Error ? err : new Error(String(err)),
    { context }
  );
}

/**
 * Handle external API errors
 */
export function handleExternalAPIError(
  serviceName: string,
  error: unknown,
  context?: string
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error as any;
  const message = err.message || 'Unknown error occurred';

  // Check for rate limiting
  if (err.status === 429 || err.statusCode === 429) {
    return new ExternalServiceError(
      serviceName,
      'Rate limit exceeded. Please try again later.',
      err instanceof Error ? err : new Error(message)
    );
  }

  // Check for authentication errors
  if (err.status === 401 || err.statusCode === 401) {
    return new ExternalServiceError(
      serviceName,
      'Authentication failed. Please check your API credentials.',
      err instanceof Error ? err : new Error(message)
    );
  }

  // Generic external service error
  return new ExternalServiceError(
    serviceName,
    message,
    err instanceof Error ? err : new Error(message)
    // { context }
  );
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  if (error instanceof AppError) {
    logger.error(`[${error.code}] ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      context: { ...error.context, ...context },
      stack: error.stack,
    });
  } else {
    logger.error('Unexpected error:', {
      message: error.message,
      context,
      stack: error.stack,
    });
  }
}
