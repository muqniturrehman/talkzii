'use client';

import * as React from 'react';
import { Bot, Clock, Inbox, Search } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { cn } from '@talkzi/ui/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Skeleton } from '@talkzi/ui/skeleton';
import { Switch } from '@talkzi/ui/switch';
import { Label } from '@talkzi/ui/label';
import { isSessionOpen } from '@/lib/inbox/session';
import type { ConversationListItem } from '@/lib/inbox/types';
import { useConversations, useInboxCounts, useLabels, useMembers, type InboxFilters } from './use-inbox';

const STATUS_TABS: { value: InboxFilters['status']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'resolved', label: 'Resolved' },
];

export function contactDisplayName(contact: { name: string | null; profile_name: string | null; wa_id: string }) {
  return contact.name ?? contact.profile_name ?? `+${contact.wa_id}`;
}

function shortTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const name = contactDisplayName(conversation.contact);
  const unread = conversation.unread_count > 0;
  const expired = !isSessionOpen(conversation.expires_at);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-conversation-id={conversation.id}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-primary/10' : 'hover:bg-muted/60',
        )}
      >
        <UserAvatar name={name} src={conversation.contact.avatar_url} className="size-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>{name}</span>
            <span className={cn('shrink-0 text-[11px]', unread ? 'font-medium text-primary dark:text-accent' : 'text-muted-foreground')}>
              {shortTime(conversation.last_message_at)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('line-clamp-1 flex-1 text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>
              {conversation.last_message_direction === 'outbound' ? 'You: ' : ''}
              {conversation.last_message_preview ?? 'No messages yet'}
            </span>
            {unread ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {expired ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title="24-hour window closed">
                <Clock className="size-3" /> Template only
              </span>
            ) : null}
            {!conversation.bot_paused ? null : (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title="Chatbot paused">
                <Bot className="size-3" /> Paused
              </span>
            )}
            {conversation.labels.slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 text-[10px]"
                title={label.name}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                {label.name}
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ConversationList({
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  className,
}: {
  filters: InboxFilters;
  onFiltersChange: (filters: InboxFilters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const [search, setSearch] = React.useState(filters.q ?? '');
  const debouncedSearch = useDebounced(search, 300);
  const effective = React.useMemo(() => ({ ...filters, q: debouncedSearch.trim() || undefined }), [filters, debouncedSearch]);

  const query = useConversations(effective);
  const counts = useInboxCounts();
  const labels = useLabels();
  const members = useMembers();
  const items = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const listRef = React.useRef<HTMLUListElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // j/k or arrow keys move through the list.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key)) return;
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    event.preventDefault();
    const index = items.findIndex((c) => c.id === selectedId);
    const next = event.key === 'ArrowDown' || event.key === 'j' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    const target = items[next];
    if (target) {
      onSelect(target.id);
      listRef.current?.querySelector<HTMLButtonElement>(`[data-conversation-id="${target.id}"]`)?.focus();
    }
  };

  const countFor = (status: InboxFilters['status']) => (status === 'all' ? undefined : counts.data?.[status]);

  return (
    <aside className={cn('flex min-h-0 flex-col bg-background', className)} aria-label="Conversations">
      <div className="space-y-3 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or number"
            aria-label="Search conversations"
            className="pl-9"
          />
        </div>
        <div role="tablist" aria-label="Status" className="flex gap-1 overflow-x-auto scrollbar-thin">
          {STATUS_TABS.map((tab) => {
            const active = filters.status === tab.value;
            const count = countFor(tab.value);
            return (
              <button
                key={tab.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onFiltersChange({ ...filters, status: tab.value })}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {tab.label}
                {count ? <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/20' : 'bg-muted')}>{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filters.assignee} onValueChange={(assignee) => onFiltersChange({ ...filters, assignee })}>
            <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="me">Assigned to me{counts.data ? ` (${counts.data.mine})` : ''}</SelectItem>
              <SelectItem value="unassigned">Unassigned{counts.data ? ` (${counts.data.unassigned})` : ''}</SelectItem>
              {(members.data ?? []).map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email ?? 'Member'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.labelId ?? 'any'}
            onValueChange={(value) => onFiltersChange({ ...filters, labelId: value === 'any' ? undefined : value })}
          >
            <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All labels</SelectItem>
              {(labels.data ?? []).map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  {label.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="unread-only" className="text-xs text-muted-foreground">
            Unread only
          </Label>
          <Switch id="unread-only" checked={Boolean(filters.unread)} onCheckedChange={(unread) => onFiltersChange({ ...filters, unread })} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin" onKeyDown={onKeyDown}>
        {query.isPending ? (
          <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading conversations">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Could not load conversations.{' '}
            <Button variant="link" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            className="m-2 border-none"
            icon={<Inbox />}
            title={effective.q ? 'No matches' : 'All caught up'}
            description={effective.q ? 'Try a different name or number.' : 'New WhatsApp conversations will appear here in real time.'}
          />
        ) : (
          <ul ref={listRef} className="space-y-0.5">
            {items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selectedId}
                onSelect={() => onSelect(conversation.id)}
              />
            ))}
          </ul>
        )}
        <div ref={sentinelRef} className="h-4" aria-hidden />
        {isFetchingNextPage ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            <Badge variant="secondary">Loading more…</Badge>
          </p>
        ) : null}
      </div>
    </aside>
  );
}
