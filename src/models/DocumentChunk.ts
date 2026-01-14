import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Document } from './Document.ts';

/*
 * DocumentChunk Entity
 * Represents a chunk of a document with its vector embedding
 */
@Entity('document_chunks')
@Unique(['document', 'chunkIndex'])
@Index(['documentId'])
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Document, (document) => document.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ type: 'text', name: 'chunk_text' })
  chunkText!: string;

  @Column({ type: 'int', name: 'chunk_index' })
  chunkIndex!: number;

  /**
   * Vector embedding
   * TypeORM doesn't support pgvector's vector type natively
   * We'll use a custom approach:
   * - In TypeORM: treat as text or use raw queries
   * - For vector operations: use raw SQL queries
   */
  @Column({
    type: 'text',
    nullable: true,
    /* We'll use a transform to handle vector type */
    transformer: {
      to: (value: number[] | null) => {
        if (!value) return null;
        /* Convert array to PostgreSQL vector format: [1,2,3] */
        return `[${value.join(',')}]`;
      },
      from: (value: string | null) => {
        if (!value) return null;
        /* Parse PostgreSQL vector format: [1,2,3] -> [1,2,3] */
        return value
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(Number);
      },
    },
  })
  embedding?: number[] | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  metadata?: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
