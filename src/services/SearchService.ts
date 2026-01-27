import { AppDataSource } from '../config/data-source.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';
import { openAIService } from './HuggingFaceAIService.ts';
import { redisClient } from '../config/redis.ts';
import { logger } from '../utils/logger.ts';
import { createHash } from 'crypto';

import {
  SearchError,
  InvalidSearchQueryError,
  EmbeddingGenerationError,
  DatabaseError,
} from '../errors/DomainErrors.ts';
import { handleDatabaseError, logError } from '../utils/errorHandler.ts';
import { AppError } from 'errors/AppError.ts';

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

    /* Validate Query */
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new InvalidSearchQueryError(query);
    }

    /* Validate limit */
    if (limit < 1 || limit > 100) {
      throw new SearchError('Search limit must be between 1 and 100', undefined, {
        limit,
      });
    }

    try {
      /* Generate cache key */
      const cacheKey = this.#getCacheKey(query, options);

      /* Try to get from cache */
      if (useCache) {
        try {
          const cached = await redisClient.get<SearchResult[]>(cacheKey);
          if (cached) {
            logger.debug('Search result retrieved from cache');
            return cached;
          }
        } catch (err) {
          /* Cache failure is not critical - log and continue */
          logger.warn('Cache retrieval failed, continuing without cache:', err);
        }
      }

      /* Generate query embedding */
      let queryEmbedding = await openAIService.generateEmbedding(query);

      try {
        queryEmbedding = await openAIService.generateEmbedding(query);
      } catch (err) {
        throw new EmbeddingGenerationError(
          'Failed to generate embedding for search query',
          err instanceof Error ? err : undefined
        );
      }

      /* Perform vector similarity search */
      const results = await this.#vectorSimilaritySearch(
        queryEmbedding,
        limit,
        threshold,
        documentId
      );

      /* Cache results (gracefully handle failures) */
      if (useCache && results.length > 0) {
        try {
          await redisClient.set(cacheKey, results, 3600);
        } catch (err) {
          if (err instanceof AppError) {
            logError(err, { query, options });
            throw err;
          }
        }
      }

      return results;
    } catch (err) {
      const appError = new SearchError(
        'An unexpected error occurred during search',
        err instanceof Error ? err : undefined,
        { query, options }
      );
      logError(appError);
      throw appError;
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

      let rows = await queryRunner.query(sql, params);

      try {
        rows = await queryRunner.query(sql, params);
      } catch (err) {
        throw handleDatabaseError(err, 'Vector similarity search query failed');
      }

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
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw handleDatabaseError(err, 'Vector similarity search failed');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Hybrid search (vector + full-text)
   * Combines vector similarity with PostgreSQL full-text search
   */
  async hybridSearch(question: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, documentId, useCache = true } = options;

    /* Validate query */
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      throw new InvalidSearchQueryError(question);
    }

    /* Validate limit */
    if (limit < 1 || limit > 100) {
      throw new SearchError('Search limit must be between 1 and 100', undefined, { limit });
    }

    /* Validate threshold */
    if (threshold < 0 || threshold > 1) {
      throw new SearchError('Similarity threshold must be between 0 and 1', undefined, {
        threshold,
      });
    }

    try {
      const cacheKey = this.#getCacheKey(question, { ...options, hybrid: true });

      if (useCache) {
        try {
          const cached = await redisClient.get<SearchResult[]>(cacheKey);
          if (cached) {
            logger.debug('Hybrid search result retrieved from cache');
            return cached;
          }
        } catch (err) {
          /* Cache failure is not critical - log and continue */
          logger.warn('Cache retrieval failed for hybrid search, continuing without cache:', err);
        }
      }

      /* Generate query embedding */
      let queryEmbedding: (number | number[] | number[][])[];

      try {
        queryEmbedding = await openAIService.generateEmbedding(question);
      } catch (err) {
        throw new EmbeddingGenerationError(
          'Failed to generate embedding for hybrid search query',
          err instanceof Error ? err : undefined
        );
      }

      // Perform hybrid search
      const results = await this.#performHybridSearch(
        queryEmbedding,
        question,
        limit,
        threshold,
        documentId
      );

      // Cache results (gracefully handle failures)
      if (useCache && results.length > 0) {
        try {
          await redisClient.set(cacheKey, results, 3600);
        } catch (error) {
          logger.warn('Cache storage failed for hybrid search:', error);
        }
      }

      return results;
    } catch (err) {
      if (err instanceof AppError) {
        logError(err, { question, options, searchType: 'hybrid' });
        throw err;
      }

      /* Wrap unexpected errors */
      const appError = new SearchError(
        'An unexpected error occurred during hybrid search',
        err instanceof Error ? err : undefined,
        { question, options, searchType: 'hybrid' }
      );
      logError(appError);
      throw appError;
    }
  }

  /**
   * Perform hybrid search using pgvector and PostgreSQL full-text search
   * Uses raw SQL because TypeORM doesn't support vector operations
   * This is a private helper method extracted from hybridSearch for better error handling
   */
  async #performHybridSearch(
    queryEmbedding: (number | number[] | number[][])[],
    question: string,
    limit: number,
    threshold: number,
    documentId?: string
  ): Promise<SearchResult[]> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      /* Convert embedding array to PostgreSQL vector format */
      const vectorString = `[${queryEmbedding.join(',')}]`;

      /* Build hybrid search query */
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

      const params: any[] = [vectorString, question];

      if (documentId) {
        sql += ` AND dc.document_id = $${params.length + 1}`;
        params.push(documentId);
      }

      /**
       * Add threshold filter for vector similarity
       * Only include results above the similarity threshold
       */
      sql += `
          AND (1 - (dc.embedding <=> $1::vector)) >= $${params.length + 1}
        `;
      params.push(threshold);

      sql += `
          ORDER BY
            (1 - (dc.embedding <=> $1::vector)) * 0.7 +
            ts_rank(to_tsvector('english', dc.chunk_text), plainto_tsquery('english', $2)) * 0.3 DESC
          LIMIT $${params.length + 1}
        `;
      params.push(limit);

      let rows;

      try {
        rows = await queryRunner.query(sql, params);
      } catch (err) {
        throw handleDatabaseError(err, 'Hybrid search query failed');
      }

      return rows.map((row: any) => {
        const vectorSimilarity = parseFloat(row.vector_similarity) || 0;
        const textRank = parseFloat(row.text_rank) || 0;

        /* Calculate combined score: 70% vector similarity + 30% text rank */
        const combinedScore = vectorSimilarity * 0.7 + textRank * 0.3;

        return {
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
        };
      });
    } catch (error) {
      /* If it's already an AppError, re-throw it */
      if (error instanceof AppError) {
        throw error;
      }

      /* Wrap unexpected errors */
      throw handleDatabaseError(error, 'Hybrid search operation failed');
    } finally {
      /* Always release the query runner */
      await queryRunner.release();
    }
  }

  /**
   * Generate cache key for search query
   */
  #getCacheKey(question: string, options: SearchOptions): string {
    const keyData = JSON.stringify({ question, ...options });
    const hash = createHash('md5').update(keyData).digest('hex');
    return `search:${hash}`;
  }
}
/* Singleton instance */
export const searchService = new SearchService();
