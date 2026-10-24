import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { reindexDocument } from '@/lib/ai/knowledge';

export const maxDuration = 60;

/** Re-embeds a document with the current embedder (e.g. after adding an OpenAI key). */
export const POST = createHandler({ role: 'admin', feature: 'ai_inbox' }, async ({ supabase, admin, params, workspace }) => {
  const id = requireUuid(params.id, 'Document');
  const { data: document } = await supabase.from('ai_documents').select('id').eq('id', id).maybeSingle();
  if (!document) throw ApiError.notFound('Document not found.');
  return reindexDocument(admin(), workspace.id, id);
});
