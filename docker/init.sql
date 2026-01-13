-- enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  file_path TEXT,
  file_type VARCHAR(255),
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create document_chunks table with vector embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536), -- define according with model will be used
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_document_chunk UNIQUE (document_id, chunk_index)
);

-- Create indexes for vector similarity search
-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Full-text search index for hybrid search
CREATE INDEX IF NOT EXISTS document_chunks_text_search_idx
ON document_chunks
USING gin(to_tsvector('english', chunk_text));

-- Index for document lookups
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
ON document_chunks(document_id);

-- Index for document title search
CREATE INDEX IF NOT EXISTS document_title_idx
ON documents(title);

-- Function to update update_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed!';
  END IF;
  RAISE NOTICE 'pgvector extension is enabled and ready!';
END $$;