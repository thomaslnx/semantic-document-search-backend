import { MigrationInterface, QueryRunner } from 'typeorm';
import { logger } from '../utils/logger.ts';

export class CreateVectorIndex1768592559822 implements MigrationInterface {
  name = 'CreateVectorIndex1768592559822';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Check if we have data before creating IVFFlat index */
    const result = await queryRunner.query(`
      SELECT COUNT(*) as count FROM document_chunks;
    `);

    const rowCount = parseInt(result[0]?.count || '0', 10);

    if (rowCount === 0) {
      logger.warn('⚠️  No data in document_chunks. IVFFlat index requires data to be effective.');
      logger.warn('   Consider running this migration after loading initial data.');
    }

    /* Calculate optimal lists parameter */
    /* Rule of thumb: lists = rows / 1000 (minimum 10, maximum 1000) */
    const lists = Math.max(10, Math.min(1000, Math.floor(rowCount / 1000) || 100));

    logger.info(`Creating IVFFlat index with lists=${lists} (based on ${rowCount} rows)`);

    /* Drop existing index if it exists */
    await queryRunner.query(`
      DROP INDEX IF EXISTS document_chunks_embedding_idx;
    `);

    /* Create IVFFlat index with optimized parameters */
    await queryRunner.query(`
      CREATE INDEX document_chunks_embedding_idx
      ON document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = ${lists});
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS document_chunks_embedding_idx;
    `);
  }
}
