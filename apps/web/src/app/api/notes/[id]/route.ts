import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

/** Authors delete their own notes; admins delete any (enforced by RLS). */
export const DELETE = createHandler({ role: 'agent' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Note');
  const rows = unwrap(await supabase.from('internal_notes').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Note not found, or you can only delete your own notes.');
  return { id };
});
