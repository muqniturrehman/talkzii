import 'server-only';
import { planLimit, sanitizeSearchTerm, type ContactListQuery, type PlanId } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { unwrap } from '@/lib/api/handler';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { LabelItem } from '@/lib/inbox/types';
import type { ContactDetail, ContactListItem, ContactPage } from './types';

const LIST_COLUMNS = 'id, name, profile_name, wa_id, email, opted_out, source, created_at, last_inbound_at';

type LabelLink = { label: LabelItem | null };
const flattenLabels = (links: LabelLink[] | null | undefined): LabelItem[] =>
  (links ?? []).flatMap((l) => (l.label ? [l.label] : [])).sort((a, b) => a.name.localeCompare(b.name));

export async function workspaceCountryCode(db: TypedSupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await db.from('workspaces').select('default_country_code').eq('id', workspaceId).maybeSingle();
  return data?.default_country_code ?? '92';
}

export async function contactCount(db: TypedSupabaseClient, workspaceId: string): Promise<number> {
  const { count } = await db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
  return count ?? 0;
}

/** Remaining contacts allowed by the plan (Infinity on unlimited plans). */
export async function contactCapacity(db: TypedSupabaseClient, workspace: { id: string; plan: PlanId }): Promise<number> {
  const limit = planLimit(workspace.plan, 'contacts');
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - (await contactCount(db, workspace.id)));
}

export function planLimitError(plan: PlanId): ApiError {
  const limit = planLimit(plan, 'contacts');
  return new ApiError(403, 'PLAN_LIMIT', `Your plan includes up to ${limit.toLocaleString()} contacts. Upgrade to add more.`, {
    limit: 'contacts',
  });
}

export async function listContacts(supabase: TypedSupabaseClient, query: ContactListQuery): Promise<ContactPage> {
  const select = query.labelId
    ? `${LIST_COLUMNS}, labels:contact_labels(label:labels(id, name, color)), label_filter:contact_labels!inner(label_id)`
    : `${LIST_COLUMNS}, labels:contact_labels(label:labels(id, name, color))`;

  let q = supabase.from('contacts').select(select, { count: 'exact' });
  if (query.labelId) q = q.eq('label_filter.label_id', query.labelId);
  if (query.optedOut) q = q.eq('opted_out', query.optedOut === 'true');
  if (query.source) q = q.eq('source', query.source);

  const term = query.q ? sanitizeSearchTerm(query.q) : '';
  if (term) {
    const digits = term.replace(/\D/g, '');
    const parts = [`name.ilike.*${term}*`, `profile_name.ilike.*${term}*`, `email.ilike.*${term}*`];
    if (digits.length >= 3) parts.push(`wa_id.like.*${digits}*`);
    q = q.or(parts.join(','));
  }

  switch (query.sort) {
    case 'created_asc':
      q = q.order('created_at', { ascending: true });
      break;
    case 'name_asc':
      q = q.order('name', { ascending: true, nullsFirst: false });
      break;
    case 'last_inbound_desc':
      q = q.order('last_inbound_at', { ascending: false, nullsFirst: false });
      break;
    default:
      q = q.order('created_at', { ascending: false });
  }
  q = q.order('id').range(query.offset, query.offset + query.limit - 1);

  const { data, error, count } = await q;
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  const rows = (data ?? []) as unknown as (Omit<ContactListItem, 'labels'> & { labels: LabelLink[]; label_filter?: unknown })[];
  return {
    items: rows.map(({ labels, label_filter: _ignored, ...row }) => ({ ...row, labels: flattenLabels(labels) })),
    total: count ?? rows.length,
  };
}

export async function getContactDetail(supabase: TypedSupabaseClient, id: string): Promise<ContactDetail> {
  const { data, error } = await supabase
    .from('contacts')
    .select(
      `${LIST_COLUMNS}, avatar_url, locale, custom_fields, opted_out_at, opt_out_reason, updated_at,
       labels:contact_labels(label:labels(id, name, color)),
       conversations(id, status, last_message_at, last_message_preview, unread_count)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw ApiError.notFound('Contact not found.');

  const count = async (direction: 'inbound' | 'outbound') => {
    const { count: n } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('contact_id', id).eq('direction', direction);
    return n ?? 0;
  };
  const [inbound, outbound] = await Promise.all([count('inbound'), count('outbound')]);

  const { labels, conversations, ...rest } = data as unknown as Omit<ContactDetail, 'labels' | 'stats'> & { labels: LabelLink[] };
  return {
    ...rest,
    labels: flattenLabels(labels),
    conversations: [...conversations].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')),
    stats: { inbound, outbound },
  };
}

export async function contactLabels(supabase: TypedSupabaseClient, contactId: string): Promise<LabelItem[]> {
  const rows = unwrap(await supabase.from('contact_labels').select('label:labels(id, name, color)').eq('contact_id', contactId));
  return flattenLabels(rows);
}
