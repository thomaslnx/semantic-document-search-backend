import { GraphQLFormattedError } from 'graphql';
import { AppError } from '../../errors/AppError.ts';
import { logger } from '../../utils/logger.ts';

/**
 * Format GraphQL errors for client consumption (Apollo Server v5)
 * Signature: (formattedError: GraphQLFormattedError, error: unknown) => GraphQLFormattedError
 */
export function formatGraphQLError(
  formattedError: GraphQLFormattedError,
  error: unknown
): GraphQLFormattedError {
  /* Handle our custom AppError instances */
  if (error instanceof AppError) {
    /* Log the full error with context for debugging */
    logger.error('GraphQL Error (AppError):', {
      code: error.code,
      message: error.message,
      context: error.context,
      stack: error.stack,
    });

    /* Return user-friendly formatted error */
    return {
      message: error.message,
      extensions: {
        code: error.code,
        statusCode: error.statusCode,
        ...(error.context && { context: error.context }),
      },
    };
  }

  /* Handle database errors */
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as any;

    /* PostgreSQL error codes */
    if (dbError.code === '23505') {
      /* Unique constraint violation */
      return {
        message: 'A record with this information already exists.',
        extensions: {
          code: 'DUPLICATE_ENTRY',
          statusCode: 409,
        },
      };
    }

    if (dbError.code === '23503') {
      /* Foreign key constraint violation */
      return {
        message: 'Cannot perform this operation due to related records.',
        extensions: {
          code: 'FOREIGN_KEY_VIOLATION',
          statusCode: 409,
        },
      };
    }

    if (dbError.code === '23502') {
      /* Not null constraint violation */
      return {
        message: 'Required field is missing.',
        extensions: {
          code: 'MISSING_REQUIRED_FIELD',
          statusCode: 400,
        },
      };
    }
  }

  /* Handle validation errors (from class-validator) */
  if (error && typeof error === 'object' && 'validationErrors' in error) {
    const validationError = error as any;
    return {
      message: 'Validation failed',
      extensions: {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        validationErrors: validationError.validationErrors,
      },
    };
  }

  /* Log unexpected errors with full details */
  logger.error('Unexpected GraphQL Error:', {
    message: formattedError.message,
    path: formattedError.extensions?.path,
    originalError: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  /* Return generic error message for unexpected errors */
  /* Don't expose internal error details in production */
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    message: isDevelopment
      ? formattedError.message
      : 'An unexpected error occurred. Please try again later or contact support if the problem persists.',
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      ...(isDevelopment && {
        originalError: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    },
  };
}
