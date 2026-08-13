create extension if not exists vector;

create table spec_chunks (
  id            uuid primary key default gen_random_uuid(),
  spec_id       text not null,
  release       text not null,
  clause_number text not null,
  clause_title  text,
  page_number   int,
  chunk_index   int,
  text          text not null,
  char_count    int,
  embedding     vector(384),
  fts           tsvector generated always as (to_tsvector('english', text)) stored,
  created_at    timestamptz default now()
);

create index on spec_chunks using hnsw (embedding vector_cosine_ops);
create index on spec_chunks using gin (fts);