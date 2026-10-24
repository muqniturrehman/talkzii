import { chatbotStatusSchema, chatbotTriggerSchema, flowGraphSchema, validateFlowGraph } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** Activates (after validation) or deactivates a flow. */
export const POST = createHandler({ role: 'admin', feature: 'chatbots', body: chatbotStatusSchema }, async ({ supabase, params, body, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Chatbot');
  const { data: flow } = await supabase.from('chatbot_flows').select('id, graph, trigger').eq('id', id).maybeSingle();
  if (!flow) throw ApiError.notFound('Chatbot not found.');

  if (body.status === 'active') {
    const graph = flowGraphSchema.safeParse(flow.graph);
    const trigger = chatbotTriggerSchema.safeParse(flow.trigger);
    const errors = graph.success ? validateFlowGraph(graph.data) : ['The flow is corrupted — reset it in the builder.'];
    if (!trigger.success) errors.push('Set up a trigger first.');
    else if (trigger.data.type === 'keyword' && trigger.data.keywords.length === 0) errors.push('Add at least one trigger keyword.');
    if (errors.length) throw ApiError.validation({ formErrors: errors }, errors[0]);
  }

  const row = unwrap(
    await supabase
      .from('chatbot_flows')
      .update({ status: body.status, ...(body.status === 'active' ? { published_at: new Date().toISOString() } : {}) })
      .eq('id', id)
      .select('id, status, published_at')
      .single(),
  );
  if (body.status !== 'active') {
    // End live sessions so customers aren't stuck waiting on a disabled bot.
    await supabase.from('chatbot_sessions').update({ status: 'completed' }).eq('flow_id', id).in('status', ['active', 'waiting']);
  }
  await audit({ workspaceId: workspace.id, actorId: user.id, action: `chatbot.${body.status}`, targetType: 'chatbot_flow', targetId: id, req });
  return row;
});
