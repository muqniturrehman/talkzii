import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chatbotTriggerSchema, flowGraphSchema } from '@talkzi/shared';
import { ChatbotBuilder } from '@/components/app/chatbots/chatbot-builder';
import { requireWorkspace } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Chatbot builder' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatbotBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireWorkspace(`/app/chatbots/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: flow } = await supabase
    .from('chatbot_flows')
    .select('id, name, status, trigger, graph, priority, phone_number_id')
    .eq('id', id)
    .maybeSingle();
  if (!flow) notFound();

  const [{ count: live }, { count: completed }, { count: handedOff }] = await Promise.all([
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).in('status', ['active', 'waiting']),
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).eq('status', 'completed'),
    supabase.from('chatbot_sessions').select('id', { count: 'exact', head: true }).eq('flow_id', id).eq('status', 'handed_off'),
  ]);
  const graph = flowGraphSchema.safeParse(flow.graph);
  const trigger = chatbotTriggerSchema.safeParse(flow.trigger);

  return (
    <ChatbotBuilder
      flow={{
        id: flow.id,
        name: flow.name,
        status: flow.status,
        trigger: trigger.success ? trigger.data : { type: 'keyword', keywords: [], match: 'exact' },
        graph: graph.success ? graph.data : { nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} }], edges: [] },
        priority: flow.priority,
        phone_number_id: flow.phone_number_id,
        stats: { live: live ?? 0, completed: completed ?? 0, handedOff: handedOff ?? 0 },
      }}
    />
  );
}
