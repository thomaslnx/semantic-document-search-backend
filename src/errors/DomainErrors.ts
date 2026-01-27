import { AppError } from './AppError.ts';

/**
 * Document-related errors
 */
export class DocumentNotFoundError extends AppError {
  constructor(documentId: string) {
    super(`Document with ID "${documentId}" was not found.`, 'DOCUMENT_NOT_FOUND', 404, true, {
      documentId,
    });
  }
}

export class DocumentProcessingError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Failed to process document: ${message}`, 'DOCUMENT_PROCESSING_FAILED', 422, true, {
      ...context,
      cause: cause?.message,
    });
  }
}

export class UnsupportedFileTypeError extends AppError {
  constructor(mimeType: string, allowedTypes: string[]) {
    super(
      `File type "${mimeType}" is not supported. Supported types: ${allowedTypes.join(', ')}`,
      'UNSUPPORTED_FILE_TYPE',
      400,
      true,
      { mimeType, allowedTypes }
    );
  }
}

export class FileTooLargeError extends AppError {
  constructor(fileSize: number, maxSize: number) {
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    super(
      `File size (${fileSizeMB} MB) exceeds the maximum allowed size (${maxSizeMB} MB)`,
      'FILE_TOO_LARGE',
      400,
      true,
      { fileSize, maxSize, fileSizeMB, maxSizeMB }
    );
  }
}

export class EmptyDocumentError extends AppError {
  constructor() {
    super(
      'The uploaded file contains no extractable text. Please ensure the file is not empty or corrupted.',
      'EMPTY_DOCUMENT',
      422,
      true
    );
  }
}

/**
 * Search-related errors
 */
export class SearchError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Search operation failed: ${message}`, 'SEARCH_FAILED', 500, true, {
      ...context,
      cause: cause?.message,
    });
  }
}

export class InvalidSearchQueryError extends AppError {
  constructor(query: string) {
    super(
      `Search query cannot be empty or contain only whitespace.`,
      'INVALID_SEARCH_QUERY',
      400,
      true,
      { query: query?.trim() || '' }
    );
  }
}

export class EmbeddingGenerationError extends AppError {
  constructor(message: string, cause?: Error) {
    super(`Failed to generate embedding: ${message}`, 'EMBEDDING_GENERATION_FAILED', 500, true, {
      cause: cause?.message,
    });
  }
}

/**
 * Q&A-related errors
 */
export class QAError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Failed to answer question: ${message}`, 'QA_FAILED', 500, true, {
      ...context,
      cause: cause?.message,
    });
  }
}

export class NoRelevantContextError extends AppError {
  constructor(question: string) {
    super(
      `No relevant information found to answer your question. Please try rephrasing your question or ensure relevant documents are uploaded.`,
      'NO_RELEVANT_CONTEXT',
      404,
      true,
      { question }
    );
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Database operation failed: ${message}`, 'DATABASE_ERROR', 500, true, {
      ...context,
      cause: cause?.message,
    });
  }
}

export class DatabaseConnectionError extends AppError {
  constructor(cause?: Error) {
    super(
      'Unable to connect to the database. Please try again later or contact support if the problem persists.',
      'DATABASE_CONNECTION_FAILED',
      503,
      true,
      { cause: cause?.message }
    );
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends AppError {
  constructor(serviceName: string, message: string, cause?: Error) {
    super(
      `External service (${serviceName}) error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { serviceName, cause: cause?.message }
    );
  }
}

export class HuggingFaceAPIError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, any>) {
    super(`Hugging Face API error: ${message}`, 'HUGGINGFACE_API_ERROR', 502, true, {
      ...context,
      cause: cause?.message,
    });
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: any) {
    super(message, 'VALIDATION_ERROR', 400, true, field ? { field, value } : undefined);
  }
}
