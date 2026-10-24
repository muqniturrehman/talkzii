'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Kbd } from '@talkzi/ui/kbd';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';
import type { InboxFilters } from './use-inbox';
import { useInboxRealtime } from './use-inbox-realtime';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Three-pane, real-time shared inbox: conversations · thread · contact details. */
export function InboxShell({ ai }: { ai: { enabled: boolean; autoSuggest: boolean } }) {
  const { user, workspace } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get('c');
  const selectedId = param && UUID_RE.test(param) ? param : null;

  const [filters, setFilters] = React.useState<InboxFilters>({ status: 'open', assignee: 'all' });
  const [typing, setTyping] = React.useState(false);

  const { viewers } = useInboxRealtime({
    workspaceId: workspace.id,
    me: { id: user.id, name: user.fullName ?? user.email ?? 'Teammate', avatarUrl: user.avatarUrl },
    conversationId: selectedId,
    typing,
  });

  const select = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('c', id);
    else params.delete('c');
    setTyping(false);
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <ConversationList
        className={cn('w-full shrink-0 border-r border-border md:w-80 lg:w-96', selectedId && 'hidden md:flex')}
        filters={filters}
        onFiltersChange={setFilters}
        selectedId={selectedId}
        onSelect={select}
      />
      {selectedId ? (
        <ConversationView key={selectedId} id={selectedId} onBack={() => select(null)} viewers={viewers} onTypingChange={setTyping} ai={ai} />
      ) : (
        <div className="hidden min-w-0 flex-1 items-center justify-center p-6 md:flex">
          <EmptyState
            className="border-none"
            icon={<MessagesSquare />}
            title="Pick a conversation"
            description={
              <>
                Use <Kbd>J</Kbd> / <Kbd>K</Kbd> or the arrow keys to move through the list. Replies, notes and status changes sync live across your team.
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
