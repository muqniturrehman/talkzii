import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { hasMinRole, planHasFeature } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { PageHeader } from '@talkzi/ui/page-header';
import { BroadcastsList } from '@/components/app/broadcasts/broadcasts-list';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Broadcasts' };

export default async function BroadcastsPage() {
  const session = await requireWorkspace('/app/broadcasts');
  const canCreate = planHasFeature(session.workspace.plan, 'broadcasts') && hasMinRole(session.workspace.role, 'admin');
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Broadcasts"
        description="Send approved templates to segments of subscribed contacts. Delivery, read and reply rates update live."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/app/broadcasts/new">
                <Plus /> New broadcast
              </Link>
            </Button>
          ) : null
        }
      />
      <BroadcastsList canCreate={canCreate} />
    </div>
  );
}
