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

/**
 * Implement all GraphQL queries and mutations for documents
 */
export const documentResolver = {
  /* DateTime scalar resolver */
  DateTime: DateTimeScalar,

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
  },
};
