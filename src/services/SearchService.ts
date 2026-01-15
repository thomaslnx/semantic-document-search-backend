import { AppDataSource } from '../config/data-source.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';
import { openAIService } from './HuggingFaceAIService.ts';
import { redisClient } from '../config/redis.ts';
import { logger } from '../utils/logger.ts';
import { createHash } from 'crypto';

export interface SearchResult {
  chunk: {
    id: string;
    documentId: string;
    chunkText: string;
    chunkIndex: number;
    metadata: Record<string, any> | null;
  };
  document: {
    id: string;
    title: string;
    fileType: string | null;
  };
  similarity: number;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  documentId?: string;
  useCache?: boolean;
  hybrid?: boolean;
}

/**
 * Search Service
 * Handles semantic search using pgvector
 */
export class SearchService {
  /* Perform semantic search */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, documentId, useCache = true } = options;

    try {
      /* Generate cache key */
      const cacheKey = this.#getCacheKey(query, options);

      /* Try to get from cache */
      if (useCache) {
        const cached = await redisClient.get<SearchResult[]>(cacheKey);
        if (cached) {
          logger.debug('Search result retrieved from cache');
          return cached;
        }
      }

      /* Generate query embedding */
      const queryEmbedding = await openAIService.generateEmbedding(query);

      /* Perform vector similarity search */
      const results = await this.#vectorSimilaritySearch(
        queryEmbedding,
        limit,
        threshold,
        documentId
      );

      /* Cache results (1 hour) */
      if (useCache) {
        await redisClient.set(cacheKey, results, 3600);
      }

      return results;
    } catch (error) {
      logger.error('Error performing search:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform vector similarity search using pgvector
   * Uses raw SQL because TypeORM doesn't support vector operations
   */
  async #vectorSimilaritySearch(
    queryEmbedding: (number | number[] | number[][])[],
    limit: number,
    threshold: number,
    documentId?: string
  ): Promise<SearchResult[]> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      /* Convert embedding array to PostgreSQL vector format */
      const vectorString = `[${queryEmbedding.join(',')}]`;

      /* Build SQL query for vector similarity search */
      let sql = `
        SELECT 
          dc.id,
          dc.document_id,
          dc.chunk_text,
          dc.chunk_index,
          dc.metadata,
          d.id as doc_id,
          d.title,
          d.file_type,
          -- Cosine similarity (1 - cosine distance)
          (1 - (dc.embedding <=> $1::vector)) as similarity
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.embedding IS NOT NULL
      `;

      const params: any[] = [vectorString];

      if (documentId) {
        sql += ` AND dc.document_id = $${params.length + 1}`;
        params.push(documentId);
      }

      sql += `
        AND (1 - (dc.embedding <=> $1::vector)) >= $${params.length + 1}
        ORDER BY dc.embedding <=> $1::vector
        LIMIT $${params.length + 2}
      `;

      params.push(threshold, limit);

      const rows = await queryRunner.query(sql, params);

      /* Transform results */
      return rows.map((row: any) => ({
        chunk: {
          id: row.id,
          documentId: row.document_id,
          chunkText: row.chunk_text,
          chunkIndex: row.chunk_index,
          metadata: row.metadata,
        },
        document: {
          id: row.doc_id,
          title: row.title,
          fileType: row.file_type,
        },
        similarity: parseFloat(row.similarity),
        score: parseFloat(row.similarity) /* Can be enhanced with other factors */,
      }));
    } catch (error) {
      logger.error('Error in vector similarity search:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Hybrid search (vector + full-text)
   * Combines vector similarity with PostgreSQL full-text search
   */
  async hybridSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, documentId, useCache = true } = options;

    try {
      const cacheKey = this.#getCacheKey(query, { ...options, hybrid: true });

      if (useCache) {
        const cached = await redisClient.get<SearchResult[]>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Generate query embedding
      const queryEmbedding = await openAIService.generateEmbedding(query);

      const queryRunner = AppDataSource.createQueryRunner();

      try {
        await queryRunner.connect();

        const vectorString = `[${queryEmbedding.join(',')}]`;

        // Build hybrid search query
        let sql = `
          SELECT 
            dc.id,
            dc.document_id,
            dc.chunk_text,
            dc.chunk_index,
            dc.metadata,
            d.id as doc_id,
            d.title,
            d.file_type,
            -- Cosine similarity
            (1 - (dc.embedding <=> $1::vector)) as vector_similarity,
            -- Full-text search rank
            ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', $2)) as text_rank
          FROM document_chunks dc
          JOIN documents d ON dc.document_id = d.id
          WHERE dc.embedding IS NOT NULL
          AND to_tsvector('english', dc.chunk_text) @@ plainto_tsquery('english', $2)
        `;

        const params: any[] = [vectorString, query];

        if (documentId) {
          sql += ` AND dc.document_id = $${params.length + 1}`;
          params.push(documentId);
        }

        sql += `
          ORDER BY 
            (1 - (dc.embedding <=> $1::vector)) * 0.7 + 
            ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', $2)) * 0.3 DESC
          LIMIT $${params.length + 1}
        `;

        params.push(limit);

        const rows = await queryRunner.query(sql, params);

        const results = rows.map((row: any) => ({
          chunk: {
            id: row.id,
            documentId: row.document_id,
            chunkText: row.chunk_text,
            chunkIndex: row.chunk_index,
            metadata: row.metadata,
          },
          document: {
            id: row.doc_id,
            title: row.title,
            fileType: row.file_type,
          },
          similarity: parseFloat(row.vector_similarity),
          score: parseFloat(row.vector_similarity) * 0.7 + parseFloat(row.text_rank) * 0.3,
        }));

        if (useCache) {
          await redisClient.set(cacheKey, results, 3600);
        }

        return results;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      logger.error('Error in hybrid search:', error);
      throw error;
    }
  }

  /**
   * Generate cache key for search query
   */
  #getCacheKey(query: string, options: SearchOptions): string {
    const keyData = JSON.stringify({ query, ...options });
    const hash = createHash('md5').update(keyData).digest('hex');
    return `search:${hash}`;
  }
}
/* Singleton instance */
export const searchService = new SearchService();
