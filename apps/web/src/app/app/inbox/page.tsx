import { Suspense } from 'react';
import type { Metadata } from 'next';
import { resolveAiSettings } from '@talkzi/shared';
import { Spinner } from '@talkzi/ui/spinner';
import { InboxShell } from '@/components/app/inbox/inbox-shell';
import { requireWorkspace } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage() {
  const session = await requireWorkspace('/app/inbox');
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase.from('workspaces').select('settings').eq('id', session.workspace.id).maybeSingle();
  const ai = resolveAiSettings(workspace?.settings);

  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <InboxShell ai={{ enabled: ai.enabled, autoSuggest: ai.autoSuggest }} />
    </Suspense>
  );
}
