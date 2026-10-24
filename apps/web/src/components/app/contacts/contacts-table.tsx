'use client';

import * as React from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BellOff, BellRing, Search, Tag, Trash2, Users, X } from 'lucide-react';
import { formatPhone } from '@talkzi/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@talkzi/ui/alert-dialog';
import { Badge } from '@talkzi/ui/badge';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { Checkbox } from '@talkzi/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@talkzi/ui/dropdown-menu';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { useLabels } from '@/components/app/inbox/use-inbox';
import { useDebounced } from '@/hooks/use-debounced';
import { apiFetch } from '@/lib/api/client';
import type { ContactListItem, ContactPage } from '@/lib/contacts/types';
import { timeAgo } from '@/lib/format';

const PAGE_SIZE = 100;
const ROW_HEIGHT = 60;

interface Filters {
  q: string;
  labelId?: string;
  optedOut?: 'true' | 'false';
  sort: 'created_desc' | 'created_asc' | 'name_asc' | 'last_inbound_desc';
}

export const contactsKey = ['contacts', 'list'] as const;

function buildQuery(filters: Filters, offset: number) {
  const params = new URLSearchParams({ sort: filters.sort, offset: String(offset), limit: String(PAGE_SIZE) });
  if (filters.q) params.set('q', filters.q);
  if (filters.labelId) params.set('labelId', filters.labelId);
  if (filters.optedOut) params.set('optedOut', filters.optedOut);
  return params.toString();
}

const contactName = (c: Pick<ContactListItem, 'name' | 'profile_name' | 'wa_id'>) => c.name ?? c.profile_name ?? formatPhone(c.wa_id);

function Row({
  contact,
  selected,
  onToggle,
  style,
  index,
}: {
  contact: ContactListItem;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  style: React.CSSProperties;
  index: number;
}) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      style={style}
      className={cn(
        'absolute left-0 top-0 grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 text-sm md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_7rem_7rem]',
        selected ? 'bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <div role="cell">
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(v === true)} aria-label={`Select ${contactName(contact)}`} />
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <UserAvatar name={contactName(contact)} className="size-9 shrink-0" />
        <div className="min-w-0">
          <Link href={`/app/contacts/${contact.id}`} className="block truncate font-medium hover:text-primary hover:underline">
            {contactName(contact)}
          </Link>
          <span className="block truncate text-xs text-muted-foreground md:hidden">{formatPhone(contact.wa_id)}</span>
          {contact.email ? <span className="hidden truncate text-xs text-muted-foreground md:block">{contact.email}</span> : null}
        </div>
      </div>
      <div role="cell" className="hidden truncate text-muted-foreground md:block">
        {formatPhone(contact.wa_id)}
      </div>
      <div role="cell" className="hidden min-w-0 flex-wrap gap-1 overflow-hidden md:flex">
        {contact.labels.slice(0, 3).map((label) => (
          <span key={label.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
            {label.name}
          </span>
        ))}
        {contact.labels.length > 3 ? <span className="text-[11px] text-muted-foreground">+{contact.labels.length - 3}</span> : null}
      </div>
      <div role="cell" className="flex justify-end md:justify-start">
        {contact.opted_out ? <Badge variant="danger">Opted out</Badge> : <Badge variant="secondary">{contact.source}</Badge>}
      </div>
      <div role="cell" className="hidden text-xs text-muted-foreground md:block">
        {contact.last_inbound_at ? timeAgo(contact.last_inbound_at) : '—'}
      </div>
    </div>
  );
}

