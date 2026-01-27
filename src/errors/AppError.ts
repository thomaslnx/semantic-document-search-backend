export abstract class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly context?: Record<string, any> | undefined;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any> | undefined
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    context?: Record<string, any> | undefined;
    stack?: string;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.context && { context: this.context }),
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }
}
