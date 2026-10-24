'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, RefreshCw, Trash2 } from 'lucide-react';
import type { AiSettings } from '@talkzi/shared';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Switch } from '@talkzi/ui/switch';
import { Textarea } from '@talkzi/ui/textarea';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch, ApiClientError } from '@/lib/api/client';

export function AiPreferencesForm({ initial }: { initial: AiSettings }) {
  const router = useRouter();
  const [settings, setSettings] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const save = async (patch: Partial<AiSettings>) => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    try {
      await apiFetch('/api/workspaces/current/settings', { method: 'PATCH', body: { ai: patch } });
      toast.success('AI settings saved.');
      router.refresh();
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="ai-enabled">AI features</Label>
          <p className="text-sm text-muted-foreground">Reply suggestions, summaries, sentiment and intent in the inbox.</p>
        </div>
        <Switch id="ai-enabled" checked={settings.enabled} disabled={saving} onCheckedChange={(enabled) => void save({ enabled })} />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="ai-auto">Suggest replies automatically</Label>
          <p className="text-sm text-muted-foreground">Fetch suggestions when a customer message arrives (uses one credit each time).</p>
        </div>
        <Switch
          id="ai-auto"
          checked={settings.autoSuggest}
          disabled={saving || !settings.enabled}
          onCheckedChange={(autoSuggest) => void save({ autoSuggest })}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="ai-tone">Reply tone</Label>
          <p className="text-sm text-muted-foreground">How suggested replies should sound.</p>
        </div>
        <Select value={settings.tone} disabled={saving} onValueChange={(tone) => void save({ tone: tone as AiSettings['tone'] })}>
          <SelectTrigger id="ai-tone" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="concise">Concise</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error: string | null;
  chunk_count: number;
  embedding_model: string;
  created_at: string;
}

const statusVariant = { pending: 'secondary', processing: 'info', ready: 'success', failed: 'danger' } as const;

export function KnowledgeBase({
  initialDocuments,
  embeddingModel,
  allowed,
}: {
  initialDocuments: KnowledgeDocument[];
  embeddingModel: string;
  allowed: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    setErrors({});
    try {
      const result = await apiFetch<{ chunkCount: number }>('/api/ai/documents', { body: { title, content } });
      toast.success(`Added “${title}” (${result.chunkCount} section${result.chunkCount === 1 ? '' : 's'}).`);
      setTitle('');
      setContent('');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) setErrors(error.fieldErrors);
      toast.error(error instanceof Error ? error.message : 'Could not add the document');
    } finally {
      setAdding(false);
    }
  };

  const act = async (id: string, action: 'delete' | 'reindex') => {
    setBusyId(id);
    try {
      if (action === 'delete') await apiFetch(`/api/ai/documents/${id}`, { method: 'DELETE' });
      else await apiFetch(`/api/ai/documents/${id}/reindex`, { method: 'POST' });
      toast.success(action === 'delete' ? 'Document deleted.' : 'Document re-indexed.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {allowed ? (
        <form onSubmit={add} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kb-title">Title</Label>
            <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Delivery & returns policy" required />
            {errors.title ? <p className="text-xs text-danger">{errors.title[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-content">Content</Label>
            <Textarea
              id="kb-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Paste FAQs, prices, policies or product details. Suggested replies quote this when relevant."
              required
            />
            {errors.content ? <p className="text-xs text-danger">{errors.content[0]}</p> : null}
          </div>
          <Button type="submit" loading={adding} disabled={!title.trim() || content.trim().length < 20}>
            Add to knowledge base
          </Button>
        </form>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          The knowledge base is part of the Pro and Agency plans. Upgrade in Billing to ground AI replies in your own FAQs and policies.
        </p>
      )}

      {initialDocuments.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No documents yet" description="Add your FAQs and policies so AI suggestions use your real answers." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {initialDocuments.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.title}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.chunk_count} section{doc.chunk_count === 1 ? '' : 's'} · {new Date(doc.created_at).toLocaleDateString()}
                  {doc.error ? ` · ${doc.error}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[doc.status]}>{doc.status}</Badge>
                {doc.status === 'ready' && doc.embedding_model !== embeddingModel ? (
                  <Button size="sm" variant="outline" loading={busyId === doc.id} onClick={() => void act(doc.id, 'reindex')}>
                    <RefreshCw /> Re-index
                  </Button>
                ) : null}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${doc.title}`}
                  disabled={busyId === doc.id}
                  onClick={() => void act(doc.id, 'delete')}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
