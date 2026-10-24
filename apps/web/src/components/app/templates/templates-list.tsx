'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, RefreshCw, Search } from 'lucide-react';
import { summarizeTemplate } from '@talkzi/whatsapp/templates';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import { TEMPLATE_STATUS_VARIANT } from './template-preview';

export interface TemplateListItem {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
  rejected_reason: string | null;
  quality_score: string | null;
  updated_at: string;
}

export const templatesKey = ['templates', 'all'] as const;

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'In review' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DRAFT', label: 'Drafts' },
] as const;

export function TemplatesList() {
  const { can } = useApp();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<(typeof TABS)[number]['value']>('all');
  const [search, setSearch] = React.useState('');
  const templates = useQuery({ queryKey: templatesKey, queryFn: () => apiFetch<TemplateListItem[]>('/api/templates') });

  const sync = useMutation({
    mutationFn: () => apiFetch<{ synced: number }>('/api/templates/sync', { method: 'POST' }),
    onSuccess: ({ synced }) => {
      toast.success(`Synced ${synced} template${synced === 1 ? '' : 's'} from WhatsApp.`);
      void qc.invalidateQueries({ queryKey: templatesKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const all = templates.data ?? [];
  const count = (value: string) => (value === 'all' ? all.length : all.filter((t) => (value === 'PENDING' ? ['PENDING', 'IN_APPEAL'].includes(t.status) : t.status === value)).length);
  const visible = all.filter(
    (t) =>
      (tab === 'all' || (tab === 'PENDING' ? ['PENDING', 'IN_APPEAL'].includes(t.status) : t.status === tab)) &&
      (!search || t.name.includes(search.toLowerCase().replace(/\s+/g, '_'))),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Template status" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === t.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
              <span className={cn('rounded-full px-1.5 text-xs', tab === t.value ? 'bg-white/20' : 'bg-muted')}>{count(t.value)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="w-52 pl-9" />
          </div>
          {can('admin') ? (
            <>
              <Button variant="outline" onClick={() => sync.mutate()} loading={sync.isPending}>
                <RefreshCw /> Sync
              </Button>
              <Button asChild>
                <Link href="/app/templates/new">
                  <Plus /> New template
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {templates.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={all.length ? 'No templates here' : 'Create your first template'}
          description="Templates are pre-approved messages you can send any time — order updates, reminders, offers and more."
          action={
            can('admin') ? (
              <Button asChild>
                <Link href="/app/templates/new">New template</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => {
            const summary = summarizeTemplate(t.components);
            return (
              <li key={t.id}>
                <Link
                  href={`/app/templates/${t.id}`}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.category.toLowerCase()} · {t.language} · {timeAgo(t.updated_at)}
                      </span>
                    </span>
                    <Badge variant={TEMPLATE_STATUS_VARIANT[t.status] ?? 'secondary'}>{t.status === 'IN_APPEAL' ? 'in appeal' : t.status.toLowerCase()}</Badge>
                  </span>
                  <span className="line-clamp-3 text-sm text-muted-foreground">{summary.body.text || 'Authentication code template'}</span>
                  {t.status === 'REJECTED' && t.rejected_reason ? (
                    <span className="text-xs text-danger">Rejected: {t.rejected_reason.replaceAll('_', ' ').toLowerCase()}</span>
                  ) : null}
                  {t.quality_score && t.quality_score !== 'UNKNOWN' ? (
                    <span className="text-xs text-muted-foreground">Quality: {t.quality_score.toLowerCase()}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
