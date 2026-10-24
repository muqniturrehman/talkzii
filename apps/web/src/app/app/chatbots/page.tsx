import type { Metadata } from 'next';
import { hasMinRole, planHasFeature } from '@talkzi/shared';
import { PageHeader } from '@talkzi/ui/page-header';
import { ChatbotsList, NewChatbotDialog } from '@/components/app/chatbots/chatbots-list';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Chatbots' };

export default async function ChatbotsPage() {
  const session = await requireWorkspace('/app/chatbots');
  const canCreate = planHasFeature(session.workspace.plan, 'chatbots') && hasMinRole(session.workspace.role, 'admin');
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Chatbots"
        description="Visual flows that reply instantly, ask questions, branch on answers and hand off to your team. The highest-priority matching flow runs."
        actions={canCreate ? <NewChatbotDialog /> : null}
      />
      <ChatbotsList canCreate={canCreate} />
    </div>
  );
}
