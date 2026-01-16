import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This initial migration sets up the entire schema.
 * This migration should mirror what's in `docker/init.sql`
 * but in TypeORM migration format
 */

export class InitialSchema1768582650928 implements MigrationInterface {
  name = 'InitialSchema1768582650928';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Enable pgvector extension */
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    /* Create documents table */
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        file_path TEXT,
        file_type VARCHAR(255),
        content TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    /* Create document_chunks table with vector embeddings */
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding vector(1024),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_document_chunk UNIQUE (document_id, chunk_index)
      );
    `);

    /* Create indexes */
    /* Note: IVFFlat index will be created in a separate migration after data is loaded */
    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
        ON document_chunks(document_id);
    `);

    await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS document_title_idx
        ON documents(title);
    `);

    /** Full text search index */
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS document_chunks_text_search_idx
      ON document_chunks
      USING gin(to_tsvector('english', chunk_text));
    `);

    /* Function to update updated_at timestamp */
    await queryRunner.query(`CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    /* Drop trigger if it exists */
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;`);

    /* Trigger to automatically update updated_at */
    await queryRunner.query(`CREATE TRIGGER update_documents_updated_at
      BEFORE UPDATE ON documents
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /* Drop trigger */
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;`);

    /* Drop function */
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column();`);

    /* Drop indexes */
    await queryRunner.query(`DROP INDEX IF EXISTS document_chunks_text_search_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS document_title_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS document_chunks_document_id_idx;`);

    /* Drop tables (order matters due to foreign keys) */
    await queryRunner.query(`DROP TABLE IF EXISTS document_chunks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS documents;`);

    /* We don't drop the vector extension as it might be used by other tables */
  }
}
