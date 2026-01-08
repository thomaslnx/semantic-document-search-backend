import winston from 'winston';
import { env } from '../config/environment.ts';

/*
 * Logger configuration
 * Provides structured logging with different levels
 */

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({
      stack: true,
    }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'semantic-document-search' },
  transports: [
    /* Write all logs to console */
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ level: true, message: true }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
    }),

    /* Write errors to error.log */
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),

    /* Write all logs to combined.log */
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

/* Create the logs directory if it doesn't exist */
import { existsSync, mkdirSync } from 'fs';

if (!existsSync('logs')) {
  mkdirSync('logs');
}
