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
        logger.error('Error fetching', { err });
        throw new Error('Failed to fetch documents');
      }
    },

    /* Get a single document by id */
    async getDocument(_: unknown, { id }: { id: string }): Promise<DocumentType | null> {
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
        logger.error('Error fetching document:', { id, err });
        throw new Error('Failed to fetch document');
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
      try {
        const documentRepository = AppDataSource.getRepository(Document);
        const result = await documentRepository.delete(id);

        const deleted = (result.affected ?? 0) > 0;
        if (deleted) {
          logger.info('Document deleted', { id });
        }

        return deleted;
      } catch (error) {
        logger.error('Error deleting document:', { id, error });
        throw new Error('Failed to delete document');
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
          throw new Error('No file provided');
        }

        const upload = await file;

        /* Get the file from the resolver argument (graphql-upload-minimal handles this) */
        const { createReadStream, filename, mimetype } = await upload;

        /* Validate required properties */
        if (!createReadStream) {
          throw new Error('File stream not available');
        }
        if (!filename) {
          throw new Error('File name not available');
        }
        if (!mimetype) {
          throw new Error(
            'File MIME type not available. Please ensure the file is uploaded correctly with multipart/form-data.'
          );
        }

        /* MIME/type validation */
        if (!env.upload.allowedMimeTypes.includes(mimetype)) {
          throw new Error(
            `File type ${mimetype} not allowed. Allowed: ${env.upload.allowedMimeTypes.join(', ')}`
          );
        }

        /* Stream -> buffer (for processing service) */
        const buffer = await streamToBuffer(createReadStream());

        /* Size validation */
        if (buffer.length > env.upload.maxFileSize) {
          throw new Error(
            `File too large (${buffer.length} bytes). Max: ${env.upload.maxFileSize} bytes`
          );
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
      } catch (error) {
        logger.error('Error uploading document:', error);
        throw new Error(
          `Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  },
};
