'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { SendMessageInput, UpdateConversationInput } from '@talkzi/shared';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch, ApiClientError } from '@/lib/api/client';
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
  TemplateOption,
} from '@/lib/inbox/types';

export interface InboxFilters {
  status: 'open' | 'pending' | 'snoozed' | 'resolved' | 'all';
  assignee: string;
  labelId?: string;
  q?: string;
  unread?: boolean;
}

export const inboxKeys = {
  all: ['inbox'] as const,
  lists: () => ['inbox', 'list'] as const,
  list: (filters: InboxFilters) => ['inbox', 'list', filters] as const,
  counts: () => ['inbox', 'counts'] as const,
  conversation: (id: string) => ['inbox', 'conversation', id] as const,
  messages: (id: string) => ['inbox', 'messages', id] as const,
  notes: (id: string) => ['inbox', 'notes', id] as const,
};
export const labelsKey = ['labels'] as const;
export const membersKey = ['members'] as const;
export const cannedKey = ['canned-replies'] as const;
export const approvedTemplatesKey = ['templates', 'approved'] as const;

type MessagesData = InfiniteData<MessagePage, string | null>;

function listQuery(filters: InboxFilters, cursor: string | null): string {
  const params = new URLSearchParams({ status: filters.status, assignee: filters.assignee });
  if (filters.labelId) params.set('labelId', filters.labelId);
  if (filters.q) params.set('q', filters.q);
  if (filters.unread) params.set('unread', 'true');
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function useConversations(filters: InboxFilters) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(filters),
    queryFn: ({ pageParam, signal }) => apiFetch<ConversationPage>(`/api/conversations?${listQuery(filters, pageParam)}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
}

export function useInboxCounts() {
  return useQuery({ queryKey: inboxKeys.counts(), queryFn: ({ signal }) => apiFetch<InboxCounts>('/api/conversations/counts', { signal }) });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: inboxKeys.conversation(id),
    queryFn: ({ signal }) => apiFetch<ConversationDetail>(`/api/conversations/${id}`, { signal }),
  });
}

export function useMessages(id: string) {
  return useInfiniteQuery({
    queryKey: inboxKeys.messages(id),
    queryFn: ({ pageParam, signal }) =>
      apiFetch<MessagePage>(`/api/conversations/${id}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: () => undefined,
    getPreviousPageParam: (first) => (first.hasMore ? (first.items[0]?.created_at ?? undefined) : undefined),
    staleTime: 60_000,
  });
}

export function useNotes(id: string) {
  return useQuery({ queryKey: inboxKeys.notes(id), queryFn: ({ signal }) => apiFetch<NoteItem[]>(`/api/conversations/${id}/notes`, { signal }) });
}

export function useLabels() {
  return useQuery({
    queryKey: labelsKey,
    queryFn: ({ signal }) => apiFetch<(LabelItem & { description: string | null })[]>('/api/labels', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  return useQuery({ queryKey: membersKey, queryFn: ({ signal }) => apiFetch<MemberItem[]>('/api/team/members', { signal }), staleTime: 5 * 60_000 });
}

export function useCannedReplies() {
  return useQuery({ queryKey: cannedKey, queryFn: ({ signal }) => apiFetch<CannedReplyItem[]>('/api/canned-replies', { signal }), staleTime: 5 * 60_000 });
}

export function useApprovedTemplates(enabled: boolean) {
  return useQuery({
    queryKey: approvedTemplatesKey,
    queryFn: ({ signal }) => apiFetch<TemplateOption[]>('/api/templates?status=APPROVED', { signal }),
    enabled,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Cache helpers (shared with the realtime hook)
// ---------------------------------------------------------------------------

const byCreatedAt = (a: MessageItem, b: MessageItem) => a.created_at.localeCompare(b.created_at);

/** Inserts or replaces a message (matching id, or the optimistic copy by client_message_id). */
export function upsertMessage(qc: QueryClient, message: MessageItem) {
  qc.setQueryData<MessagesData>(inboxKeys.messages(message.conversation_id), (data) => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((page) => ({
      ...page,
      items: page.items
        .filter(
          (m) =>
            !(m.id.startsWith('temp-') && message.client_message_id && m.client_message_id === message.client_message_id && m.id !== message.id),
        )
        .map((m) => {
          if (m.id !== message.id) return m;
          found = true;
          return { ...m, ...message };
        }),
    }));
    if (!found && pages.length > 0) {
      const last = pages[pages.length - 1]!;
      pages[pages.length - 1] = { ...last, items: [...last.items, message].sort(byCreatedAt) };
    }
    return { ...data, pages };
  });
}

export function removeMessage(qc: QueryClient, conversationId: string, id: string) {
  qc.setQueryData<MessagesData>(inboxKeys.messages(conversationId), (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((m) => m.id !== id) })) } : data,
  );
}

/** Merges scalar conversation fields into the cached detail and list rows. */
export function patchConversation(qc: QueryClient, id: string, patch: Partial<ConversationListItem>) {
  const scalar = Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'contact' && k !== 'labels')) as Partial<
    Omit<ConversationListItem, 'contact' | 'labels'>
  >;
  qc.setQueryData<ConversationDetail>(inboxKeys.conversation(id), (old) => (old ? { ...old, ...scalar } : old));
  qc.setQueriesData<InfiniteData<ConversationPage, string | null>>({ queryKey: inboxKeys.lists() }, (data) =>
    data
      ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === id ? { ...c, ...scalar } : c)) })) }
      : data,
  );
}