export function ContactsTable() {
  const { can } = useApp();
  const qc = useQueryClient();
  const labels = useLabels();
  const [filters, setFilters] = React.useState<Filters>({ q: '', sort: 'created_desc' });
  const q = useDebounced(filters.q.trim(), 300);
  const effective = React.useMemo(() => ({ ...filters, q }), [filters, q]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const query = useInfiniteQuery({
    queryKey: [...contactsKey, effective],
    queryFn: ({ pageParam, signal }) => apiFetch<ContactPage>(`/api/contacts?${buildQuery(effective, pageParam)}`, { signal }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
  const rows = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const parentRef = React.useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable functions by design
  const virtualizer = useVirtualizer({
    count: hasNextPage ? rows.length + 1 : rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  React.useEffect(() => {
    if (lastIndex >= rows.length - 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const bulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<{ affected: number }>('/api/contacts/bulk', { body }),
    onSuccess: ({ affected }) => {
      toast.success(`Updated ${affected} contact${affected === 1 ? '' : 's'}.`);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: contactsKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Bulk action failed'),
  });

  const ids = [...selected];
  const allLoadedSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search name, phone or email"
            aria-label="Search contacts"
            className="pl-9"
          />
        </div>
        <Select value={filters.labelId ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, labelId: v === 'all' ? undefined : v }))}>
          <SelectTrigger className="w-40" aria-label="Filter by label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All labels</SelectItem>
            {(labels.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.optedOut ?? 'all'}
          onValueChange={(v) => setFilters((f) => ({ ...f, optedOut: v === 'all' ? undefined : (v as 'true' | 'false') }))}
        >
          <SelectTrigger className="w-36" aria-label="Filter by subscription">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="false">Subscribed</SelectItem>
            <SelectItem value="true">Opted out</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as Filters['sort'] }))}>
          <SelectTrigger className="w-40" aria-label="Sort contacts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">Newest first</SelectItem>
            <SelectItem value="created_asc">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="last_inbound_desc">Recently active</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 ? (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 px-3 py-2 text-sm" role="toolbar" aria-label="Bulk actions">
          <span className="font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!can('agent')}>
                <Tag /> Label
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuLabel>Add label</DropdownMenuLabel>
              {(labels.data ?? []).map((l) => (
                <DropdownMenuItem key={`add-${l.id}`} onSelect={() => bulk.mutate({ action: 'add_label', ids, labelId: l.id })}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden /> {l.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuLabel>Remove label</DropdownMenuLabel>
              {(labels.data ?? []).map((l) => (
                <DropdownMenuItem key={`rm-${l.id}`} onSelect={() => bulk.mutate({ action: 'remove_label', ids, labelId: l.id })}>
                  <X className="size-3" /> {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" disabled={!can('agent')} onClick={() => bulk.mutate({ action: 'opt_out', ids })}>
            <BellOff /> Opt out
          </Button>
          <Button size="sm" variant="outline" disabled={!can('agent')} onClick={() => bulk.mutate({ action: 'opt_in', ids })}>
            <BellRing /> Opt in
          </Button>
          {can('admin') ? (
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div role="table" aria-label="Contacts" aria-rowcount={total + 1} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div role="rowgroup">
          <div
            role="row"
            aria-rowindex={1}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_7rem_7rem]"
          >
            <div role="columnheader">
              <Checkbox
                checked={allLoadedSelected}
                onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                aria-label="Select all loaded contacts"
              />
            </div>
            <div role="columnheader">Contact · {total.toLocaleString()}</div>
            <div role="columnheader" className="hidden md:block">
              Phone
            </div>
            <div role="columnheader" className="hidden md:block">
              Labels
            </div>
            <div role="columnheader" className="text-right md:text-left">
              Status
            </div>
            <div role="columnheader" className="hidden md:block">
              Last message
            </div>
          </div>
        </div>

        <div ref={parentRef} role="rowgroup" className="relative min-h-[20rem] flex-1 overflow-y-auto scrollbar-thin">
          {query.isPending ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              className="m-4 border-none"
              icon={<Users />}
              title={effective.q || effective.labelId || effective.optedOut ? 'No contacts match' : 'No contacts yet'}
              description="Contacts are created automatically when customers message you, or import them from a CSV."
              action={
                can('admin') ? (
                  <Button asChild>
                    <Link href="/app/contacts/import">Import CSV</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ height: virtualizer.getTotalSize() }} className="relative w-full">
              {items.map((item) => {
                const contact = rows[item.index];
                if (!contact) {
                  return (
                    <div key="loader" className="absolute left-0 top-0 flex w-full items-center justify-center text-xs text-muted-foreground" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
                      Loading more…
                    </div>
                  );
                }
                return (
                  <Row
                    key={contact.id}
                    index={item.index}
                    contact={contact}
                    selected={selected.has(contact.id)}
                    onToggle={(checked) => toggle(contact.id, checked)}
                    style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} contact{selected.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>Their conversations, messages and notes are deleted too. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => bulk.mutate({ action: 'delete', ids })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
