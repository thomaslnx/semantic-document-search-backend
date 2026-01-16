import { AppDataSource } from '../config/data-source.ts';
import { logger } from './logger.ts';

export interface IndexStats {
  rowCount: number;
  currentLists: number | null;
  recommendedLists: number;
  indexSize: string;
  indexUsage: string;
}

/**
 * Utility to optimize IVFFlat index parameters
 */
export class IndexOptimizer {
  /**
   * Get current index statistics
   */
  static async getIndexStats(): Promise<IndexStats> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      /* Get row count */
      const rowCountResult = await queryRunner.query(`
        SELECT COUNT(*) as count FROM document_chunks;
      `);
      const rowCount = parseInt(rowCountResult[0]?.count || '0', 10);

      /* Get current index parameters */
      const indexInfo = await queryRunner.query(`
        SELECT 
          pg_size_pretty(pg_relation_size('document_chunks_embedding_idx')) as index_size,
          idx.indisvalid as is_valid
          FROM pg_index idx
          JOIN pg_class cls ON idx.indexrelid = cls.oid
          WHERE cls.relname = 'document_chunks_embedding_idx';
      `);

      /* Get index definition to extract lists parameter */
      const indexDef = await queryRunner.query(`
        SELECT pg_get_indexdef('document_chunks_embedding_idx'::regclass) as definition;
      `);

      let currentLists: number | null = null;
      const definition = indexDef[0]?.definition || '';
      const listsMatch = definition.match(/lists\s*=\s*(\d+)/i);
      if (listsMatch) {
        currentLists = parseInt(listsMatch[1], 10);
      }

      /* Calculate recommended lists */
      const recommendedLists = this.calculateOptimalLists(rowCount);

      /* Get index usage stats (requires pg_stat_statements extension) */
      let indexUsage = 'N/A';
      try {
        const usageResult = await queryRunner.query(`
          SELECT 
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          WHERE indexrelname = 'document_chunks_embedding_idx';
        `);
        if (usageResult[0]) {
          indexUsage = `Scans: ${usageResult[0].scans}, Reads: ${usageResult[0].tuples_read}`;
        }
      } catch (err) {
        /* pg_stat_statements might not be enabled */
        logger.debug('Index usage stats not available');
      }

      return {
        rowCount,
        currentLists,
        recommendedLists,
        indexSize: indexInfo[0]?.index_size || 'N/A',
        indexUsage,
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Calculate optimal lists parameter
   */
  static calculateOptimalLists(rowCount: number): number {
    if (rowCount === 0) {
      return 100; /* Default for empty table */
    }

    /* Standard formula: rows / 1000 */
    const standardLists = Math.floor(rowCount / 1000);

    /* Apply constraints */
    return Math.max(10, Math.min(1000, standardLists));
  }

  /**
   * Rebuild index with optimal parameters
   */
  static async rebuildIndex(): Promise<void> {
    const stats = await this.getIndexStats();
    const optimalLists = stats.recommendedLists;

    logger.info(`Rebuilding IVFFlat index with lists=${optimalLists} (${stats.rowCount} rows)`);

    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.startTransaction();

      /* Drop existing index */
      await queryRunner.query(`
        DROP INDEX IF EXISTS document_chunks_embedding_idx;
      `);

      /* Create new index with optimal parameters */
      await queryRunner.query(`
        CREATE INDEX document_chunks_embedding_idx
        ON document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = ${optimalLists});
      `);

      await queryRunner.commitTransaction();
      logger.info(`✅ Index rebuilt successfully with lists=${optimalLists}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      logger.error(`❌ Failed to rebuild index: ${err}`);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if index needs optimization
   */
  static async needsOptimization(): Promise<boolean> {
    const stats = await this.getIndexStats();

    if (stats.currentLists === null) {
      return true; /* Index doesn't exist */
    }

    /* Consider optimization needed if difference is > 20% */
    const difference = Math.abs(stats.currentLists - stats.recommendedLists);
    const threshold = Math.max(10, stats.recommendedLists * 0.2);

    return difference > threshold;
  }
}
