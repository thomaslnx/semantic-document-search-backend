import { MigrationInterface, QueryRunner } from 'typeorm';
import { logger } from '../utils/logger.ts';

export class OptimizeVectorIndex1768595499120 implements MigrationInterface {
  name = 'OptimizeVectorIndex1768595499120';

  /**
   * Calculate optimal lists parameter for IVFFlat index
   *
   * Formula: lists = rows / 1000
   * Constraints: min 10, max 1000
   *
   */
  private calculateOptimalLists(rowCount: number): number {
    /* Standard formula (faster, good for most cases) */
    const standardLists = Math.floor(rowCount / 1000);

    /* Apply constraints */
    const lists = Math.max(10, Math.min(1000, standardLists || 100));

    return lists;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Get current row count */
    const result = await queryRunner.query(`
      SELECT COUNT(*) as count FROM document_chunks;
    `);

    const rowCount = parseInt(result[0]?.count || '0', 10);
    const optimalLists = this.calculateOptimalLists(rowCount);

    logger.info(`📊 Current document_chunks rows: ${rowCount}`);
    logger.info(`🎯 Optimal lists parameter: ${optimalLists}`);

    if (rowCount === 0) {
      logger.warn('⚠️  No data found. Using default lists=100');
      logger.warn('   Re-run this migration after loading data for optimal performance.');
    }

    /* Drop existing index */
    await queryRunner.query(`
      DROP INDEX IF EXISTS document_chunks_embedding_idx;
    `);

    /* Create optimized index */
    await queryRunner.query(`
      CREATE INDEX document_chunks_embedding_idx
      ON document_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = ${optimalLists});
    `);

    logger.info(`✅ IVFFlat index created with lists=${optimalLists}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS document_chunks_embedding_idx;
    `);
  }
}
