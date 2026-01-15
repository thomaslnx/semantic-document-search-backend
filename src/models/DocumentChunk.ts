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
    type: 'vector',
    nullable: true,
  })
  embedding?: number[] | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  metadata?: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
