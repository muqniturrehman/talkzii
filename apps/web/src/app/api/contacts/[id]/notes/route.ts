import { contactNoteSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import type { NoteItem } from '@/lib/inbox/types';

const NOTE_COLUMNS = 'id, conversation_id, body, mentions, author_id, created_at, author:profiles(full_name, email, avatar_url)';

/** Every note about the contact (contact-level and from its conversations). */
export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Contact');
  return unwrap(await supabase.from('internal_notes').select(NOTE_COLUMNS).eq('contact_id', id).order('created_at', { ascending: false }).limit(100)) satisfies NoteItem[];
});

export const POST = createHandler({ role: 'agent', body: contactNoteSchema }, async ({ supabase, params, body, workspace, user }) => {
  const id = requireUuid(params.id, 'Contact');
  const { data: contact } = await supabase.from('contacts').select('id').eq('id', id).maybeSingle();
  if (!contact) throw ApiError.notFound('Contact not found.');
  return unwrap(
    await supabase
      .from('internal_notes')
      .insert({ workspace_id: workspace.id, contact_id: id, author_id: user.id, body: body.body })
      .select(NOTE_COLUMNS)
      .single(),
  ) satisfies NoteItem;
});
