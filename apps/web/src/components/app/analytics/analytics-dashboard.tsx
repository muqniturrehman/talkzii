'use client';

import * as React from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, CheckCircle2, Lock, XCircle } from 'lucide-react';
import { USD_TO_PKR } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { EmptyState } from '@talkzi/ui/empty-state';
import { SegmentedControl } from '@talkzi/ui/segmented-control';
import { Skeleton } from '@talkzi/ui/skeleton';
import { StatCard } from '@talkzi/ui/stat-card';
import { cn } from '@talkzi/ui/lib/utils';
import { apiFetch } from '@/lib/api/client';
import type { AnalyticsPayload } from '@/lib/analytics/types';
import { formatDuration } from '@/lib/format';
import { CostChart, CsatChart, formatDay, ResponseTimeChart, VolumeChart } from './charts';

type Range = '7' | '30' | '90';
const CATEGORY_LABEL = { marketing: 'Marketing', utility: 'Utility', authentication: 'Authentication', service: 'Service' } as const;

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** Card with a Chart | Table toggle — every chart has a table-view twin. */
function ChartCard({
  title,
  description,
  chart,
  table,
  className,
}: {
  title: string;
  description?: string;
  chart: React.ReactNode;
  table: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = React.useState<'chart' | 'table'>('chart');
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <SegmentedControl
          label={`${title} view`}
          value={view}
          onValueChange={setView}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
          className="shrink-0 text-xs"
        />
      </CardHeader>
      <CardContent>{view === 'chart' ? <figure aria-label={title}>{chart}</figure> : <div className="max-h-72 overflow-auto scrollbar-thin">{table}</div>}</CardContent>
    </Card>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-2 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-border">
            {row.map((cell, j) => (
              <td key={j} className="py-1.5 pr-3">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QualityBadge({ rating }: { rating: string | null }) {
  const r = (rating ?? '').toUpperCase();
  if (r === 'GREEN')
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 className="size-3.5" /> High
      </span>
    );
  if (r === 'YELLOW')
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <AlertTriangle className="size-3.5" /> Medium
      </span>
    );
  if (r === 'RED')
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <XCircle className="size-3.5" /> Low
      </span>
    );
  return <span className="text-muted-foreground">Unknown</span>;
}

function UpgradeCard({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Lock className="size-6 text-primary" />
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">Response times, cost by category, CSAT, broadcast results and quality history are part of Pro and Agency.</p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/app/settings/billing">Upgrade</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard() {
  const [range, setRange] = React.useState<Range>('30');
  const query = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => apiFetch<AnalyticsPayload>(`/api/analytics?range=${range}`),
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Filters">
        <SegmentedControl
          label="Date range"
          value={range}
          onValueChange={setRange}
          options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]}
        />
        {query.isFetching && data ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
      </div>

      {!data ? (
        query.isError ? (
          <EmptyState icon={<BarChart3 />} title="Analytics unavailable" description={(query.error as Error).message} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )
      ) : (
        <div className={cn('space-y-6 transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isFetching}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Messages received" value={data.totals.inbound.toLocaleString()} hint={`${data.totals.outbound.toLocaleString()} sent`} />
            <StatCard label="New conversations" value={data.totals.conversationsStarted.toLocaleString()} hint={`${data.totals.resolved.toLocaleString()} resolved`} />
            <StatCard
              label="Median first response"
              value={data.totals.medianFirstResponseSeconds === null ? '—' : formatDuration(data.totals.medianFirstResponseSeconds)}
              hint={data.totals.answeredRate === null ? 'No customer questions yet' : `${pct(data.totals.answeredRate)} of questions answered`}
            />
            <StatCard label="Delivered · read" value={`${pct(data.totals.deliveryRate)} · ${pct(data.totals.readRate)}`} hint="Of outbound messages" />
            <StatCard
              label="CSAT"
              value={data.totals.csatAverage === null ? '—' : `${data.totals.csatAverage.toFixed(1)} / 5`}
              hint={`${data.totals.csatResponses.toLocaleString()} ratings`}
            />
            <StatCard
              label="Estimated Meta cost"
              value={`$${data.totals.estimatedCostUsd.toFixed(2)}`}
              hint={`≈ Rs ${Math.round(data.totals.estimatedCostUsd * USD_TO_PKR).toLocaleString()} · billable templates`}
            />
          </div>

          <ChartCard
            title="Message volume"
            description="Messages received from and sent to customers per day."
            chart={<VolumeChart data={data.volume} />}
            table={<DataTable head={['Day', 'Received', 'Sent']} rows={[...data.volume].reverse().map((d) => [formatDay(d.day), d.inbound, d.outbound])} />}
          />

          {data.advanced ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard
                  title="Median first response time"
                  description="From a customer’s message to the first agent reply, per day."
                  chart={<ResponseTimeChart data={data.responseTimes} />}
                  table={
                    <DataTable
                      head={['Day', 'Median', 'Answered', 'Questions']}
                      rows={[...data.responseTimes].reverse().map((d) => [formatDay(d.day), d.medianMinutes === null ? '—' : `${d.medianMinutes} min`, d.answered, d.total])}
                    />
                  }
                />
                <ChartCard
                  title="Estimated cost by category"
                  description="Billable template messages × Meta’s per-message rate."
                  chart={<CostChart data={data.costByCategory.map((c) => ({ label: CATEGORY_LABEL[c.category], cost: c.cost }))} />}
                  table={
                    <DataTable
                      head={['Category', 'Billable', 'All', 'Rate', 'Cost']}
                      rows={data.costByCategory.map((c) => [CATEGORY_LABEL[c.category], c.billable, c.total, `$${c.rate.toFixed(4)}`, `$${c.cost.toFixed(2)}`])}
                    />
                  }
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard
                  title="Customer satisfaction"
                  description="Ratings collected after conversations are resolved."
                  chart={<CsatChart data={data.csat} />}
                  table={<DataTable head={['Score', 'Responses']} rows={data.csat.map((c) => [`${c.score} ★`, c.responses])} />}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent broadcasts</CardTitle>
                    <CardDescription>Delivery, read and reply rates.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.broadcasts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No broadcasts in this period.</p>
                    ) : (
                      <DataTable
                        head={['Broadcast', 'Sent', 'Delivered', 'Read', 'Replied']}
                        rows={data.broadcasts.map((b) => [
                          b.name,
                          b.sent.toLocaleString(),
                          pct(b.sent ? b.delivered / b.sent : null),
                          pct(b.sent ? b.read / b.sent : null),
                          pct(b.sent ? b.replied / b.sent : null),
                        ])}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Number quality history</CardTitle>
                  <CardDescription>Meta’s quality rating and messaging limit changes (last 90 days).</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.quality.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No quality changes — your numbers are steady.</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3 font-medium">When</th>
                          <th className="py-2 pr-3 font-medium">Number</th>
                          <th className="py-2 pr-3 font-medium">Event</th>
                          <th className="py-2 pr-3 font-medium">Quality</th>
                          <th className="py-2 pr-3 font-medium">Limit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quality.map((q, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1.5 pr-3 tabular-nums">{new Date(q.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                            <td className="py-1.5 pr-3">{q.phone}</td>
                            <td className="py-1.5 pr-3">{q.event.toLowerCase().replaceAll('_', ' ')}</td>
                            <td className="py-1.5 pr-3">
                              <QualityBadge rating={q.rating} />
                            </td>
                            <td className="py-1.5 pr-3">{q.tier?.replace('TIER_', '') ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <UpgradeCard title="Unlock advanced analytics" />
          )}
        </div>
      )}
    </div>
  );
}
