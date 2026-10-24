'use client';

import * as React from 'react';
import { ArrowLeft, Bot, CheckCircle2, Clock, Eye, Info, MoreVertical, RotateCcw, UserRound } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@talkzi/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@talkzi/ui/sheet';
import { Skeleton } from '@talkzi/ui/skeleton';
import { Spinner } from '@talkzi/ui/spinner';
import { cn } from '@talkzi/ui/lib/utils';
import { formatSessionTimeLeft, isSessionOpen, sessionTimeLeft } from '@/lib/inbox/session';
import type { MessageItem, NoteItem } from '@/lib/inbox/types';
import { useApp } from '@/components/providers/app-providers';
import { Composer } from './composer';
import { ContactPanel } from './contact-panel';
import { contactDisplayName } from './conversation-list';
import { MessageBubble, NoteBubble } from './message-bubble';
import type { PresenceMeta } from './use-inbox-realtime';
import { useConversation, useDeleteNote, useMarkRead, useMembers, useMessages, useNotes, useUpdateConversation } from './use-inbox';

type TimelineItem = { kind: 'message'; at: string; message: MessageItem } | { kind: 'note'; at: string; note: NoteItem };

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Re-renders every 30s so the session countdown stays fresh. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function snoozeOptions(now: Date) {
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(now.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const nextWeek = new Date(tomorrow9);
  nextWeek.setDate(tomorrow9.getDate() + ((8 - tomorrow9.getDay()) % 7 || 7) - 1);
  return [
    { label: '1 hour', at: new Date(now.getTime() + 3_600_000) },
    { label: '3 hours', at: new Date(now.getTime() + 3 * 3_600_000) },
    { label: 'Tomorrow 9:00', at: tomorrow9 },
    { label: 'Next Monday 9:00', at: nextWeek },
  ];
}

function ViewersBanner({ viewers }: { viewers: PresenceMeta[] }) {
  if (viewers.length === 0) return null;
  const typing = viewers.filter((v) => v.typing);
  const names = (list: PresenceMeta[]) => list.map((v) => v.name.split(' ')[0]).join(', ');
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 border-b px-4 py-1.5 text-xs',
        typing.length ? 'border-warning/40 bg-warning/10 text-warning' : 'border-info/30 bg-info/10 text-info',
      )}
    >
      <Eye className="size-3.5" />
      {typing.length ? `${names(typing)} ${typing.length > 1 ? 'are' : 'is'} typing a reply…` : `${names(viewers)} ${viewers.length > 1 ? 'are' : 'is'} also viewing`}
    </div>
  );
}

