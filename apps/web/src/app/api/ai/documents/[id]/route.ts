import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Document');
  const rows = unwrap(await supabase.from('ai_documents').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Document not found.');
  return { id };
});
