import express from 'express';

import { AppDataSource } from '../../../config/data-source.ts';
import { Document } from '../../../models/Document.ts';
import { DocumentChunk } from '../../../models/DocumentChunk.ts';
import type {
  Document as DocumentType,
  CreateDocumentInput,
  UpdateDocumentInput,
} from '../../../models/Document.ts';
import { logger } from '../../../utils/logger.ts';
import { DateTimeScalar } from '../../../graphql/scalars/DateTime.ts';
import { documentProcessingService } from '../../../services/DocumentProcessingService.ts';
import { env } from '../../../config/environment.ts';
import { Readable } from 'node:stream';
import { FileUpload, GraphQLUpload } from 'graphql-upload-ts';
import { searchService, SearchResult } from '../../../services/SearchService.ts';
import { qaService, QAAnswer } from '../../../services/QAService.ts';

import {
  DocumentNotFoundError,
  UnsupportedFileTypeError,
  FileTooLargeError,
  ValidationError,
  InvalidSearchQueryError,
} from '../../../errors/DomainErrors.ts';
import { logError } from '../../../utils/errorHandler.ts';
import { AppError } from '../../../errors/AppError.ts';

/* Helper: stream -> buffer */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/* GraphQL context shape (what we pass from index.ts) */
interface GraphQLContext {
  req: express.Request;
  res: express.Response;
}

/**
 * Implement all GraphQL queries and mutations for documents
 */