export function ConversationView({
  id,
  onBack,
  viewers,
  onTypingChange,
  ai,
}: {
  id: string;
  onBack: () => void;
  viewers: PresenceMeta[];
  onTypingChange: (typing: boolean) => void;
  ai: { enabled: boolean; autoSuggest: boolean };
}) {
  const { user, workspace, can } = useApp();
  const canReply = can('agent');
  const now = useNow();
  const conversation = useConversation(id);
  const messages = useMessages(id);
  const notes = useNotes(id);
  const members = useMembers();
  const update = useUpdateConversation(id);
  const markRead = useMarkRead(id);
  const deleteNote = useDeleteNote(id);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);

  const allMessages = React.useMemo(() => messages.data?.pages.flatMap((p) => p.items) ?? [], [messages.data]);
  const byWamid = React.useMemo(() => new Map(allMessages.filter((m) => m.wamid).map((m) => [m.wamid!, m])), [allMessages]);
  const timeline = React.useMemo<TimelineItem[]>(
    () =>
      [
        ...allMessages.map((message) => ({ kind: 'message' as const, at: message.created_at, message })),
        ...(notes.data ?? []).map((note) => ({ kind: 'note' as const, at: note.created_at, note })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [allMessages, notes.data],
  );
  const lastInbound = React.useMemo(() => [...allMessages].reverse().find((m) => m.direction === 'inbound') ?? null, [allMessages]);
  const lastId = timeline.at(-1)?.at;

  // Keep the newest message in view unless the agent scrolled up to read history.
  React.useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  const unread = conversation.data?.unread_count ?? 0;
  const { mutate: markReadMutate } = markRead;
  React.useEffect(() => {
    if (unread > 0 && canReply) markReadMutate();
  }, [unread, canReply, markReadMutate, id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 80 && messages.hasPreviousPage && !messages.isFetchingPreviousPage) {
      const previousHeight = el.scrollHeight;
      void messages.fetchPreviousPage().then(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - previousHeight;
        });
      });
    }
  };

  if (conversation.isPending) {
    return (
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-12 w-3/5" />
        </div>
      </section>
    );
  }

  if (conversation.isError || !conversation.data) {
    return (
      <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">This conversation could not be loaded.</p>
        <Button variant="outline" onClick={onBack}>
          Back to inbox
        </Button>
      </section>
    );
  }

  const c = conversation.data;
  const name = contactDisplayName(c.contact);
  const open = isSessionOpen(c.expires_at, now);
  const left = sessionTimeLeft(c.expires_at, now);
  const assignee = members.data?.find((m) => m.user_id === c.assigned_to);

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`Conversation with ${name}`}>
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <Button size="icon-sm" variant="ghost" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
            <ArrowLeft />
          </Button>
          <button type="button" onClick={() => setPanelOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left xl:pointer-events-none">
            <UserAvatar name={name} src={c.contact.avatar_url} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                +{c.contact.wa_id}
                <Badge variant={open ? 'success' : 'warning'} className="gap-1 px-1.5 py-0 text-[10px]">
                  <Clock className="size-3" />
                  {open ? formatSessionTimeLeft(left) : 'Template only'}
                </Badge>
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1">
            {canReply ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="hidden sm:inline-flex" aria-label="Assign conversation">
                      <UserRound /> {assignee ? (assignee.full_name ?? assignee.email ?? 'Assigned').split(' ')[0] : 'Assign'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => update.mutate({ assignedTo: user.id })}>Me</DropdownMenuItem>
                    {(members.data ?? [])
                      .filter((m) => m.user_id !== user.id && m.role !== 'viewer')
                      .map((m) => (
                        <DropdownMenuItem key={m.user_id} onSelect={() => update.mutate({ assignedTo: m.user_id })}>
                          {m.full_name ?? m.email}
                        </DropdownMenuItem>
                      ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => update.mutate({ assignedTo: null })}>Unassign</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {c.status === 'resolved' ? (
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ status: 'open' })} loading={update.isPending}>
                    <RotateCcw /> Reopen
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => update.mutate({ status: 'resolved' })} loading={update.isPending}>
                    <CheckCircle2 /> <span className="hidden sm:inline">Resolve</span>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="More actions">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
                    {snoozeOptions(now).map((option) => (
                      <DropdownMenuItem key={option.label} onSelect={() => update.mutate({ snoozedUntil: option.at.toISOString() })}>
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => update.mutate({ status: 'pending' })}>Mark as pending</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => update.mutate({ botPaused: !c.bot_paused })}>
                      <Bot /> {c.bot_paused ? 'Resume chatbot' : 'Pause chatbot'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="sm:hidden" onSelect={() => update.mutate({ assignedTo: user.id })}>
                      <UserRound /> Assign to me
                    </DropdownMenuItem>
                    <DropdownMenuItem className="xl:hidden" onSelect={() => setPanelOpen(true)}>
                      <Info /> Contact details
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button size="icon-sm" variant="ghost" className="xl:hidden" onClick={() => setPanelOpen(true)} aria-label="Contact details">
                <Info />
              </Button>
            )}
          </div>
        </header>

        <ViewersBanner viewers={viewers} />
        {c.status === 'snoozed' && c.snoozed_until ? (
          <div className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
            Snoozed until {new Date(c.snoozed_until).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} — a new message reopens it.
          </div>
        ) : null}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:22px_22px] px-3 py-4 scrollbar-thin sm:px-6"
          aria-live="polite"
          aria-busy={messages.isPending}
        >
          {messages.isFetchingPreviousPage ? (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          ) : null}
          {messages.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="ml-auto h-12 w-1/2" />
            </div>
          ) : timeline.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ol className="space-y-2">
              {timeline.map((item, index) => {
                const previous = timeline[index - 1];
                const newDay = !previous || new Date(previous.at).toDateString() !== new Date(item.at).toDateString();
                return (
                  <li key={item.kind === 'message' ? item.message.id : `note-${item.note.id}`}>
                    {newDay ? (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">{dayLabel(item.at)}</span>
                      </div>
                    ) : null}
                    {item.kind === 'message' ? (
                      <MessageBubble
                        message={item.message}
                        quoted={item.message.reply_to_wamid ? (byWamid.get(item.message.reply_to_wamid) ?? null) : null}
                      />
                    ) : (
                      <NoteBubble
                        note={item.note}
                        canDelete={item.note.author_id === user.id || can('admin')}
                        onDelete={() => deleteNote.mutate(item.note.id)}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={bottomRef} />
        </div>

        <Composer
          key={c.id}
          conversation={c}
          sessionOpen={open}
          userId={user.id}
          workspaceId={workspace.id}
          canReply={canReply}
          ai={ai}
          autoSuggestKey={lastInbound && allMessages.at(-1)?.id === lastInbound.id ? lastInbound.id : null}
          onTypingChange={onTypingChange}
        />
      </section>

      <ContactPanel conversation={c} canEdit={canReply} aiEnabled={ai.enabled} className="hidden w-80 shrink-0 border-l border-border xl:flex" />
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-[22rem] max-w-full p-0 xl:hidden">
          <SheetTitle className="sr-only">Contact details</SheetTitle>
          <ContactPanel conversation={c} canEdit={canReply} aiEnabled={ai.enabled} className="h-full" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
