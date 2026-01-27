import { AppDataSource } from '../config/data-source.ts';
import { Document } from '../models/Document.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';
import { textExtractionService } from './TextExtractionService.ts';
import { openAIService } from './HuggingFaceAIService.ts';
import { logger } from '../utils/logger.ts';
import { redisClient } from '../config/redis.ts';

import {
  DocumentProcessingError,
  EmptyDocumentError,
  EmbeddingGenerationError,
  DatabaseError,
} from '../errors/DomainErrors.ts';
import { handleDatabaseError, logError } from '../utils/errorHandler.ts';
import { AppError } from 'errors/AppError.ts';

/**
 * Document Processing Service
 * Handles document upload, text extraction, chunking, and embedding generation
 */

export class DocumentProcessingService {
  /* Process uploaded file and create document with chunks */
  async processDocument(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<Document> {
    try {
      /* Extract text from file */
      logger.info(`Extracting text from ${fileName} (${mimeType})`);
      const text = await textExtractionService.extractText(fileBuffer, mimeType);

      if (!text || text.trim().length === 0) {
        throw new EmptyDocumentError();
      }

      /* Create document */
      let savedDocument;
      try {
        const documentRepository = AppDataSource.getRepository(Document);
        const document = documentRepository.create({
          title: fileName,
          fileType: mimeType,
          content: text,
          metadata: {
            fileName,
            mimeType,
            textLength: text.length,
          },
        });

        savedDocument = await documentRepository.save(document);
        logger.info(`Document created: ${savedDocument.id}`);
      } catch (err) {
        throw handleDatabaseError(err, 'Failed to save document');
      }

      /* Chunk text */
      logger.info('Chunking text...');
      const chunks = textExtractionService.chunkText(text, 1000, 200);
      logger.info(`Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        throw new DocumentProcessingError('No text chunks could be created from the document');
      }

      /* Generate embeddings for chunks */
      logger.info('Generating embeddings...');
      const chunkRepository = AppDataSource.getRepository(DocumentChunk);

      /* Process chunks in batches to avoid rate limits */
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(chunks.length / batchSize);
        logger.info(`Processing batch ${batchNumber}/${totalBatches}`);

        try {
          const embeddings = await openAIService.generateEmbeddings(batch);

          if (!embeddings || embeddings.length !== batch.length) {
            throw new EmbeddingGenerationError(
              `Expected ${batch.length} embeddings, but received ${embeddings?.length || 0}`
            );
          }

          /* Create chunk entities */
          const chunkEntities = batch.map((chunkText, index) => {
            const rawEmbedding = embeddings[index];
            let embedding: number[] | null = null;

            if (rawEmbedding === null || rawEmbedding === undefined) {
              throw new EmbeddingGenerationError(
                `No embedding returned for chunk at index ${index} in batch ${batchNumber}`
              );
            }

            if (Array.isArray(rawEmbedding)) {
              /* Check if it's a nested array (number[][]) */
              if (rawEmbedding.length > 0 && Array.isArray(rawEmbedding[0])) {
                /* Flatten: [[1,2], [3,4]] -> [1,2,3,4] */
                embedding = (rawEmbedding as number[][]).flat();
              } else {
                /* Already flat: [1,2,3] */
                embedding = rawEmbedding as number[];
              }
            } else if (typeof rawEmbedding === 'number') {
              /* Single number -> wrap in array */
              embedding = [rawEmbedding];
            }

            if (!embedding || embedding.length === 0) {
              throw new Error(`Invalid embedding format at index ${index}`);
            }

            const chunk = chunkRepository.create({
              document: savedDocument,
              chunkText,
              chunkIndex: i + index,
              embedding,
              metadata: {
                chunkLength: chunkText.length,
              },
            });
            return chunk;
          });

          /* Save chunks (we'll need to use raw SQL for vector storage) */
          await this.#saveChunksWithEmbeddings(chunkEntities);
        } catch (err) {
          if (err instanceof EmbeddingGenerationError) {
            throw err;
          }
          throw new DocumentProcessingError(
            `Failed to process batch ${batchNumber}`,
            err instanceof Error ? err : undefined,
            { batchNumber, totalBatches, documentId: savedDocument.id }
          );
        }
      }

      logger.info(
        `Successfully processed document ${savedDocument.id} with ${chunks.length} chunks`
      );

      /* Invalidate cache (gracefully handle Redis failures) */
      try {
        await redisClient.delPattern('documents:*');
      } catch (err) {
        /* Log but don't fail - cache invalidation is not critical */
        logger.warn('Failed to invalidate cache after document processing:', err);
      }

      return savedDocument;
    } catch (err) {
      if (err instanceof AppError) {
        logError(err, { fileName, mimeType });
        throw err;
      }
      /* Wrap unexpected errors */
      const appError = new DocumentProcessingError(
        'An unexpected error occurred while processing the document',
        err instanceof Error ? err : undefined,
        { fileName, mimeType }
      );
      logger.error(appError);
      throw appError;
    }
  }

  /**
   * Save chunks with embeddings using raw SQL
   * TypeORM doesn't support pgvector's vector type natively
   */
  async #saveChunksWithEmbeddings(chunks: Partial<DocumentChunk>[]): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      for (const chunk of chunks) {
        if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
          throw new Error('Embedding must be a number array');
        }

        /* Convert embedding array to PostgreSQL vector format */
        const vectorString = `[${chunk.embedding.join(',')}]`;

        await queryRunner.query(
          `INSERT INTO document_chunks (id, document_id, chunk_text, chunk_index, embedding, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, NOW())
           ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET chunk_text = EXCLUDED.chunk_text,
               embedding = EXCLUDED.embedding,
               metadata = EXCLUDED.metadata`,
          [
            chunk.id || crypto.randomUUID(),
            chunk.documentId,
            chunk.chunkText,
            chunk.chunkIndex,
            vectorString /* This will be cast to vector type */,
            JSON.stringify(chunk.metadata || {}),
          ]
        );
      }
    } catch (error) {
      logger.error('Error saving chunks with embeddings:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Delete document and its chunks
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      const documentRepository = AppDataSource.getRepository(Document);
      const result = await documentRepository.delete(documentId);

      /* Invalidate cache */
      await redisClient.delPattern('documents:*');
      await redisClient.delPattern(`search:*`);

      return (result.affected ?? 0) > 0;
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }
}

/* Singleton instance */
export const documentProcessingService = new DocumentProcessingService();
