import 'server-only';
import { planLimit, type PlanId, type PlanLimit } from '@talkzi/shared';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

/** usage_counters metric names written by the app (period = first day of the UTC month). */
export const USAGE_METRICS = {
  messagesSent: 'messages_sent',
  broadcastRecipients: 'broadcast_recipients',
  aiCredits: 'ai_credits',
} as const;

export const monthStart = (now = new Date()) => `${now.toISOString().slice(0, 7)}-01`;

export async function monthlyUsage(db: TypedSupabaseClient, workspaceId: string, metric: string, now = new Date()): Promise<number> {
  const { data } = await db
    .from('usage_counters')
    .select('value')
    .eq('workspace_id', workspaceId)
    .eq('metric', metric)
    .eq('period', monthStart(now))
    .maybeSingle();
  return Number(data?.value ?? 0);
}

export interface UsageItem {
  key: PlanLimit;
  label: string;
  used: number;
  /** null = unlimited on this plan. */
  limit: number | null;
  monthly: boolean;
}

const finite = (n: number) => (Number.isFinite(n) ? n : null);

/** Current usage against every plan limit, counted the same way the limits are enforced. */
export async function loadUsage(db: TypedSupabaseClient, workspaceId: string, plan: PlanId): Promise<UsageItem[]> {
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [members, invites, phones, contacts, chatbots, clients, messages, recipients, credits] = await Promise.all([
    count(db.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)),
    count(
      db
        .from('workspace_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('accepted_at', null)
        .is('revoked_at', null),
    ),
    count(db.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)),
    count(db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)),
    count(db.from('chatbot_flows').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)),
    count(db.from('workspaces').select('id', { count: 'exact', head: true }).eq('parent_workspace_id', workspaceId)),
    monthlyUsage(db, workspaceId, USAGE_METRICS.messagesSent),
    monthlyUsage(db, workspaceId, USAGE_METRICS.broadcastRecipients),
    monthlyUsage(db, workspaceId, USAGE_METRICS.aiCredits),
  ]);

  const items: UsageItem[] = [
    { key: 'seats', label: 'Team members (incl. pending invites)', used: members + invites, limit: finite(planLimit(plan, 'seats')), monthly: false },
    { key: 'phone_numbers', label: 'WhatsApp numbers', used: phones, limit: finite(planLimit(plan, 'phone_numbers')), monthly: false },
    { key: 'contacts', label: 'Contacts', used: contacts, limit: finite(planLimit(plan, 'contacts')), monthly: false },
    { key: 'messages_per_month', label: 'Messages sent', used: messages, limit: finite(planLimit(plan, 'messages_per_month')), monthly: true },
    {
      key: 'broadcast_recipients_per_month',
      label: 'Broadcast recipients',
      used: recipients,
      limit: finite(planLimit(plan, 'broadcast_recipients_per_month')),
      monthly: true,
    },
    { key: 'chatbots', label: 'Chatbots', used: chatbots, limit: finite(planLimit(plan, 'chatbots')), monthly: false },
    { key: 'ai_credits_per_month', label: 'AI credits', used: credits, limit: finite(planLimit(plan, 'ai_credits_per_month')), monthly: true },
  ];
  if (planLimit(plan, 'client_workspaces') > 0 || clients > 0) {
    items.push({ key: 'client_workspaces', label: 'Client workspaces', used: clients, limit: finite(planLimit(plan, 'client_workspaces')), monthly: false });
  }
  return items;
}
