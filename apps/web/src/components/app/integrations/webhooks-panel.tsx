'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus, Send, Trash2, Webhook } from 'lucide-react';
import { WEBHOOK_EVENT_META, WEBHOOK_EVENTS, type WebhookEvent } from '@talkzi/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@talkzi/ui/alert-dialog';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Checkbox } from '@talkzi/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@talkzi/ui/sheet';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { Switch } from '@talkzi/ui/switch';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import { CopyField } from './copy-field';

interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEvent[];
  active: boolean;
  failure_count: number;
  last_delivery_at: string | null;
  last_status: number | null;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  event: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  response_status: number | null;
  duration_ms: number | null;
  error: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

const webhooksKey = ['webhooks'] as const;

const VERIFY_SNIPPET = `// Node.js — verify X-Talkzi-Signature: t=<unix>,v1=<hex>
const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
const valid = v1?.length === expected.length
  && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))
  && Math.abs(Date.now() / 1000 - Number(t)) < 300;`;

function AddWebhookDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [events, setEvents] = React.useState<WebhookEvent[]>(['message.received', 'message.status']);
  const [secret, setSecret] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiFetch<WebhookRow & { secret: string }>('/api/webhooks/outgoing', { body: { url, description: description || undefined, events } }),
    onSuccess: (data) => {
      setSecret(data.secret);
      void qc.invalidateQueries({ queryKey: webhooksKey });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSecret(null);
          setUrl('');
          setDescription('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? 'Copy your signing secret' : 'Add webhook endpoint'}</DialogTitle>
          <DialogDescription>
            {secret
              ? 'Use it to verify that requests come from Talkzi. It won’t be shown again.'
              : 'Talkzi POSTs a signed JSON event to this URL. Failed deliveries are retried for up to 24 hours.'}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-4">
            <CopyField value={secret} label="Signing secret" secret />
            <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed scrollbar-thin">
              <code>{VERIFY_SNIPPET}</code>
            </pre>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="hook-url">Endpoint URL</Label>
              <Input id="hook-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/talkzi" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hook-desc">Description (optional)</Label>
              <Input id="hook-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="CRM sync" />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Events</legend>
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={events.includes(event)}
                    onCheckedChange={(v) => setEvents((s) => (v === true ? [...s, event] : s.filter((x) => x !== event)))}
                  />
                  <span>
                    <code className="text-xs">{event}</code>
                    <span className="block text-xs text-muted-foreground">{WEBHOOK_EVENT_META[event]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button type="submit" loading={create.isPending} disabled={!url.trim() || events.length === 0}>
                Add endpoint
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeliveryStatus({ delivery }: { delivery: DeliveryRow }) {
  if (delivery.status === 'success') return <Badge variant="success">{delivery.response_status ?? 'OK'}</Badge>;
  if (delivery.status === 'failed') return <Badge variant="danger">Failed{delivery.response_status ? ` · ${delivery.response_status}` : ''}</Badge>;
  return <Badge variant="warning">{delivery.next_attempt_at ? 'Retrying' : 'Pending'}</Badge>;
}

function DeliveriesSheet({ hook, onOpenChange }: { hook: WebhookRow | null; onOpenChange: (open: boolean) => void }) {
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', hook?.id],
    queryFn: () => apiFetch<DeliveryRow[]>(`/api/webhooks/outgoing/${hook!.id}/deliveries`),
    enabled: Boolean(hook),
    refetchInterval: 15_000,
  });

  return (
    <Sheet open={Boolean(hook)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Recent deliveries</SheetTitle>
          <SheetDescription className="break-all">{hook?.url}</SheetDescription>
        </SheetHeader>
        {deliveries.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (deliveries.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries yet. Send a test event to check your endpoint.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {deliveries.data!.map((d) => (
              <li key={d.id} className="space-y-1 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs">{d.event}</code>
                  <DeliveryStatus delivery={d} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {timeAgo(d.created_at)} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                  {d.duration_ms !== null ? ` · ${d.duration_ms} ms` : ''}
                  {d.status === 'pending' && d.next_attempt_at ? ` · next try ${timeAgo(d.next_attempt_at)}` : ''}
                </p>
                {d.error ? <p className="text-xs break-words text-danger">{d.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Outbound webhook endpoints: add, enable/disable, test, delivery log, delete. */
export function WebhooksPanel() {
  const qc = useQueryClient();
  const [logFor, setLogFor] = React.useState<WebhookRow | null>(null);
  const hooks = useQuery({ queryKey: webhooksKey, queryFn: () => apiFetch<WebhookRow[]>('/api/webhooks/outgoing') });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiFetch(`/api/webhooks/outgoing/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: (_data, vars) => {
      toast.success(vars.active ? 'Endpoint enabled.' : 'Endpoint paused.');
      void qc.invalidateQueries({ queryKey: webhooksKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean; status: number | null; durationMs: number; error: string | null }>('/api/webhooks/outgoing/test', { body: { webhookId: id } }),
    onSuccess: (result, id) => {
      if (result.ok) toast.success(`Endpoint responded ${result.status} in ${result.durationMs} ms.`);
      else toast.error(`Test failed: ${result.error ?? `HTTP ${result.status}`}`);
      void qc.invalidateQueries({ queryKey: webhooksKey });
      void qc.invalidateQueries({ queryKey: ['webhook-deliveries', id] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/webhooks/outgoing/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Endpoint deleted.');
      void qc.invalidateQueries({ queryKey: webhooksKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = hooks.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Get notified in your own systems when messages, conversations or templates change.</p>
        <AddWebhookDialog />
      </div>

      {hooks.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Webhook />} title="No webhook endpoints" description="Add an endpoint to receive message, conversation and template events as they happen." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((hook) => (
            <li key={hook.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-mono text-sm" title={hook.url}>
                  {hook.url}
                </p>
                {hook.description ? <p className="text-sm text-muted-foreground">{hook.description}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {hook.events.map((event) => (
                    <Badge key={event} variant="outline">
                      {event}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {!hook.active ? (
                    <span className="text-danger">{hook.failure_count >= 50 ? 'Disabled after repeated failures · ' : 'Paused · '}</span>
                  ) : hook.failure_count > 0 ? (
                    <span className="text-warning">{hook.failure_count} failed in a row · </span>
                  ) : null}
                  {hook.last_delivery_at ? `last delivery ${timeAgo(hook.last_delivery_at)}${hook.last_status ? ` (HTTP ${hook.last_status})` : ''}` : 'no deliveries yet'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={hook.active}
                  onCheckedChange={(active) => toggle.mutate({ id: hook.id, active })}
                  disabled={toggle.isPending}
                  aria-label={hook.active ? 'Pause endpoint' : 'Enable endpoint'}
                />
                <Button size="sm" variant="outline" onClick={() => test.mutate(hook.id)} loading={test.isPending && test.variables === hook.id}>
                  <Send /> Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLogFor(hook)} aria-label="Delivery log">
                  <History />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" aria-label="Delete endpoint">
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
                      <AlertDialogDescription>Talkzi stops sending events to {hook.url} and its delivery log is removed.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction destructive onClick={() => remove.mutate(hook.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Alert variant="info">
        <AlertDescription>
          Each request carries <code className="text-xs">X-Talkzi-Event</code>, <code className="text-xs">X-Talkzi-Delivery</code> and an HMAC-SHA256{' '}
          <code className="text-xs">X-Talkzi-Signature</code>. Respond with any 2xx within 10 seconds; endpoints are paused after 50 consecutive failures.
        </AlertDescription>
      </Alert>

      <DeliveriesSheet hook={logFor} onOpenChange={(open) => !open && setLogFor(null)} />
    </div>
  );
}
