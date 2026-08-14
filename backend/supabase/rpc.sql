-- Vector similarity search for RAG
CREATE OR REPLACE FUNCTION match_chunks_vector (
  query_embedding vector(384),
  match_limit int DEFAULT 20,
  filter_spec_id text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  spec_id text,
  release text,
  clause_number text,
  clause_title text,
  page_number int,
  chunk_index int,
  text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    spec_chunks.id,
    spec_chunks.spec_id,
    spec_chunks.release,
    spec_chunks.clause_number,
    spec_chunks.clause_title,
    spec_chunks.page_number,
    spec_chunks.chunk_index,
    spec_chunks.text,
    1 - (spec_chunks.embedding <=> query_embedding) AS similarity
  FROM spec_chunks
  WHERE filter_spec_id IS NULL OR spec_chunks.spec_id = filter_spec_id
  ORDER BY spec_chunks.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;