export function newClientMessageId(): string {
  return `web-${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface SentMessage {
  id: string;
  conversationId: string;
  wamid: string | null;
  status: string;
  duplicate: boolean;
}

export function useSendMessage(conversation: Pick<ConversationDetail, 'id'>, senderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => apiFetch<SentMessage>('/api/messages/send', { body: input }),
    onMutate: (input) => {
      const clientMessageId = input.clientMessageId ?? newClientMessageId();
      const optimistic: MessageItem = {
        id: `temp-${clientMessageId}`,
        conversation_id: conversation.id,
        direction: 'outbound',
        type: input.type === 'interactive_buttons' ? 'interactive' : input.type,
        status: 'queued',
        body: input.type === 'text' ? input.text : input.type === 'template' ? 'Sending template…' : 'caption' in input ? (input.caption ?? null) : null,
        content: {},
        media: null,
        sender_type: 'agent',
        sender_id: senderId,
        wamid: null,
        reply_to_wamid: null,
        template_id: input.type === 'template' ? input.templateId : null,
        client_message_id: clientMessageId,
        error_code: null,
        error_message: null,
        created_at: new Date().toISOString(),
        sent_at: null,
        delivered_at: null,
        read_at: null,
      };
      upsertMessage(qc, optimistic);
      return { optimistic };
    },
    onSuccess: (result, _input, ctx) => {
      if (!ctx) return;
      upsertMessage(qc, { ...ctx.optimistic, id: result.id, wamid: result.wamid, status: result.status as MessageItem['status'] });
      void qc.invalidateQueries({ queryKey: inboxKeys.messages(conversation.id) });
    },
    onError: (error, _input, ctx) => {
      if (ctx) removeMessage(qc, conversation.id, ctx.optimistic.id);
      if (error instanceof ApiClientError && error.code === 'SESSION_WINDOW_CLOSED') {
        toast.error('The 24-hour window has closed', { description: 'Send an approved template to restart the conversation.' });
        void qc.invalidateQueries({ queryKey: inboxKeys.conversation(conversation.id) });
      } else {
        toast.error(error instanceof Error ? error.message : 'Message not sent');
      }
      void qc.invalidateQueries({ queryKey: inboxKeys.messages(conversation.id) });
    },
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConversationInput) =>
      apiFetch<Partial<ConversationListItem>>(`/api/conversations/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (row) => {
      patchConversation(qc, id, row);
      void qc.invalidateQueries({ queryKey: inboxKeys.lists() });
      void qc.invalidateQueries({ queryKey: inboxKeys.counts() });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update the conversation'),
  });
}

export function useMarkRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/api/conversations/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      patchConversation(qc, id, { unread_count: 0 });
      void qc.invalidateQueries({ queryKey: inboxKeys.counts() });
    },
  });
}

export function useConversationLabel(id: string) {
  const qc = useQueryClient();
  const onSuccess = (labels: LabelItem[]) => {
    qc.setQueryData<ConversationDetail>(inboxKeys.conversation(id), (old) => (old ? { ...old, labels } : old));
    void qc.invalidateQueries({ queryKey: inboxKeys.lists() });
  };
  const onError = (error: Error) => toast.error(error.message);
  const add = useMutation({
    mutationFn: (labelId: string) => apiFetch<LabelItem[]>(`/api/conversations/${id}/labels`, { body: { labelId } }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (labelId: string) => apiFetch<LabelItem[]>(`/api/conversations/${id}/labels?labelId=${labelId}`, { method: 'DELETE' }),
    onSuccess,
    onError,
  });
  return { add, remove };
}

export function useAddNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiFetch<NoteItem>(`/api/conversations/${id}/notes`, { body: { body } }),
    onSuccess: (note) => qc.setQueryData<NoteItem[]>(inboxKeys.notes(id), (old) => (old?.some((n) => n.id === note.id) ? old : [...(old ?? []), note])),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not add the note'),
  });
}

export function useDeleteNote(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => apiFetch<{ id: string }>(`/api/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: ({ id }) => qc.setQueryData<NoteItem[]>(inboxKeys.notes(conversationId), (old) => old?.filter((n) => n.id !== id)),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not delete the note'),
  });
}
