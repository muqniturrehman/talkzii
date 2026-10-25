import 'server-only';
import { chatbotTriggerSchema, flowGraphSchema, planHasFeature, type FlowGraph, type PlanId, type SendMessageInput } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { getAiTasks } from '@/lib/ai';
import { loadTaskInput } from '@/lib/ai/context';
import { assertAiCredits, recordAiCredit } from '@/lib/ai/credits';
import type { Logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging/send';
import { messagingDeps } from '@/lib/messaging/supabase-store';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { InboundContext } from '@/lib/webhooks/meta/types';
import { matchesTrigger, runFlow, type EngineActions, type EngineContact, type InboundInput, type SessionState } from './engine';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

interface Workspace {
  id: string;
  name: string;
  plan: PlanId;
}

/** Knowledge-base answer for ai_reply steps (meters AI credits on paid providers). */
async function groundedAnswer(admin: TypedSupabaseClient, workspace: Workspace, conversationId: string, log: Logger): Promise<string | null> {
  if (!planHasFeature(workspace.plan, 'ai_inbox')) return null;
  try {
    const tasks = getAiTasks();
    const metered = tasks.provider !== 'heuristic';
    if (metered) await assertAiCredits(admin, workspace);
    const { input, settings } = await loadTaskInput(admin, workspace, conversationId, { withKnowledge: true });
    if (!settings.enabled || input.knowledge.length === 0) return null;
    const result = await tasks.answerQuestion(input);
    if (metered) await recordAiCredit(admin, workspace.id);
    return result.grounded ? result.answer : null;
  } catch (error) {
    log.warn({ err: error }, 'Chatbot AI reply failed');
    return null;
  }
}

/** Actions that really message the customer (sender_type 'bot'). */
export function liveActions(admin: TypedSupabaseClient, ctx: { workspace: Workspace; conversationId: string; contactId: string }, log: Logger): EngineActions {
  const deps = messagingDeps(admin);
  const send = (input: SendMessageInput) => sendMessage(input, { workspaceId: ctx.workspace.id, senderId: null, senderType: 'bot', plan: ctx.workspace.plan }, deps);
  return {
    async sendText(text) {
      await send({ type: 'text', conversationId: ctx.conversationId, text: clip(text, 4096) });
    },
    async sendButtons(text, buttons) {
      await send({
        type: 'interactive_buttons',
        conversationId: ctx.conversationId,
        body: clip(text, 1024),
        buttons: buttons.slice(0, 3).map((b) => ({ id: b.id, title: clip(b.title, 20) })),
      });
    },
    async sendList(text, buttonText, rows) {
      await send({
        type: 'interactive_list',
        conversationId: ctx.conversationId,
        body: clip(text, 4096),
        buttonText: clip(buttonText, 20),
        rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: clip(r.title, 24) })),
      });
    },
    async handoff(assignTo, note) {
      await admin
        .from('conversations')
        .update({ bot_paused: true, status: 'open', ...(assignTo ? { assigned_to: assignTo } : {}) })
        .eq('id', ctx.conversationId)
        .eq('workspace_id', ctx.workspace.id);
      await admin.from('internal_notes').insert({
        workspace_id: ctx.workspace.id,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        author_id: null,
        body: `🤖 Chatbot handed this conversation to the team${note ? `: ${note}` : '.'}`,
      });
    },
    async addLabel(labelId) {
      const { data: label } = await admin.from('labels').select('id').eq('id', labelId).eq('workspace_id', ctx.workspace.id).maybeSingle();
      if (!label) return;
      await admin
        .from('contact_labels')
        .upsert({ contact_id: ctx.contactId, label_id: labelId, workspace_id: ctx.workspace.id }, { ignoreDuplicates: true });
    },
    aiReply: () => groundedAnswer(admin, ctx.workspace, ctx.conversationId, log),
  };
}

export type SimulatedMessage =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: { id: string; title: string }[] }
  | { kind: 'list'; text: string; buttonText: string; rows: { id: string; title: string }[] }
  | { kind: 'handoff'; note: string | null }
  | { kind: 'label'; labelId: string };

/** Collects what the bot would do, without contacting WhatsApp (builder test panel). */
export function simulatorActions(): EngineActions & { messages: SimulatedMessage[] } {
  const messages: SimulatedMessage[] = [];
  return {
    messages,
    async sendText(text) {
      messages.push({ kind: 'text', text });
    },
    async sendButtons(text, buttons) {
      messages.push({ kind: 'buttons', text, buttons: buttons.slice(0, 3).map((b) => ({ id: b.id, title: clip(b.title, 20) })) });
    },
    async sendList(text, buttonText, rows) {
      messages.push({ kind: 'list', text, buttonText, rows });
    },
    async handoff(_assignTo, note) {
      messages.push({ kind: 'handoff', note: note ?? null });
    },
    async addLabel(labelId) {
      messages.push({ kind: 'label', labelId });
    },
    async aiReply() {
      return null;
    },
  };
}

