import { createChatbotSchema, planLimit } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { starterGraph } from '@/lib/chatbots/starter';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) =>
  unwrap(
    await supabase
      .from('chatbot_flows')
      .select('id, name, description, status, trigger, priority, phone_number_id, published_at, updated_at')
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false }),
  ),
);

export const POST = createHandler({ role: 'admin', feature: 'chatbots', body: createChatbotSchema }, async ({ supabase, body, workspace, user }) => {
  const limit = planLimit(workspace.plan, 'chatbots');
  if (Number.isFinite(limit)) {
    const { count } = await supabase.from('chatbot_flows').select('id', { count: 'exact', head: true });
    if ((count ?? 0) >= limit) {
      throw new ApiError(403, 'PLAN_LIMIT', `Your plan includes ${limit} chatbot${limit === 1 ? '' : 's'}. Upgrade to build more.`, { limit: 'chatbots' });
    }
  }
  const { data, error } = await supabase
    .from('chatbot_flows')
    .insert({
      workspace_id: workspace.id,
      name: body.name,
      status: 'draft',
      trigger: { type: 'keyword', keywords: ['hi', 'hello', 'salam'], match: 'exact' },
      graph: starterGraph(workspace.name) as unknown as Json,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !data) throw ApiError.forbidden();
  return data;
});
