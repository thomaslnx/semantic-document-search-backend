import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DocumentChunk } from './DocumentChunk.ts';

export interface CreateDocumentInput {
  title: string;
  filePath?: string;
  fileType?: string;
  content?: string;
  metadata?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  filePath?: string;
  fileType?: string;
  content?: string;
  metadata?: string;
}

/**
 * Document Entity
 * Represents a document in the system
 */

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true, name: 'file_path' })
  filePath?: string | null | undefined;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'file_type' })
  fileType?: string | null | undefined;

  @Column({ type: 'text', nullable: true })
  content?: string | null | undefined;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  metadata?: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  /* Relationship with document chunks */
  @OneToMany(() => DocumentChunk, (chunk) => chunk.document, {
    cascade: true,
  })
  chunks?: DocumentChunk[];
}
