import { saveBroadcastSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { BROADCAST_DETAIL_COLUMNS, EDITABLE_BROADCAST_STATUSES } from '@/lib/broadcasts/columns';
import { getBroadcastQueue } from '@/lib/broadcasts/queue';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Broadcast');
  const { data } = await supabase.from('broadcasts').select(BROADCAST_DETAIL_COLUMNS).eq('id', id).maybeSingle();
  if (!data) throw ApiError.notFound('Broadcast not found.');
  return data;
});

/** Edits a draft (or a scheduled broadcast, which goes back to draft until relaunched). */
export const PATCH = createHandler({ role: 'admin', body: saveBroadcastSchema }, async ({ supabase, admin, params, body, log }) => {
  const id = requireUuid(params.id, 'Broadcast');
  const { data: current } = await supabase.from('broadcasts').select('id, status').eq('id', id).maybeSingle();
  if (!current) throw ApiError.notFound('Broadcast not found.');
  if (!(EDITABLE_BROADCAST_STATUSES as readonly string[]).includes(current.status)) {
    throw ApiError.conflict(`A ${current.status} broadcast can't be edited.`);
  }
  const { data: template } = await supabase.from('message_templates').select('id, name, language').eq('id', body.templateId).maybeSingle();
  if (!template) throw ApiError.validation({ fieldErrors: { templateId: ['Template not found'] } });

  const { error } = await supabase
    .from('broadcasts')
    .update({
      name: body.name,
      template_id: template.id,
      template_name: template.name,
      template_language: template.language,
      phone_number_id: body.phoneNumberId ?? null,
      audience: body.audience as unknown as Json,
      variable_mapping: body.variables as unknown as Json,
      status: 'draft',
      scheduled_at: null,
    })
    .eq('id', id);
  if (error) throw ApiError.forbidden();

  if (current.status === 'scheduled') {
    const queue = await getBroadcastQueue(admin(), log);
    try {
      await queue.remove(id);
    } finally {
      await queue.close();
    }
  }
  return { id, status: 'draft' };
});

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, admin, params, log }) => {
  const id = requireUuid(params.id, 'Broadcast');
  const { data: current } = await supabase.from('broadcasts').select('id, status').eq('id', id).maybeSingle();
  if (!current) throw ApiError.notFound('Broadcast not found.');
  if (current.status === 'sending') throw ApiError.conflict('Pause or cancel the broadcast before deleting it.');
  const queue = await getBroadcastQueue(admin(), log);
  try {
    await queue.remove(id);
  } finally {
    await queue.close();
  }
  const { error } = await supabase.from('broadcasts').delete().eq('id', id);
  if (error) throw ApiError.forbidden();
  return { id };
});
