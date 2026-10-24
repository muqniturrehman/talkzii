import 'server-only';
import { sanitizeSearchTerm, type ConversationListQuery } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { unwrap } from '@/lib/api/handler';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type {
  CannedReplyItem,
  ConversationDetail,
  ConversationListItem,
  ConversationPage,
  InboxCounts,
  LabelItem,
  MemberItem,
  MessageItem,
  MessagePage,
  NoteItem,
} from './types';

const LIST_COLUMNS =
  'id, status, assigned_to, unread_count, last_message_at, last_message_preview, last_message_direction, expires_at, snoozed_until, bot_paused, awaiting_reply_since, phone_number_id, created_at';
const CONTACT_COLUMNS = 'id, name, profile_name, wa_id, avatar_url, opted_out';

export const MESSAGE_COLUMNS =
  'id, conversation_id, direction, type, status, body, content, media, sender_type, sender_id, wamid, reply_to_wamid, template_id, client_message_id, error_code, error_message, created_at, sent_at, delivered_at, read_at';

type LabelLink = { label: LabelItem | null };
const flattenLabels = (links: LabelLink[] | null | undefined): LabelItem[] =>
  (links ?? []).flatMap((l) => (l.label ? [l.label] : [])).sort((a, b) => a.name.localeCompare(b.name));

/** Inbox list with filters + keyset pagination on last_message_at. RLS applies. */
export async function listConversations(
  supabase: TypedSupabaseClient,
  userId: string,
  filters: ConversationListQuery,
): Promise<ConversationPage> {
  const select = filters.labelId
    ? `${LIST_COLUMNS}, contact:contacts!inner(${CONTACT_COLUMNS}), labels:conversation_labels(label:labels(id, name, color)), label_filter:conversation_labels!inner(label_id)`
    : `${LIST_COLUMNS}, contact:contacts!inner(${CONTACT_COLUMNS}), labels:conversation_labels(label:labels(id, name, color))`;

  let query = supabase
    .from('conversations')
    .select(select)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(filters.limit + 1);

  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.assignee === 'me') query = query.eq('assigned_to', userId);
  else if (filters.assignee === 'unassigned') query = query.is('assigned_to', null);
  else if (filters.assignee !== 'all') query = query.eq('assigned_to', filters.assignee);
  if (filters.labelId) query = query.eq('label_filter.label_id', filters.labelId);
  if (filters.phoneNumberId) query = query.eq('phone_number_id', filters.phoneNumberId);
  if (filters.unread === 'true') query = query.gt('unread_count', 0);
  if (filters.cursor) query = query.lt('last_message_at', filters.cursor);

  const term = filters.q ? sanitizeSearchTerm(filters.q) : '';
  if (term) {
    const digits = term.replace(/\D/g, '');
    const parts = [`name.ilike.*${term}*`, `profile_name.ilike.*${term}*`];
    if (digits.length >= 3) parts.push(`wa_id.like.*${digits}*`);
    query = query.or(parts.join(','), { referencedTable: 'contacts' });
  }

  const rows = unwrap(await query) as unknown as (Omit<ConversationListItem, 'labels'> & { labels: LabelLink[] })[];
  const page = rows.slice(0, filters.limit).map(({ labels, ...rest }) => {
    const { label_filter: _ignored, ...row } = rest as typeof rest & { label_filter?: unknown };
    return { ...row, labels: flattenLabels(labels) } as ConversationListItem;
  });
  const last = page.at(-1);
  return { items: page, nextCursor: rows.length > filters.limit && last?.last_message_at ? last.last_message_at : null };
}

export async function getConversationDetail(supabase: TypedSupabaseClient, id: string): Promise<ConversationDetail> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `${LIST_COLUMNS}, category, csat_score, first_response_at, resolved_at,
       contact:contacts!inner(${CONTACT_COLUMNS}, email, phone, locale, custom_fields, created_at, opted_out_at, contact_labels(label:labels(id, name, color))),
       labels:conversation_labels(label:labels(id, name, color)),
       phone_number:phone_numbers(id, display_phone_number, verified_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw ApiError.notFound('Conversation not found.');

  const { labels, contact, ...rest } = data as unknown as Omit<ConversationDetail, 'labels' | 'contact'> & {
    labels: LabelLink[];
    contact: Omit<ConversationDetail['contact'], 'contact_labels'> & { contact_labels: LabelLink[] };
  };
  return {
    ...rest,
    labels: flattenLabels(labels),
    contact: { ...contact, contact_labels: flattenLabels(contact.contact_labels) },
  };
}

export async function listMessages(
  supabase: TypedSupabaseClient,
  conversationId: string,
  options: { before?: string; limit: number },
): Promise<MessagePage> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(options.limit + 1);
  if (options.before) query = query.lt('created_at', options.before);
  const rows = unwrap(await query) as MessageItem[];
  return { items: rows.slice(0, options.limit).reverse(), hasMore: rows.length > options.limit };
}

export async function listNotes(supabase: TypedSupabaseClient, conversationId: string): Promise<NoteItem[]> {
  const rows = unwrap(
    await supabase
      .from('internal_notes')
      .select('id, conversation_id, body, mentions, author_id, created_at, author:profiles(full_name, email, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(200),
  );
  return rows as NoteItem[];
}

export async function listLabels(supabase: TypedSupabaseClient): Promise<(LabelItem & { description: string | null })[]> {
  return unwrap(await supabase.from('labels').select('id, name, color, description').order('name'));
}

export async function listCannedReplies(supabase: TypedSupabaseClient): Promise<CannedReplyItem[]> {
  return unwrap(await supabase.from('canned_replies').select('id, shortcut, title, body').order('shortcut'));
}

export async function listMembers(supabase: TypedSupabaseClient, workspaceId: string): Promise<MemberItem[]> {
  const rows = unwrap(
    await supabase
      .from('workspace_members')
      .select('user_id, role, profile:profiles!workspace_members_user_id_fkey(full_name, email, avatar_url)')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
  );
  return rows.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    full_name: m.profile?.full_name ?? null,
    email: m.profile?.email ?? null,
    avatar_url: m.profile?.avatar_url ?? null,
  }));
}

export async function inboxCounts(supabase: TypedSupabaseClient, userId: string): Promise<InboxCounts> {
  const base = () => supabase.from('conversations').select('id', { count: 'exact', head: true });
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await build(base())).count ?? 0;

  const [open, pending, snoozed, resolved, mine, unassigned, unread] = await Promise.all([
    count((q) => q.eq('status', 'open')),
    count((q) => q.eq('status', 'pending')),
    count((q) => q.eq('status', 'snoozed')),
    count((q) => q.eq('status', 'resolved')),
    count((q) => q.eq('assigned_to', userId).neq('status', 'resolved')),
    count((q) => q.is('assigned_to', null).neq('status', 'resolved')),
    count((q) => q.gt('unread_count', 0).neq('status', 'resolved')),
  ]);
  return { open, pending, snoozed, resolved, mine, unassigned, unread };
}
