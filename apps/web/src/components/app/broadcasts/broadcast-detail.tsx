'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { formatPhone, USD_TO_PKR } from '@talkzi/shared';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Progress } from '@talkzi/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Skeleton } from '@talkzi/ui/skeleton';
import { StatCard } from '@talkzi/ui/stat-card';
import { toast } from '@talkzi/ui/sonner';
import { useApp } from '@/components/providers/app-providers';
import { TemplatePreview } from '@/components/app/templates/template-preview';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import { broadcastsKey } from './broadcasts-list';
import { BROADCAST_STATUS_VARIANT, pct, type BroadcastListItem } from './types';

interface BroadcastDetailData extends BroadcastListItem {
  template: { id: string; name: string; category: string; status: string; components: unknown } | null;
  phone: { display_phone_number: string; verified_name: string | null; quality_rating: string | null; messaging_limit_tier: string | null } | null;
}

interface RecipientItem {
  id: string;
  wa_id: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  contact: { id: string; name: string | null; profile_name: string | null } | null;
}

const RECIPIENT_VARIANT: Record<string, 'secondary' | 'info' | 'success' | 'danger' | 'warning'> = {
  pending: 'secondary',
  sending: 'info',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
  skipped: 'warning',
};

export function BroadcastDetail({ id }: { id: string }) {
  const { can, workspace } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<string>('all');
  const [page, setPage] = React.useState(0);

  const detail = useQuery({
    queryKey: ['broadcasts', 'detail', id],
    queryFn: () => apiFetch<BroadcastDetailData>(`/api/broadcasts/${id}`),
    refetchInterval: (q) => (q.state.data && ['sending', 'scheduled'].includes(q.state.data.status) ? 5_000 : false),
  });
  const live = detail.data && ['sending', 'scheduled'].includes(detail.data.status);
  const recipients = useQuery({
    queryKey: ['broadcasts', 'recipients', id, status, page],
    queryFn: () =>
      apiFetch<{ items: RecipientItem[]; total: number }>(`/api/broadcasts/${id}/recipients?offset=${page * 50}&limit=50${status === 'all' ? '' : `&status=${status}`}`),
    refetchInterval: live ? 10_000 : false,
  });

  const action = useMutation({
    mutationFn: (a: 'pause' | 'resume' | 'cancel') => apiFetch(`/api/broadcasts/${id}/action`, { body: { action: a } }),
    onSuccess: (_d, a) => {
      toast.success(a === 'pause' ? 'Broadcast paused.' : a === 'resume' ? 'Broadcast resumed.' : 'Broadcast cancelled.');
      void qc.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/broadcasts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: broadcastsKey });
      router.push('/app/broadcasts');
    },
    onError: (error) => toast.error(error.message),
  });

  if (detail.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!detail.data) return <p className="text-sm text-muted-foreground">Broadcast not found.</p>;
  const b = detail.data;
  const sendable = Math.max(b.total_recipients - b.skipped_count, 0);
  const processed = b.sent_count + b.failed_count;
  const totalPages = Math.max(1, Math.ceil((recipients.data?.total ?? 0) / 50));

  return (
    <div className="space-y-6">
      <Link href="/app/broadcasts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Broadcasts
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{b.name}</h1>
          <p className="text-sm text-muted-foreground">
            {b.template_name} · from {b.phone ? formatPhone(b.phone.display_phone_number.replace(/\D/g, '')) : '—'} ·{' '}
            {b.started_at ? `started ${timeAgo(b.started_at)}` : b.scheduled_at ? `scheduled for ${new Date(b.scheduled_at).toLocaleString()}` : `created ${timeAgo(b.created_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={BROADCAST_STATUS_VARIANT[b.status]}>{b.status}</Badge>
          {can('admin') ? (
            <>
              {b.status === 'draft' || b.status === 'scheduled' ? (
                <Button asChild variant="outline">
                  <Link href={`/app/broadcasts/${b.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              ) : null}
              {b.status === 'sending' || b.status === 'scheduled' ? (
                <Button variant="outline" onClick={() => action.mutate('pause')} loading={action.isPending}>
                  <Pause /> Pause
                </Button>
              ) : null}
              {b.status === 'paused' ? (
                <Button onClick={() => action.mutate('resume')} loading={action.isPending}>
                  <Play /> Resume
                </Button>
              ) : null}
              {['scheduled', 'sending', 'paused'].includes(b.status) ? (
                <Button variant="outline" onClick={() => action.mutate('cancel')} disabled={action.isPending}>
                  <Ban /> Cancel
                </Button>
              ) : null}
              {b.status !== 'sending' ? (
                <Button variant="ghost" size="icon" aria-label="Delete broadcast" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  <Trash2 />
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {b.status === 'paused' && b.paused_reason ? (
        <Alert variant="warning">
          <AlertTitle>Paused</AlertTitle>
          <AlertDescription>{b.paused_reason}</AlertDescription>
        </Alert>
      ) : null}
      {b.status === 'draft' ? (
        <Alert variant="info">
          <AlertDescription>
            This broadcast is a draft. <Link className="underline" href={`/app/broadcasts/${b.id}/edit`}>Finish setting it up</Link> to send or schedule it.
          </AlertDescription>
        </Alert>
      ) : null}

      {b.status !== 'draft' ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex justify-between text-sm">
              <span>{live ? 'Sending…' : 'Progress'}</span>
              <span className="text-muted-foreground">
                {processed.toLocaleString()} / {sendable.toLocaleString()} ({pct(processed, sendable)}%)
              </span>
            </div>
            <Progress value={pct(processed, sendable)} aria-label="Broadcast progress" />
            {b.estimated_cost !== null ? (
              <p className="text-xs text-muted-foreground">
                Estimated Meta cost ${Number(b.estimated_cost).toFixed(2)} · Rs {Math.round(Number(b.estimated_cost) * USD_TO_PKR).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Recipients" value={sendable.toLocaleString()} />
        <StatCard label="Sent" value={b.sent_count.toLocaleString()} />
        <StatCard label="Delivered" value={`${pct(b.delivered_count, b.sent_count)}%`} />
        <StatCard label="Read" value={`${pct(b.read_count, b.sent_count)}%`} />
        <StatCard label="Replied" value={`${pct(b.replied_count, b.sent_count)}%`} />
        <StatCard label="Failed / skipped" value={`${b.failed_count.toLocaleString()} / ${b.skipped_count.toLocaleString()}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Recipients</CardTitle>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-36" aria-label="Filter recipients">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['all', 'pending', 'sent', 'delivered', 'read', 'failed', 'skipped'].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all' ? 'All statuses' : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {recipients.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (recipients.data?.items ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{b.status === 'draft' ? 'Recipients are added when the broadcast is launched.' : 'No recipients with this status.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Contact</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.data?.items.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-2 pr-3">
                          {r.contact ? (
                            <Link href={`/app/contacts/${r.contact.id}`} className="hover:text-primary hover:underline">
                              {r.contact.name ?? r.contact.profile_name ?? formatPhone(r.wa_id)}
                            </Link>
                          ) : (
                            formatPhone(r.wa_id)
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={RECIPIENT_VARIANT[r.status] ?? 'secondary'}>{r.replied_at ? 'replied' : r.status}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {r.error_message ?? (r.read_at ? `Read ${timeAgo(r.read_at)}` : r.sent_at ? `Sent ${timeAgo(r.sent_at)}` : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 ? (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        {b.template ? <TemplatePreview components={b.template.components} businessName={workspace.name} /> : null}
      </div>
    </div>
  );
}
