import { saveChatbotSchema, validateFlowGraph } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

const COLUMNS = 'id, name, description, status, trigger, graph, priority, phone_number_id, version, published_at, updated_at';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Chatbot');
  const { data } = await supabase.from('chatbot_flows').select(COLUMNS).eq('id', id).maybeSingle();
  if (!data) throw ApiError.notFound('Chatbot not found.');
  const [{ count: live }, { count: completed }, { count: handedOff }] = await Promise.all([
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).in('status', ['active', 'waiting']),
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).eq('status', 'completed'),
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).eq('status', 'handed_off'),
  ]);
  return { ...data, stats: { live: live ?? 0, completed: completed ?? 0, handedOff: handedOff ?? 0 } };
});

/** Saves the flow. Active flows must stay valid (structure is checked on save). */
export const PATCH = createHandler({ role: 'admin', body: saveChatbotSchema }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Chatbot');
  const { data: current } = await supabase.from('chatbot_flows').select('id, status, version').eq('id', id).maybeSingle();
  if (!current) throw ApiError.notFound('Chatbot not found.');
  if (current.status === 'active') {
    const errors = validateFlowGraph(body.graph);
    if (errors.length) throw ApiError.validation({ formErrors: errors }, errors[0]);
  }
  const row = unwrap(
    await supabase
      .from('chatbot_flows')
      .update({
        name: body.name,
        description: body.description ?? null,
        trigger: body.trigger as unknown as Json,
        graph: body.graph as unknown as Json,
        phone_number_id: body.phoneNumberId ?? null,
        priority: body.priority,
        version: current.version + 1,
      })
      .eq('id', id)
      .select('id, version, updated_at')
      .single(),
  );
  return row;
});

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Chatbot');
  const rows = unwrap(await supabase.from('chatbot_flows').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Chatbot not found.');
  return { id };
});
