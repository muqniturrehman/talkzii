import 'server-only';
import type { TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { chunkText, toVectorLiteral, type Embedder } from './embeddings';
import { getEmbedder } from './index';
import type { KnowledgeSnippet } from './types';

const INSERT_BATCH = 100;

async function writeChunks(
  admin: TypedSupabaseClient,
  workspaceId: string,
  documentId: string,
  chunks: { index: number; content: string; tokenEstimate: number }[],
  embedder: Embedder,
) {
  const vectors = await embedder.embed(chunks.map((c) => c.content));
  await admin.from('ai_document_chunks').delete().eq('document_id', documentId).eq('workspace_id', workspaceId);
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks.slice(i, i + INSERT_BATCH).map((c, j) => ({
      workspace_id: workspaceId,
      document_id: documentId,
      chunk_index: c.index,
      content: c.content,
      token_count: c.tokenEstimate,
      embedding: toVectorLiteral(vectors[i + j] ?? []),
      embedding_model: embedder.model,
    }));
    const { error } = await admin.from('ai_document_chunks').insert(rows);
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not store document chunks: ${error.message}`);
  }
}

async function markDocument(admin: TypedSupabaseClient, documentId: string, patch: TablesUpdate<'ai_documents'>) {
  await admin.from('ai_documents').update(patch).eq('id', documentId);
}

/** Chunks + embeds a document's text and marks it ready (or failed). */
export async function indexDocument(
  admin: TypedSupabaseClient,
  input: { workspaceId: string; documentId: string; content: string },
): Promise<{ chunkCount: number; embeddingModel: string }> {
  const embedder = getEmbedder();
  await markDocument(admin, input.documentId, { status: 'processing', error: null });
  try {
    const chunks = chunkText(input.content);
    if (chunks.length === 0) throw ApiError.badRequest('The document is empty.');
    await writeChunks(admin, input.workspaceId, input.documentId, chunks, embedder);
    await markDocument(admin, input.documentId, {
      status: 'ready',
      chunk_count: chunks.length,
      embedding_model: embedder.model,
      error: null,
    });
    return { chunkCount: chunks.length, embeddingModel: embedder.model };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexing failed';
    await markDocument(admin, input.documentId, { status: 'failed', error: message.slice(0, 500) });
    throw error;
  }
}

/** Re-embeds an existing document's chunks with the current embedder (after switching providers). */
export async function reindexDocument(admin: TypedSupabaseClient, workspaceId: string, documentId: string) {
  const { data: chunks, error } = await admin
    .from('ai_document_chunks')
    .select('chunk_index, content, token_count')
    .eq('document_id', documentId)
    .eq('workspace_id', workspaceId)
    .order('chunk_index');
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  if (!chunks?.length) throw ApiError.conflict('This document has no stored text to re-index. Delete and add it again.');
  const embedder = getEmbedder();
  await markDocument(admin, documentId, { status: 'processing', error: null });
  try {
    await writeChunks(
      admin,
      workspaceId,
      documentId,
      chunks.map((c) => ({ index: c.chunk_index, content: c.content, tokenEstimate: c.token_count ?? Math.ceil(c.content.length / 4) })),
      embedder,
    );
    await markDocument(admin, documentId, { status: 'ready', embedding_model: embedder.model, error: null });
    return { chunkCount: chunks.length, embeddingModel: embedder.model };
  } catch (err) {
    await markDocument(admin, documentId, { status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : 'Re-index failed' });
    throw err;
  }
}

/** Semantic (or lexical, offline) search over a workspace's ready documents. */
export async function searchKnowledge(
  admin: TypedSupabaseClient,
  workspaceId: string,
  query: string,
  limit = 4,
): Promise<KnowledgeSnippet[]> {
  const text = query.trim();
  if (!text) return [];
  const embedder = getEmbedder();
  const [vector] = await embedder.embed([text.slice(0, 2_000)]);
  if (!vector) return [];
  const { data, error } = await admin.rpc('match_workspace_chunks', {
    p_workspace_id: workspaceId,
    p_query_embedding: toVectorLiteral(vector),
    p_embedding_model: embedder.model,
    p_match_count: limit,
    p_min_similarity: embedder.minSimilarity,
  });
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Knowledge search failed: ${error.message}`);
  return (data ?? []).map((row) => ({ title: row.title, content: row.content, similarity: row.similarity }));
}
