-- =============================================================================
-- Talkzi · 0012 · Knowledge base retrieval for server-side callers
--
-- Chunks remember which embedding model produced them so a workspace never
-- compares vectors from different models (e.g. after adding an OpenAI key to
-- a workspace that indexed documents with the offline fallback embedder).
-- =============================================================================

alter table public.ai_documents
  add column embedding_model text not null default 'text-embedding-3-small';

alter table public.ai_document_chunks
  add column embedding_model text not null default 'text-embedding-3-small';

create index ai_document_chunks_workspace_model_idx
  on public.ai_document_chunks (workspace_id, embedding_model);

-- Service-role retrieval (webhook-driven chatbots and API routes that already
-- authorised the workspace). Not callable by anon/authenticated.
create or replace function public.match_workspace_chunks(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1536),
  p_embedding_model text,
  p_match_count integer default 5,
  p_min_similarity double precision default 0.2
)
returns table (id uuid, document_id uuid, title text, content text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.document_id, d.title, c.content, 1 - (c.embedding <=> p_query_embedding) as similarity
  from public.ai_document_chunks c
  join public.ai_documents d on d.id = c.document_id
  where c.workspace_id = p_workspace_id
    and c.embedding_model = p_embedding_model
    and c.embedding is not null
    and d.status = 'ready'
    and 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

revoke execute on function public.match_workspace_chunks(uuid, extensions.vector, text, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_workspace_chunks(uuid, extensions.vector, text, integer, double precision)
  to service_role;
