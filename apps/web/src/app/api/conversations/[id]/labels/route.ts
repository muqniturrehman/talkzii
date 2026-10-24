import { z } from 'zod';
import { labelLinkSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

async function conversationLabels(supabase: TypedSupabaseClient, conversationId: string) {
  const rows = unwrap(
    await supabase.from('conversation_labels').select('label:labels(id, name, color)').eq('conversation_id', conversationId),
  );
  return rows.flatMap((r) => (r.label ? [r.label] : [])).sort((a, b) => a.name.localeCompare(b.name));
}

export const POST = createHandler({ role: 'agent', body: labelLinkSchema }, async ({ supabase, params, body, workspace }) => {
  const id = requireUuid(params.id, 'Conversation');
  const [{ data: conversation }, { data: label }] = await Promise.all([
    supabase.from('conversations').select('id').eq('id', id).maybeSingle(),
    supabase.from('labels').select('id').eq('id', body.labelId).maybeSingle(),
  ]);
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  if (!label) throw ApiError.notFound('Label not found.');

  const { error } = await supabase
    .from('conversation_labels')
    .upsert({ conversation_id: id, label_id: body.labelId, workspace_id: workspace.id }, { ignoreDuplicates: true });
  if (error) throw ApiError.forbidden();
  return conversationLabels(supabase, id);
});

export const DELETE = createHandler(
  { role: 'agent', query: z.object({ labelId: z.uuid() }) },
  async ({ supabase, params, query }) => {
    const id = requireUuid(params.id, 'Conversation');
    const { error } = await supabase.from('conversation_labels').delete().eq('conversation_id', id).eq('label_id', query.labelId);
    if (error) throw ApiError.forbidden();
    return conversationLabels(supabase, id);
  },
);
