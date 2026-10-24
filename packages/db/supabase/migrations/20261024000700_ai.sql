-- =============================================================================
-- Talkzi · 0007 · AI knowledge base (RAG with pgvector)
-- =============================================================================

create table public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_type text not null default 'text' check (source_type in ('upload', 'text', 'url')),
  storage_path text,
  mime_type text,
  status public.document_status not null default 'pending',
  error text,
  chunk_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_documents_workspace_idx on public.ai_documents (workspace_id, created_at desc);

create table public.ai_document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  document_id uuid not null references public.ai_documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  -- text-embedding-3-small dimensions
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index ai_document_chunks_workspace_idx on public.ai_document_chunks (workspace_id);
create index ai_document_chunks_embedding_idx
  on public.ai_document_chunks using hnsw (embedding extensions.vector_cosine_ops);
