'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Brain, Check, ExternalLink, Gauge, Mail, Phone, Plus, Smile, Tag, X } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@talkzi/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@talkzi/ui/popover';
import { Separator } from '@talkzi/ui/separator';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { apiFetch } from '@/lib/api/client';
import type { ConversationSummary, IntentResult, SentimentResult } from '@/lib/ai/schemas';
import type { ConversationDetail } from '@/lib/inbox/types';
import { contactDisplayName } from './conversation-list';
import { useConversationLabel, useLabels } from './use-inbox';

interface AiResponse<T> {
  result: T;
  provider: string;
  model: string;
}

function LabelPicker({ conversation, disabled }: { conversation: ConversationDetail; disabled: boolean }) {
  const labels = useLabels();
  const { add, remove } = useConversationLabel(conversation.id);
  const active = new Set(conversation.labels.map((l) => l.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Edit labels" disabled={disabled}>
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder="Find a label…" />
          <CommandList>
            <CommandEmpty>No labels. Create them in Contacts → Labels.</CommandEmpty>
            <CommandGroup>
              {(labels.data ?? []).map((label) => {
                const checked = active.has(label.id);
                return (
                  <CommandItem
                    key={label.id}
                    value={label.name}
                    onSelect={() => (checked ? remove.mutate(label.id) : add.mutate(label.id))}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                    <span className="flex-1">{label.name}</span>
                    {checked ? <Check className="size-4 text-primary" /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const sentimentStyle: Record<SentimentResult['sentiment'], string> = {
  positive: 'success',
  neutral: 'secondary',
  negative: 'danger',
};

function AiInsights({ conversationId, enabled }: { conversationId: string; enabled: boolean }) {
  const call = <T,>(path: string) => () => apiFetch<AiResponse<T>>(path, { body: { conversationId } });
  const onError = (error: Error) => toast.error(error.message);
  const summary = useMutation({ mutationFn: call<ConversationSummary>('/api/ai/summarize'), onError });
  const sentiment = useMutation({ mutationFn: call<SentimentResult>('/api/ai/sentiment'), onError });
  const intent = useMutation({ mutationFn: call<IntentResult>('/api/ai/intent'), onError });

  if (!enabled) {
    return <p className="text-xs text-muted-foreground">AI features are turned off for this workspace.</p>;
  }

  const provider = summary.data?.provider ?? sentiment.data?.provider ?? intent.data?.provider;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => summary.mutate()} loading={summary.isPending}>
          <Brain /> Summarize
        </Button>
        <Button size="sm" variant="outline" onClick={() => sentiment.mutate()} loading={sentiment.isPending}>
          <Smile /> Sentiment
        </Button>
        <Button size="sm" variant="outline" onClick={() => intent.mutate()} loading={intent.isPending}>
          <Gauge /> Intent
        </Button>
      </div>

      {sentiment.data ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={sentimentStyle[sentiment.data.result.sentiment] as 'success' | 'secondary' | 'danger'}>
            {sentiment.data.result.sentiment}
          </Badge>
          <Badge variant={sentiment.data.result.urgency === 'high' ? 'danger' : sentiment.data.result.urgency === 'medium' ? 'warning' : 'outline'}>
            {sentiment.data.result.urgency} urgency
          </Badge>
          <span className="w-full text-muted-foreground">{sentiment.data.result.reason}</span>
        </div>
      ) : null}

      {intent.data ? (
        <div className="space-y-1 text-xs">
          <Badge variant="info">{intent.data.result.intent.replace('_', ' ')}</Badge>
          <span className="ml-2 text-muted-foreground">{Math.round(intent.data.result.confidence * 100)}% confident</span>
          <p className="text-muted-foreground">{intent.data.result.summary}</p>
        </div>
      ) : null}

      {summary.data ? (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-xs">
          <p>{summary.data.result.summary}</p>
          {summary.data.result.keyPoints.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {summary.data.result.keyPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          ) : null}
          {summary.data.result.nextSteps.length ? (
            <p className="text-muted-foreground">
              <strong className="text-foreground">Next:</strong> {summary.data.result.nextSteps.join(' ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {provider ? (
        <p className="text-[10px] text-muted-foreground">
          {provider === 'heuristic' ? 'Offline heuristics — add an OpenAI or Anthropic key for full AI.' : `Powered by ${provider}`}
        </p>
      ) : null}
    </div>
  );
}

export function ContactPanel({
  conversation,
  canEdit,
  aiEnabled,
  onClose,
  className,
}: {
  conversation: ConversationDetail;
  canEdit: boolean;
  aiEnabled: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const { contact } = conversation;
  const name = contactDisplayName(contact);
  const { remove } = useConversationLabel(conversation.id);

  return (
    <aside className={cn('flex min-h-0 flex-col overflow-y-auto bg-background scrollbar-thin', className)} aria-label="Contact details">
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={name} src={contact.avatar_url} className="size-12" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            {contact.profile_name && contact.profile_name !== contact.name ? (
              <p className="truncate text-xs text-muted-foreground">~{contact.profile_name}</p>
            ) : null}
            {contact.opted_out ? (
              <Badge variant="danger" className="mt-1">
                Opted out
              </Badge>
            ) : null}
          </div>
        </div>
        {onClose ? (
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close contact details">
            <X />
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 px-4 text-sm">
        <a href={`https://wa.me/${contact.wa_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary">
          <Phone className="size-4 text-muted-foreground" /> +{contact.wa_id}
        </a>
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-primary">
            <Mail className="size-4 text-muted-foreground" /> {contact.email}
          </a>
        ) : null}
        <Link href={`/app/contacts/${contact.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline dark:text-accent">
          Open contact <ExternalLink className="size-3" />
        </Link>
      </div>

      <Separator className="my-4" />

      <section className="space-y-2 px-4" aria-labelledby="labels-heading">
        <div className="flex items-center justify-between">
          <h3 id="labels-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Tag className="size-3.5" /> Conversation labels
          </h3>
          <LabelPicker conversation={conversation} disabled={!canEdit} />
        </div>
        {conversation.labels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {conversation.labels.map((label) => (
              <span key={label.id} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs">
                <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                {label.name}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => remove.mutate(label.id)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove label ${label.name}`}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No labels yet.</p>
        )}
        {contact.contact_labels.length ? (
          <p className="pt-1 text-xs text-muted-foreground">
            Contact: {contact.contact_labels.map((l) => l.name).join(', ')}
          </p>
        ) : null}
      </section>

      <Separator className="my-4" />

      <section className="space-y-2 px-4 pb-6" aria-labelledby="ai-heading">
        <h3 id="ai-heading" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Brain className="size-3.5" /> AI insights
        </h3>
        <AiInsights key={conversation.id} conversationId={conversation.id} enabled={aiEnabled && canEdit} />
      </section>
    </aside>
  );
}
