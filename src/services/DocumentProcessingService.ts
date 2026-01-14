import { AppDataSource } from '../config/data-source.ts';
import { Document } from '../models/Document.ts';
import { DocumentChunk } from '../models/DocumentChunk.ts';
import { textExtractionService } from './TextExtractionService.ts';
import { openAIService } from './OpenAIService.ts';
import { logger } from '../utils/logger.ts';
import { redisClient } from '../config/redis.ts';

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
        throw new Error('No text could be extracted from the file');
      }

      /* Create document */
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

      const savedDocument = await documentRepository.save(document);
      logger.info(`Document created: ${savedDocument.id}`);

      /* Chunk text */
      logger.info('Chunking text...');
      const chunks = textExtractionService.chunkText(text, 1000, 200);
      logger.info(`Created ${chunks.length} chunks`);

      /* Generate embeddings for chunks */
      logger.info('Generating embeddings...');
      const chunkRepository = AppDataSource.getRepository(DocumentChunk);

      /* Process chunks in batches to avoid rate limits */
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        logger.info(
          `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`
        );

        const embeddings = await openAIService.generateEmbeddings(batch);

        /* Create chunk entities */
        const chunkEntities = batch.map((chunkText, index) => {
          const chunk = chunkRepository.create({
            documentId: savedDocument.id,
            chunkText,
            chunkIndex: i + index,
            embedding: embeddings[index]!,
            metadata: {
              chunkLength: chunkText.length,
            },
          });
          return chunk;
        });

        // Save chunks (we'll need to use raw SQL for vector storage)
        await this.#saveChunksWithEmbeddings(chunkEntities);
      }

      logger.info(
        `Successfully processed document ${savedDocument.id} with ${chunks.length} chunks`
      );

      // Invalidate cache for document queries
      await redisClient.delPattern('documents:*');

      return savedDocument;
    } catch (error) {
      logger.error('Error processing document:', error);
      throw error;
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

        // Convert embedding array to PostgreSQL vector format
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

      // Invalidate cache
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
