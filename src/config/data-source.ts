import { DataSource, DataSourceOptions } from 'typeorm';

import { env } from './environment.ts';
import { logger } from '../utils/logger.ts';
import { Document } from '../models/Document.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';

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
  synchronize: env.NODE_ENV === 'development',

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
export const AppDataSource = new DataSource(dataSourceOptions);

/* Initialize database connection */
export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    logger.info('✅ Database connection established');

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
    logger.error(`❌ Database connection failed: ${err}`);
    throw err;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    await AppDataSource.destroy();
    logger.info('✅ Database connection closed successfully!');
  } catch (err) {
    logger.error(`❌ Error closing database connection: ${err}`);
    throw err;
  }
}
