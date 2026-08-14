-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main chunks table for 3GPP spec content
-- embedding dimension: 384 (all-MiniLM-L6-v2)
CREATE TABLE IF NOT EXISTS spec_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id       TEXT NOT NULL,           -- e.g. "TS 23.501"
  release       TEXT NOT NULL,           -- e.g. "Rel-17"
  clause_number TEXT NOT NULL,           -- e.g. "5.3.2"
  clause_title  TEXT,                    -- e.g. "RRC connection establishment"
  page_number   INT,                     -- 1-based page in source PDF
  chunk_index   INT,                     -- 0-based index within clause
  text          TEXT NOT NULL,           -- raw chunk text (display + full-text search)
  char_count    INT,
  embedding     VECTOR(384),             -- MiniLM dim (change if switching models)
  fts           TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for upsert deduplication (re-running ingest is safe)
  UNIQUE (spec_id, clause_number, chunk_index)
);

-- HNSW index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_spec_chunks_embedding
  ON spec_chunks USING HNSW (embedding VECTOR_COSINE_OPS);

-- GIN index for full-text / BM25-style keyword search
CREATE INDEX IF NOT EXISTS idx_spec_chunks_fts
  ON spec_chunks USING GIN (fts);

-- Composite index for metadata filtering (spec_id + clause_number)
CREATE INDEX IF NOT EXISTS idx_spec_chunks_spec_clause
  ON spec_chunks (spec_id, clause_number);