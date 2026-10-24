import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Inbox,
  MessageCircle,
  Send,
  ShieldAlert,
  Smartphone,
  Star,
  UserX,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { EmptyState } from '@talkzi/ui/empty-state';
import { PageHeader } from '@talkzi/ui/page-header';
import { StatCard } from '@talkzi/ui/stat-card';
import { QualityBadge, tierLabel } from '@/components/app/quality-badge';
import { requireWorkspace } from '@/lib/auth/session';
import { formatDuration, formatNumber, formatPercent, timeAgo } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Overview' };

interface Overview {
  open_conversations?: number;
  unassigned_conversations?: number;
  unread_messages?: number;
  messages_today_inbound?: number;
  messages_today_outbound?: number;
  contacts_total?: number;
  contacts_opted_out?: number;
  broadcasts_this_month?: number;
  delivery_rate_30d?: number | null;
  read_rate_30d?: number | null;
  avg_first_response_seconds_30d?: number | null;
  csat_avg_30d?: number | null;
  phone_numbers?: {
    id: string;
    display_phone_number: string;
    verified_name: string | null;
    quality_rating: string;
    messaging_limit_tier: string | null;
    status: string;
  }[];
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const session = await requireWorkspace();
  const supabase = await createSupabaseServerClient();

  const [overviewRes, recentRes, templatesRes, broadcastsRes] = await Promise.all([
    supabase.rpc('analytics_overview'),
    supabase
      .from('conversations')
      .select('id, status, unread_count, last_message_at, last_message_preview, contact:contacts(name, profile_name, wa_id)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(6),
    supabase.from('message_templates').select('id', { count: 'exact', head: true }).eq('status', 'APPROVED'),
    supabase.from('broadcasts').select('id', { count: 'exact', head: true }).neq('status', 'draft'),
  ]);

  const overview = (overviewRes.data ?? {}) as Overview;
  const phones = overview.phone_numbers ?? [];
  const recent = recentRes.data ?? [];
  const firstName = session.profile?.full_name?.split(' ')[0];

  const checklist = [
    { done: phones.length > 0, label: 'Connect your WhatsApp number', href: '/app/sessions/connect' },
    { done: (templatesRes.count ?? 0) > 0, label: 'Get a message template approved', href: '/app/templates/new' },
    { done: (overview.contacts_total ?? 0) > 0, label: 'Import your contacts', href: '/app/contacts?import=1' },
    { done: (broadcastsRes.count ?? 0) > 0, label: 'Send your first broadcast', href: '/app/broadcasts/new' },
  ];
  const completed = checklist.filter((c) => c.done).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={firstName ? `Assalam o Alaikum, ${firstName} 👋` : 'Overview'}
        description={`Here’s what’s happening in ${session.workspace.name} today.`}
        actions={
          <Button asChild>
            <Link href="/app/inbox">
              <Inbox /> Open inbox
            </Link>
          </Button>
        }
      />

      {denied ? (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>Your role doesn’t have access to that page. Ask a workspace admin for access.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open conversations"
          value={formatNumber(overview.open_conversations)}
          hint={`${formatNumber(overview.unassigned_conversations)} unassigned`}
          icon={<MessageCircle />}
        />
        <StatCard
          label="Messages today"
          value={formatNumber((overview.messages_today_inbound ?? 0) + (overview.messages_today_outbound ?? 0))}
          hint={`${formatNumber(overview.messages_today_inbound)} in · ${formatNumber(overview.messages_today_outbound)} out`}
          icon={<Send />}
        />
        <StatCard
          label="Avg. first response (30d)"
          value={formatDuration(overview.avg_first_response_seconds_30d)}
          hint={`${formatNumber(overview.unread_messages)} unread now`}
          icon={<Clock />}
        />
        <StatCard
          label="Delivery rate (30d)"
          value={formatPercent(overview.delivery_rate_30d)}
          hint={`Read rate ${formatPercent(overview.read_rate_30d)}`}
          icon={<CheckCircle2 />}
        />
        <StatCard label="Contacts" value={formatNumber(overview.contacts_total)} icon={<Users />} />
        <StatCard label="Opted out" value={formatNumber(overview.contacts_opted_out)} icon={<UserX />} />
        <StatCard label="Broadcasts this month" value={formatNumber(overview.broadcasts_this_month)} icon={<Send />} />
        <StatCard
          label="CSAT (30d)"
          value={overview.csat_avg_30d ? `${overview.csat_avg_30d} / 5` : '—'}
          icon={<Star />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent conversations</CardTitle>
              <CardDescription>Latest activity across your numbers</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/inbox">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="No conversations yet"
                description="Once your number is connected, customer messages appear here in real time."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((c) => {
                  const name = c.contact?.name ?? c.contact?.profile_name ?? `+${c.contact?.wa_id ?? ''}`;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/app/inbox?c=${c.id}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-primary/5"
                      >
                        <UserAvatar name={name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.last_message_preview}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                          {c.unread_count > 0 ? (
                            <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                              {c.unread_count}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Getting started</CardTitle>
              <CardDescription>
                {completed} of {checklist.length} complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {checklist.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-primary/5">
                      {item.done ? (
                        <CheckCircle2 className="size-5 text-success" aria-label="Done" />
                      ) : (
                        <Circle className="size-5 text-muted-foreground" aria-label="To do" />
                      )}
                      <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>WhatsApp numbers</CardTitle>
              <CardDescription>Quality rating and messaging tier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {phones.length === 0 ? (
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/app/sessions/connect">
                    <Smartphone /> Connect a number
                  </Link>
                </Button>
              ) : (
                phones.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.verified_name ?? p.display_phone_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.display_phone_number} · {tierLabel(p.messaging_limit_tier)}
                      </p>
                    </div>
                    <QualityBadge rating={p.quality_rating} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
