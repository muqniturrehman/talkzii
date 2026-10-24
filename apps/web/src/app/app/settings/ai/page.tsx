import type { Metadata } from 'next';
import { planHasFeature, planLimit, resolveAiSettings } from '@talkzi/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Progress } from '@talkzi/ui/progress';
import { AiPreferencesForm, KnowledgeBase, type KnowledgeDocument } from '@/components/app/settings/ai-settings';
import { getAiTasks, getEmbedder } from '@/lib/ai';
import { AI_CREDIT_METRIC, currentPeriod } from '@/lib/ai/credits';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'AI & knowledge' };

const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Anthropic Claude', heuristic: 'Offline heuristics (no API key set)' } as const;

export default async function AiSettingsPage() {
  const session = await requireRole('admin', '/app/settings/ai');
  const supabase = await createSupabaseServerClient();
  const [{ data: ws }, { data: documents }, { data: usage }] = await Promise.all([
    supabase.from('workspaces').select('settings').eq('id', session.workspace.id).maybeSingle(),
    supabase
      .from('ai_documents')
      .select('id, title, status, error, chunk_count, embedding_model, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('usage_counters')
      .select('value')
      .eq('metric', AI_CREDIT_METRIC)
      .eq('period', currentPeriod())
      .maybeSingle(),
  ]);

  const tasks = getAiTasks();
  const limit = planLimit(session.workspace.plan, 'ai_credits_per_month');
  const used = Number(usage?.value ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI assistant</CardTitle>
          <CardDescription>
            Provider: {PROVIDER_LABEL[tasks.provider]}
            {tasks.provider !== 'heuristic' ? ` · ${tasks.model}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AiPreferencesForm initial={resolveAiSettings(ws?.settings)} />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>AI credits this month</span>
              <span className="text-muted-foreground">
                {used.toLocaleString()} / {limit.toLocaleString()}
              </span>
            </div>
            <Progress value={Math.min(100, (used / Math.max(limit, 1)) * 100)} aria-label="AI credits used" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge base</CardTitle>
          <CardDescription>Documents are split into sections and searched (pgvector) to ground suggested replies.</CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeBase
            initialDocuments={(documents ?? []) as KnowledgeDocument[]}
            embeddingModel={getEmbedder().model}
            allowed={planHasFeature(session.workspace.plan, 'ai_inbox')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