export function inboundInput(message: InboundContext['message']): InboundInput {
  return { text: message.text, replyId: message.interactive?.id || message.button?.payload || null };
}

function parseGraph(graph: unknown): FlowGraph | null {
  const parsed = flowGraphSchema.safeParse(graph);
  return parsed.success ? parsed.data : null;
}

/**
 * Webhook hook: continues the conversation's live chatbot session, or starts
 * the highest-priority active flow whose trigger matches. Skipped while an
 * agent has paused the bot for the conversation.
 */
export async function handleChatbotInbound(admin: TypedSupabaseClient, ctx: InboundContext, log: Logger): Promise<void> {
  if (ctx.message.type === 'reaction') return;
  const [{ data: conversation }, { data: workspace }] = await Promise.all([
    admin.from('conversations').select('id, bot_paused').eq('id', ctx.conversationId).maybeSingle(),
    admin.from('workspaces').select('id, name, plan').eq('id', ctx.workspaceId).maybeSingle(),
  ]);
  if (!conversation || conversation.bot_paused || !workspace) return;
  if (!planHasFeature(workspace.plan, 'chatbots')) return;

  const now = new Date();
  const input = inboundInput(ctx.message);

  let { data: session } = await admin
    .from('chatbot_sessions')
    .select('id, flow_id, current_node_id, variables, status, step_count, expires_at')
    .eq('conversation_id', ctx.conversationId)
    .in('status', ['active', 'waiting'])
    .maybeSingle();

  if (session && session.expires_at && new Date(session.expires_at) < now) {
    await admin.from('chatbot_sessions').update({ status: 'expired' }).eq('id', session.id);
    session = null;
  }

  let flow: { id: string; graph: FlowGraph } | null = null;
  let state: SessionState | null = null;

  if (session) {
    const { data: row } = await admin.from('chatbot_flows').select('id, status, graph').eq('id', session.flow_id).maybeSingle();
    const graph = row?.status === 'active' ? parseGraph(row.graph) : null;
    if (!row || !graph) {
      await admin.from('chatbot_sessions').update({ status: 'completed' }).eq('id', session.id);
      return;
    }
    flow = { id: row.id, graph };
    state = {
      currentNodeId: session.current_node_id,
      variables: (session.variables ?? {}) as Record<string, string>,
      status: session.status as SessionState['status'],
      stepCount: session.step_count,
    };
  } else {
    const { data: flows } = await admin
      .from('chatbot_flows')
      .select('id, trigger, graph, phone_number_id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .order('created_at');
    const { count: inboundCount } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', ctx.conversationId)
      .eq('direction', 'inbound');
    const isFirst = (inboundCount ?? 0) <= 1;

    for (const candidate of flows ?? []) {
      if (candidate.phone_number_id && candidate.phone_number_id !== ctx.phoneNumberRowId) continue;
      const trigger = chatbotTriggerSchema.safeParse(candidate.trigger);
      const graph = parseGraph(candidate.graph);
      if (trigger.success && graph && matchesTrigger(trigger.data, input.text, isFirst)) {
        flow = { id: candidate.id, graph };
        break;
      }
    }
    if (!flow) return;

    const { data: created, error } = await admin
      .from('chatbot_sessions')
      .insert({
        workspace_id: ctx.workspaceId,
        flow_id: flow.id,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        status: 'active',
        expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      })
      .select('id, flow_id, current_node_id, variables, status, step_count, expires_at')
      .single();
    if (error || !created) {
      // Another delivery of the same webhook started the session concurrently.
      log.info({ err: error, conversationId: ctx.conversationId }, 'Chatbot session already live');
      return;
    }
    session = created;
  }

  const { data: contact } = await admin.from('contacts').select('name, profile_name, wa_id, custom_fields').eq('id', ctx.contactId).maybeSingle();
  const engineContact: EngineContact = contact ?? { name: ctx.profileName, profile_name: ctx.profileName, wa_id: ctx.contactWaId, custom_fields: {} };

  let next: SessionState;
  try {
    next = await runFlow(flow.graph, state, input, engineContact, liveActions(admin, { workspace, conversationId: ctx.conversationId, contactId: ctx.contactId }, log));
  } catch (error) {
    log.error({ err: error, flowId: flow.id }, 'Chatbot run failed');
    next = { ...(state ?? { currentNodeId: null, variables: {}, stepCount: 0 }), status: 'failed' };
  }

  await admin
    .from('chatbot_sessions')
    .update({
      current_node_id: next.currentNodeId,
      variables: next.variables as unknown as Json,
      status: next.status,
      step_count: next.stepCount,
      last_interaction_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    })
    .eq('id', session.id);
}
