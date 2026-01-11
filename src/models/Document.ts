import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DocumentChunk } from './DocumentChunk.ts';

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
  filePath?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'file_type' })
  fileType?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

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