export const documentResolver = {
  /* Scalars */
  DateTime: DateTimeScalar,
  Upload: GraphQLUpload,

  Query: {
    /* Get all documents */
    async getDocuments(): Promise<DocumentType[]> {
      try {
        const documentRepository = AppDataSource.getRepository(Document);
        const documents = await documentRepository.find({
          order: {
            createdAt: 'DESC',
          },
        });

        /* Transform to match GraphQL schema */
        return documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          filePath: doc.filePath,
          fileType: doc.fileType,
          content: doc.content,
          metadata: doc.metadata || null,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }));
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          operation: 'getDocuments',
        });
        throw new Error('Failed to retrieve documents. Please try again later.');
      }
    },

    /* Get a single document by id */
    async getDocument(_: unknown, { id }: { id: string }): Promise<DocumentType | null> {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new ValidationError(
          'Document ID is required and must be a non-empty string',
          'id',
          id
        );
      }

      try {
        const documentRepository = AppDataSource.getRepository(Document);
        const document = await documentRepository.findOne({
          where: { id },
        });

        if (!document) {
          return null;
        }

        /* Transform to match GraphQL schema */
        return {
          id: document.id,
          title: document.title,
          filePath: document.filePath,
          fileType: document.fileType,
          content: document.content,
          metadata: document.metadata || null,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        };
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), {
          operation: 'getDocument',
          documentId: id,
        });
        throw new Error('Failed to retrieve document. Please try again later.');
      }
    },

    async search(
      _: unknown,
      {
        input,
      }: {
        input: {
          question: string;
          limit: number;
          threshold: number;
          documentId: string;
          hybrid?: boolean;
        };
      }
    ): Promise<SearchResult[]> {
      if (!input) {
        throw new ValidationError('Search input is required');
      }
      const { question, limit, threshold, documentId, hybrid = false } = input;

      if (!question || question.trim().length === 0) {
        throw new InvalidSearchQueryError(question);
      }

      if (limit !== undefined && (limit < 1 || limit > 100)) {
        throw new ValidationError('Search limit must be between 1 and 100', 'limit', limit);
      }

      if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
        throw new ValidationError(
          'Similarity threshold must be between 0 and 1',
          'threshold',
          threshold
        );
      }

      try {
        if (hybrid) {
          return await searchService.hybridSearch(question, {
            limit,
            threshold,
            documentId,
          });
        }

        return await searchService.search(question, {
          limit,
          threshold,
          documentId,
        });
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        logError(err instanceof Error ? err : new Error(String(err)), {
          operation: 'search',
          input,
        });
        throw new Error('Search operation failed. Please try again later.');
      }
    },

    /**
     * Answer question using RAG
     */
    async answerQuestion(
      _: unknown,
      { input }: { input: { question: string; maxSources: number; documentId: string } }
    ): Promise<QAAnswer> {
      if (!input) {
        throw new ValidationError('Q&A input is required');
      }

      const { question, maxSources, documentId } = input;

      if (!question || question.trim().length === 0) {
        throw new ValidationError('Question cannot be empty', 'question', question);
      }

      if (maxSources !== undefined && (maxSources < 1 || maxSources > 20)) {
        throw new ValidationError('Max sources must be between 1 and 20', 'maxSources', maxSources);
      }

      if (!documentId || documentId.trim().length === 0) {
        throw new ValidationError('Document ID is required', 'documentId', documentId);
      }

      try {
        return await qaService.answerQuestion(question, {
          maxSources,
          documentId,
        });
      } catch (error) {
        logger.error('Error answering question:', error);
        throw new Error('Failed to answer question');
      }
    },
  },

  Mutation: {
    /* Create a new document */
    async createDocument(
      _: unknown,
      { input }: { input: CreateDocumentInput }
    ): Promise<DocumentType> {
      try {
        const documentRepository = AppDataSource.getRepository(Document);

        /* Parse metadata if provided */
        let metadata: Record<string, any> | null = null;
        if (input.metadata) {
          try {
            metadata = JSON.parse(input.metadata);
          } catch (error) {
            logger.warn('Invalid metadata JSON, using empty object');
            metadata = {};
          }
        }

        /* Create document entity */
        const document = documentRepository.create({
          title: input.title,
          filePath: input.filePath ?? null,
          fileType: input.fileType ?? null,
          content: input.content ?? null,
          metadata: metadata ?? {},
        });

        /* Save to database */
        const savedDocument = await documentRepository.save(document);

        logger.info('Document created', { id: savedDocument.id, title: savedDocument.title });

        /* Transform to match GraphQL schema */
        return {
          id: savedDocument.id,
          title: savedDocument.title,
          filePath: savedDocument.filePath,
          fileType: savedDocument.fileType,
          content: savedDocument.content,
          metadata: savedDocument.metadata || null,
          createdAt: savedDocument.createdAt,
          updatedAt: savedDocument.updatedAt,
        };
      } catch (err) {
        logger.error('Error creating document:', { input, err });
        throw new Error('Failed to create document');
      }
    },

    /* Update an existing document */
    async updateDocument(
      _: unknown,
      { id, input }: { id: string; input: UpdateDocumentInput }
    ): Promise<DocumentType | null> {
      try {
        const documentRepository = AppDataSource.getRepository(Document);

        /* Find document */
        const document = await documentRepository.findOne({
          where: { id },
        });

        if (!document) {
          return null;
        }

        /* Update fields */
        if (input.title !== undefined) {
          document.title = input.title;
        }
        if (input.filePath !== undefined) {
          document.filePath = input.filePath;
        }
        if (input.content !== undefined) {
          document.content = input.content;
        }
        if (input.metadata !== undefined) {
          try {
            document.metadata = input.metadata ? JSON.parse(input.metadata) : {};
          } catch (error) {
            logger.warn('Invalid metadata JSON, keeping existing metadata');
          }
        }

        /* Save updated document */
        const updatedDocument = await documentRepository.save(document);

        logger.info('Document updated', { id });

        /* Transform to match GraphQL schema */
        return {
          id: updatedDocument.id,
          title: updatedDocument.title,
          filePath: updatedDocument.filePath,
          fileType: updatedDocument.fileType,
          content: updatedDocument.content,
          metadata: updatedDocument.metadata || null,
          createdAt: updatedDocument.createdAt,
          updatedAt: updatedDocument.updatedAt,
        };
      } catch (err) {
        logger.error('Error updating document:', { id, input, err });
        throw new Error('Failed to update document');
      }
    },

    /* Delete a document */
    async deleteDocument(_: unknown, { id }: { id: string }): Promise<boolean> {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        throw new ValidationError(
          'Document ID is required and must be a non-empty string',
          'id',
          id
        );
      }

      try {
        const result = await documentProcessingService.deleteDocument(id);

        return result;
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        logError(err instanceof Error ? err : new Error(String(err)), {
          operation: 'deleteDocument',
          documentId: id,
        });
        throw new Error('Failed to delete document. Please try again later.');
      }
    },

    /* Upload and process a document file */
    async uploadDocument(
      _: unknown,
      { file }: { file: Promise<FileUpload> }
    ): Promise<DocumentType> {
      try {
        /* Validate upload object structure */
        if (!file) {
          throw new ValidationError('File is required for upload');
        }

        const upload = await file;

        /* Get the file from the resolver argument (graphql-upload-minimal handles this) */
        const { createReadStream, filename, mimetype } = await upload;

        /* Validate required properties */
        if (!createReadStream) {
          throw new ValidationError('File stream is not available');
        }
        if (!filename || filename.trim().length === 0) {
          throw new ValidationError('File name is required');
        }
        if (!mimetype) {
          throw new Error(
            'File MIME type not available. Please ensure the file is uploaded correctly with multipart/form-data.'
          );
        }

        /* MIME/type validation */
        if (!env.upload.allowedMimeTypes.includes(mimetype)) {
          throw new UnsupportedFileTypeError(mimetype, env.upload.allowedMimeTypes);
        }

        /* Stream -> buffer (for processing service) */
        const buffer = await streamToBuffer(createReadStream());

        /* Size validation */
        if (buffer.length > env.upload.maxFileSize) {
          throw new FileTooLargeError(buffer.length, env.upload.maxFileSize);
        }

        /* Process document (extract text, chunk, embed, save) */
        const savedDocument = await documentProcessingService.processDocument(
          buffer,
          filename,
          mimetype
        );

        return {
          id: savedDocument.id,
          title: savedDocument.title,
          filePath: savedDocument.filePath,
          fileType: savedDocument.fileType,
          content: savedDocument.content,
          metadata: savedDocument.metadata || null,
          createdAt: savedDocument.createdAt,
          updatedAt: savedDocument.updatedAt,
        };
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }

        logError(err instanceof Error ? err : new Error(String(err)), {
          operation: 'uploadDocument',
        });
        throw new Error('Failed to upload document. Please try again later.');
      }
    },
  },
};
