import { createNoteSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { listNotes } from '@/lib/inbox/queries';
import type { NoteItem } from '@/lib/inbox/types';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) =>
  listNotes(supabase, requireUuid(params.id, 'Conversation')),
);

/** Internal notes are visible to the team only — never sent to WhatsApp. */
export const POST = createHandler({ role: 'agent', body: createNoteSchema }, async ({ supabase, params, body, workspace, user }) => {
  const id = requireUuid(params.id, 'Conversation');
  const { data: conversation } = await supabase.from('conversations').select('id, contact_id').eq('id', id).maybeSingle();
  if (!conversation) throw ApiError.notFound('Conversation not found.');

  const note = unwrap(
    await supabase
      .from('internal_notes')
      .insert({
        workspace_id: workspace.id,
        conversation_id: id,
        contact_id: conversation.contact_id,
        author_id: user.id,
        body: body.body,
        mentions: body.mentions,
      })
      .select('id, conversation_id, body, mentions, author_id, created_at, author:profiles(full_name, email, avatar_url)')
      .single(),
  );
  return note satisfies NoteItem;
});
