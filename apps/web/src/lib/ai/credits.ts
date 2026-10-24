import 'server-only';
import { planLimit, type PlanId } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

export const AI_CREDIT_METRIC = 'ai_credits';

/** First day of the current UTC month, matching usage_counters.period. */
export const currentPeriod = (now = new Date()) => `${now.toISOString().slice(0, 7)}-01`;

export async function aiCreditsUsed(admin: TypedSupabaseClient, workspaceId: string): Promise<number> {
  const { data } = await admin
    .from('usage_counters')
    .select('value')
    .eq('workspace_id', workspaceId)
    .eq('metric', AI_CREDIT_METRIC)
    .eq('period', currentPeriod())
    .maybeSingle();
  return Number(data?.value ?? 0);
}

/** Each AI call to a paid provider costs one credit from the plan's monthly allowance. */
export async function assertAiCredits(admin: TypedSupabaseClient, workspace: { id: string; plan: PlanId }) {
  const limit = planLimit(workspace.plan, 'ai_credits_per_month');
  const used = await aiCreditsUsed(admin, workspace.id);
  if (used >= limit) {
    throw new ApiError(403, 'PLAN_LIMIT', `You've used all ${limit.toLocaleString()} AI credits for this month. Upgrade for more.`, {
      limit: 'ai_credits_per_month',
      used,
    });
  }
}

export async function recordAiCredit(admin: TypedSupabaseClient, workspaceId: string, amount = 1) {
  await admin.rpc('increment_usage', { p_workspace_id: workspaceId, p_metric: AI_CREDIT_METRIC, p_amount: amount });
}
