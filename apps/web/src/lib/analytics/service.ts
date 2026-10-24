import 'server-only';
import { DEFAULT_RATE_CARD, estimateCost, planHasFeature, type PlanId, type PricingCategory } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { AnalyticsPayload } from './types';

const CATEGORIES: PricingCategory[] = ['marketing', 'utility', 'authentication', 'service'];

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new ApiError(500, 'INTERNAL_ERROR', `${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

/** Every calendar day in [from, to) as YYYY-MM-DD in the workspace timezone. */
export function dayRange(days: number, timeZone: string, now = new Date()): string[] {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Array.from({ length: days }, (_, i) => format.format(new Date(now.getTime() - (days - 1 - i) * 86_400_000)));
}

/** Weighted median of daily medians is not a true median; we report the answered-weighted mean of daily medians. */
function weightedMedian(rows: { median_seconds: number | null; answered: number }[]): number | null {
  const answered = rows.filter((r) => r.median_seconds !== null && r.answered > 0);
  const weight = answered.reduce((n, r) => n + r.answered, 0);
  return weight ? answered.reduce((n, r) => n + (r.median_seconds as number) * r.answered, 0) / weight : null;
}

export async function loadAnalytics(
  supabase: TypedSupabaseClient,
  workspace: { id: string; plan: PlanId },
  days: number,
): Promise<AnalyticsPayload> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const advanced = planHasFeature(workspace.plan, 'analytics_advanced');

  const { data: ws } = await supabase.from('workspaces').select('timezone').eq('id', workspace.id).maybeSingle();
  const timeZone = ws?.timezone ?? 'UTC';

  const outbound = () =>
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', fromIso);

  const [volumeRes, responseRes, costRes, csatRes, conversationsRes, resolvedRes, sentRes, deliveredRes, readRes, qualityRes, broadcastsRes] = await Promise.all([
    supabase.rpc('analytics_message_volume', { p_from: fromIso, p_to: toIso }),
    supabase.rpc('analytics_response_times', { p_from: fromIso, p_to: toIso }),
    supabase.rpc('analytics_cost_by_category', { p_from: fromIso, p_to: toIso }),
    supabase.rpc('analytics_csat', { p_from: fromIso, p_to: toIso }),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', fromIso),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('resolved_at', fromIso),
    outbound().in('status', ['sent', 'delivered', 'read', 'failed']),
    outbound().in('status', ['delivered', 'read']),
    outbound().eq('status', 'read'),
    advanced
      ? supabase
          .from('phone_number_quality_events')
          .select('created_at, event, quality_rating, messaging_limit_tier, phone:phone_numbers(display_phone_number)')
          .gte('created_at', new Date(to.getTime() - 90 * 86_400_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    advanced
      ? supabase
          .from('broadcasts')
          .select('id, name, started_at, sent_count, delivered_count, read_count, replied_count, failed_count')
          .gte('created_at', fromIso)
          .neq('status', 'draft')
          .order('started_at', { ascending: false, nullsFirst: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const volumeRows = check(volumeRes, 'volume');
  const responseRows = check(responseRes, 'response times');
  const costRows = check(costRes, 'cost');
  const csatRows = check(csatRes, 'csat');

  const byDay = new Map(volumeRows.map((r) => [String(r.day), r]));
  const responseByDay = new Map(responseRows.map((r) => [String(r.day), r]));
  const daysList = dayRange(days, timeZone, to);

  const volume = daysList.map((day) => ({ day, inbound: Number(byDay.get(day)?.inbound ?? 0), outbound: Number(byDay.get(day)?.outbound ?? 0) }));
  const responseTimes = daysList.map((day) => {
    const r = responseByDay.get(day);
    return {
      day,
      medianMinutes: r?.median_seconds !== null && r?.median_seconds !== undefined && Number(r.answered) > 0 ? Math.round((r.median_seconds / 60) * 10) / 10 : null,
      answered: Number(r?.answered ?? 0),
      total: Number(r?.total ?? 0),
    };
  });

  const costByCategory = CATEGORIES.map((category) => {
    const row = costRows.find((r) => r.category === category);
    const billable = Number(row?.billable ?? 0);
    return { category, billable, total: Number(row?.total ?? 0), rate: DEFAULT_RATE_CARD[category], cost: estimateCost(billable, category) };
  });
  const csat = [1, 2, 3, 4, 5].map((score) => ({ score, responses: Number(csatRows.find((r) => r.score === score)?.responses ?? 0) }));
  const csatResponses = csat.reduce((n, r) => n + r.responses, 0);

  const sentish = sentRes.count ?? 0;
  const delivered = deliveredRes.count ?? 0;
  const read = readRes.count ?? 0;
  const answeredTotal = responseRows.reduce((n, r) => n + Number(r.answered), 0);
  const waitsTotal = responseRows.reduce((n, r) => n + Number(r.total), 0);

  const qualityRows = check(qualityRes as { data: unknown[] | null; error: { message: string } | null }, 'quality') as {
    created_at: string;
    event: string;
    quality_rating: string | null;
    messaging_limit_tier: string | null;
    phone: { display_phone_number: string } | null;
  }[];
  const broadcastRows = check(broadcastsRes as { data: unknown[] | null; error: { message: string } | null }, 'broadcasts') as {
    id: string;
    name: string;
    started_at: string | null;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    replied_count: number;
    failed_count: number;
  }[];

  return {
    range: { days, from: fromIso, to: toIso },
    advanced,
    totals: {
      inbound: volume.reduce((n, d) => n + d.inbound, 0),
      outbound: volume.reduce((n, d) => n + d.outbound, 0),
      conversationsStarted: conversationsRes.count ?? 0,
      resolved: resolvedRes.count ?? 0,
      medianFirstResponseSeconds: weightedMedian(responseRows.map((r) => ({ median_seconds: r.median_seconds, answered: Number(r.answered) }))),
      answeredRate: waitsTotal ? answeredTotal / waitsTotal : null,
      deliveryRate: sentish ? delivered / sentish : null,
      readRate: sentish ? read / sentish : null,
      csatAverage: csatResponses ? csat.reduce((n, r) => n + r.score * r.responses, 0) / csatResponses : null,
      csatResponses,
      estimatedCostUsd: Math.round(costByCategory.reduce((n, c) => n + c.cost, 0) * 100) / 100,
    },
    volume,
    responseTimes,
    costByCategory,
    csat,
    quality: qualityRows.map((q) => ({ at: q.created_at, phone: q.phone?.display_phone_number ?? '—', event: q.event, rating: q.quality_rating, tier: q.messaging_limit_tier })),
    broadcasts: broadcastRows.map((b) => ({
      id: b.id,
      name: b.name,
      startedAt: b.started_at,
      sent: b.sent_count,
      delivered: b.delivered_count,
      read: b.read_count,
      replied: b.replied_count,
      failed: b.failed_count,
    })),
  };
}
