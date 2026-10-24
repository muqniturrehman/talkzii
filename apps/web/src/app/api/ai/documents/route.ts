import { aiDocumentSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getEmbedder } from '@/lib/ai';
import { indexDocument } from '@/lib/ai/knowledge';

export const maxDuration = 60;

export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) => {
  const documents = unwrap(
    await supabase
      .from('ai_documents')
      .select('id, title, status, error, chunk_count, embedding_model, created_at')
      .order('created_at', { ascending: false }),
  );
  return { documents, embeddingModel: getEmbedder().model };
});

/** Adds a knowledge-base document (pasted text) and indexes it for retrieval. */
export const POST = createHandler(
  { role: 'admin', feature: 'ai_inbox', body: aiDocumentSchema },
  async ({ supabase, admin, body, workspace, user, req }) => {
    const { data: document, error } = await supabase
      .from('ai_documents')
      .insert({ workspace_id: workspace.id, title: body.title, source_type: 'text', created_by: user.id, status: 'pending' })
      .select('id')
      .single();
    if (error || !document) throw ApiError.forbidden();

    const result = await indexDocument(admin(), { workspaceId: workspace.id, documentId: document.id, content: body.content });
    await audit({ workspaceId: workspace.id, actorId: user.id, action: 'ai_document.created', targetType: 'ai_document', targetId: document.id, req });
    return { id: document.id, ...result };
  },
);
