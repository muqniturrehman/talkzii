'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Progress } from '@talkzi/ui/progress';
import { Skeleton } from '@talkzi/ui/skeleton';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import { BROADCAST_STATUS_VARIANT, pct, type BroadcastListItem } from './types';

export const broadcastsKey = ['broadcasts', 'list'] as const;

export function BroadcastsList({ canCreate }: { canCreate: boolean }) {
  const { can } = useApp();
  const broadcasts = useQuery({
    queryKey: broadcastsKey,
    queryFn: () => apiFetch<BroadcastListItem[]>('/api/broadcasts'),
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'sending' || b.status === 'scheduled') ? 10_000 : false),
  });

  if (broadcasts.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }
  const items = broadcasts.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="No broadcasts yet"
        description="Send an approved template to thousands of subscribed contacts — with personalisation, scheduling and live delivery stats."
        action={
          canCreate && can('admin') ? (
            <Button asChild>
              <Link href="/app/broadcasts/new">
                <Plus /> New broadcast
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((b) => {
        const sendable = Math.max(b.total_recipients - b.skipped_count, 0);
        const processed = b.sent_count + b.failed_count;
        return (
          <li key={b.id}>
            <Link
              href={`/app/broadcasts/${b.id}`}
              className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.template_name ?? 'No template'} ·{' '}
                    {b.status === 'scheduled' && b.scheduled_at
                      ? `scheduled for ${new Date(b.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                      : `created ${timeAgo(b.created_at)}`}
                  </p>
                </div>
                <Badge variant={BROADCAST_STATUS_VARIANT[b.status]}>{b.status}</Badge>
              </div>
              {b.status !== 'draft' ? (
                <div className="mt-3 space-y-2">
                  <Progress value={pct(processed, sendable)} aria-label={`${pct(processed, sendable)}% processed`} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{sendable.toLocaleString()} recipients</span>
                    <span>{b.sent_count.toLocaleString()} sent</span>
                    <span>{pct(b.delivered_count, b.sent_count)}% delivered</span>
                    <span>{pct(b.read_count, b.sent_count)}% read</span>
                    <span>{pct(b.replied_count, b.sent_count)}% replied</span>
                    {b.failed_count ? <span className="text-danger">{b.failed_count.toLocaleString()} failed</span> : null}
                  </div>
                </div>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
