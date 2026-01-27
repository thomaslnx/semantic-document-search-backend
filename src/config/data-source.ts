import { DataSource, DataSourceOptions } from 'typeorm';

import { env } from './environment.ts';
import { logger } from '../utils/logger.ts';
import { Document } from '../models/Document.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';
import { DatabaseConnectionError } from '../errors/DomainErrors.ts';

/**
 * TypeORM DataSource configuration
 * Supports both Docker (development) and Supabase (production)
 */

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.database.host,
  port: env.database.port,
  username: env.database.username,
  password: env.database.password,
  database: env.database.database,

  /* SSL configuration */
  ssl: env.database.ssl
    ? {
        rejectUnauthorized: false /* Required by Supabase */,
      }
    : false,

  /* Entities (TypeORM will use these for migrations and queries )*/
  entities: [Document, DocumentChunk],

  /**
   * Synchronize: true in development, false in production
   * In production, use migrations instead
   */
  synchronize: false,

  /* Logging */
  logging: env.NODE_ENV === 'development',

  /* Migration settings */
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',

  /* Connection pool settings*/
  extra: {
    max: 20 /* Max number of connections */,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 3000,
  },
};

/* Create and export DataSource instance */
const AppDataSource = new DataSource(dataSourceOptions);

/* Export as default for TypeORM CLI migrations */
export default AppDataSource;

/* Export as named export for application code */
export { AppDataSource };

/* Initialize database connection */
export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    logger.info('✅ Database connection established');

    try {
      /* Verify pgvector extension */
      const result = await AppDataSource.query(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists"
      );

      if (!result[0]?.exists) {
        logger.warn('⚠️ pgvector extension not found! Attempting to enable...');
        try {
          await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
          logger.info('✅ pgvector extension enabled!');
        } catch (err) {
          logger.error(`❌ Failed to enable pgvector extension: ${err}`);
          throw err;
        }
      } else {
        logger.info('✅ pgvector extension is enabled');
      }
    } catch (err) {
      /* If pgvector check fails, it's not critical - log and continue */
      logger.warn('Could not verify pgvector extension:', err);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`❌ Database connection failed: ${error.message}`, {
      host: env.database.host,
      port: env.database.port,
      database: env.database.database,
      stack: error.stack,
    });
    throw new DatabaseConnectionError(error);
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    await AppDataSource.destroy();
    logger.info('✅ Database connection closed successfully!');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`❌ Error closing database connection: ${error.message}`);
  }
}
