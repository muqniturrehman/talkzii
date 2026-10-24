'use client';

import * as React from 'react';
import { FileText, Lock, Paperclip, SendHorizontal, Sparkles, StickyNote, X } from 'lucide-react';
import { MEDIA_LIMITS, mediaKindForMime } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { Kbd } from '@talkzi/ui/kbd';
import { SimpleTooltip } from '@talkzi/ui/tooltip';
import { Textarea } from '@talkzi/ui/textarea';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { apiFetch } from '@/lib/api/client';
import { renderCannedReply } from '@/lib/inbox/canned';
import { safeFileName } from '@/lib/inbox/media';
import type { ConversationDetail } from '@/lib/inbox/types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { TemplatePicker, type TemplateSendRequest } from './template-picker';
import { newClientMessageId, useAddNote, useCannedReplies, useSendMessage } from './use-inbox';

type Mode = 'reply' | 'note';

interface Suggestions {
  result: string[];
  provider: string;
  knowledge: { title: string }[];
}

export function Composer({
  conversation,
  sessionOpen,
  userId,
  workspaceId,
  canReply,
  ai,
  autoSuggestKey,
  onTypingChange,
}: {
  conversation: ConversationDetail;
  sessionOpen: boolean;
  userId: string;
  workspaceId: string;
  canReply: boolean;
  ai: { enabled: boolean; autoSuggest: boolean };
  /** Changes when a new inbound message arrives (drives auto-suggest). */
  autoSuggestKey: string | null;
  onTypingChange: (typing: boolean) => void;
}) {
  const [mode, setMode] = React.useState<Mode>('reply');
  const [text, setText] = React.useState('');
  const [cannedIndex, setCannedIndex] = React.useState(0);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestions | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useSendMessage(conversation, userId);
  const addNote = useAddNote(conversation.id);
  const canned = useCannedReplies();

  const replyLocked = mode === 'reply' && !sessionOpen;
  const slash = mode === 'reply' && text.startsWith('/') && !text.includes('\n') ? text.slice(1).toLowerCase() : null;
  const cannedMatches = React.useMemo(
    () =>
      slash === null
        ? []
        : (canned.data ?? []).filter((c) => c.shortcut.includes(slash) || c.title.toLowerCase().includes(slash)).slice(0, 8),
    [canned.data, slash],
  );

  const setTyping = React.useCallback(
    (value: string) => {
      clearTimeout(typingTimer.current);
      if (value) {
        onTypingChange(true);
        typingTimer.current = setTimeout(() => onTypingChange(false), 3_000);
      } else {
        onTypingChange(false);
      }
    },
    [onTypingChange],
  );

  React.useEffect(() => () => clearTimeout(typingTimer.current), []);

  const fetchSuggestions = React.useCallback(async () => {
    setSuggesting(true);
    try {
      const data = await apiFetch<Suggestions>('/api/ai/suggest-reply', { body: { conversationId: conversation.id } });
      setSuggestions(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not get suggestions');
    } finally {
      setSuggesting(false);
    }
  }, [conversation.id]);

  // Auto-suggest when a new customer message arrives (workspace setting).
  React.useEffect(() => {
    if (!ai.enabled || !ai.autoSuggest || !autoSuggestKey || !canReply || !sessionOpen) return;
    const timer = setTimeout(() => void fetchSuggestions(), 300);
    return () => clearTimeout(timer);
  }, [ai.enabled, ai.autoSuggest, autoSuggestKey, canReply, sessionOpen, fetchSuggestions]);

  const applyCanned = (index: number) => {
    const reply = cannedMatches[index];
    if (!reply) return;
    setText(renderCannedReply(reply.body, conversation.contact));
    setCannedIndex(0);
    textareaRef.current?.focus();
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    if (mode === 'note') {
      addNote.mutate(body, { onSuccess: () => setText('') });
      return;
    }
    if (replyLocked) return;
    send.mutate({ type: 'text', conversationId: conversation.id, text: body, clientMessageId: newClientMessageId() });
    setText('');
    setSuggestions(null);
    setTyping('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (cannedMatches.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setCannedIndex((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + cannedMatches.length) % cannedMatches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applyCanned(cannedIndex);
        return;
      }
      if (event.key === 'Escape') {
        setText('');
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onFile = async (file: File) => {
    const kind = mediaKindForMime(file.type);
    if (!kind) {
      toast.error('WhatsApp does not support this file type.');
      return;
    }
    if (file.size > MEDIA_LIMITS[kind].maxBytes) {
      toast.error(`${kind[0]!.toUpperCase()}${kind.slice(1)} files must be under ${Math.round(MEDIA_LIMITS[kind].maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setUploading(true);
    try {
      const path = `${workspaceId}/${conversation.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const uploaded = await apiFetch<{ mediaId: string; kind: typeof kind }>('/api/media/upload', {
        body: { conversationId: conversation.id, storagePath: path, mimeType: file.type, filename: file.name },
      });
      const caption = text.trim() && kind !== 'audio' ? text.trim() : undefined;
      send.mutate({
        type: uploaded.kind,
        conversationId: conversation.id,
        mediaId: uploaded.mediaId,
        storagePath: path,
        mimeType: file.type,
        filename: kind === 'document' ? file.name : undefined,
        caption,
        clientMessageId: newClientMessageId(),
      });
      if (caption) setText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const sendTemplate = (request: TemplateSendRequest) => {
    send.mutate(
      { type: 'template', conversationId: conversation.id, templateId: request.templateId, variables: request.variables, clientMessageId: newClientMessageId() },
      { onSuccess: () => setTemplatesOpen(false) },
    );
  };

  if (!canReply) {
    return (
      <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
        <Lock className="mr-1 inline size-3.5" /> Viewers can read conversations but not reply.
      </div>
    );
  }

  const contactName = conversation.contact.name ?? conversation.contact.profile_name;

  return (
    <div className="border-t border-border bg-background/80 p-3 backdrop-blur">
      {replyLocked ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <span>
            <strong>24-hour window closed.</strong> WhatsApp only allows approved templates until the customer replies.
          </span>
          <Button size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileText /> Send template
          </Button>
        </div>
      ) : null}

      {suggestions && suggestions.result.length > 0 && mode === 'reply' && !replyLocked ? (
        <div className="mb-2 flex items-start gap-2" aria-live="polite">
          <Sparkles className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {suggestions.result.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setText(s);
                  textareaRef.current?.focus();
                }}
                className="max-w-full rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-1 text-left text-xs transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="line-clamp-2">{s}</span>
              </button>
            ))}
            {suggestions.knowledge.length ? (
              <span className="self-center text-[10px] text-muted-foreground">
                From: {suggestions.knowledge.map((k) => k.title).join(', ')}
              </span>
            ) : null}
          </div>
          <button type="button" onClick={() => setSuggestions(null)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Dismiss suggestions">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="relative">
        {cannedMatches.length > 0 ? (
          <ul
            role="listbox"
            aria-label="Canned replies"
            className="glass absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-border p-1 shadow-glow scrollbar-thin sm:w-96"
          >
            {cannedMatches.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === cannedIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyCanned(i)}
                  className={cn('w-full rounded-xl px-3 py-2 text-left text-sm', i === cannedIndex ? 'bg-primary/15' : 'hover:bg-muted')}
                >
                  <span className="font-medium">/{c.shortcut}</span> <span className="text-muted-foreground">· {c.title}</span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{c.body}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={cn('rounded-2xl border bg-card transition focus-within:ring-2 focus-within:ring-ring', mode === 'note' ? 'border-warning/50 bg-warning/5' : 'border-border')}>
          <div className="flex items-center gap-1 border-b border-border/60 px-2 pt-1.5">
            {(['reply', 'note'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  mode === m ? (m === 'note' ? 'bg-warning/20 text-warning' : 'bg-primary/15 text-primary dark:text-accent') : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'reply' ? 'Reply' : (
                  <span className="inline-flex items-center gap-1">
                    <StickyNote className="size-3" /> Internal note
                  </span>
                )}
              </button>
            ))}
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCannedIndex(0);
              if (mode === 'reply') setTyping(e.target.value);
            }}
            onKeyDown={onKeyDown}
            disabled={replyLocked}
            rows={2}
            maxLength={4096}
            placeholder={
              replyLocked
                ? 'Free-form replies are disabled outside the 24-hour window'
                : mode === 'note'
                  ? 'Write a note only your team can see…'
                  : 'Type a reply — “/” for canned replies'
            }
            aria-label={mode === 'note' ? 'Internal note' : 'Reply'}
            className="max-h-48 min-h-[3rem] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-0.5">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={Object.values(MEDIA_LIMITS).flatMap((l) => l.mime).join(',')}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
              <SimpleTooltip label="Attach a file">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Attach a file"
                  disabled={mode === 'note' || replyLocked || uploading}
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Send a template">
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Send a template" onClick={() => setTemplatesOpen(true)}>
                  <FileText />
                </Button>
              </SimpleTooltip>
              {ai.enabled ? (
                <SimpleTooltip label="Suggest replies with AI">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Suggest replies with AI"
                    disabled={mode === 'note' || replyLocked}
                    loading={suggesting}
                    onClick={() => void fetchSuggestions()}
                  >
                    <Sparkles />
                  </Button>
                </SimpleTooltip>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
              </span>
              <Button
                type="button"
                size="sm"
                onClick={submit}
                disabled={!text.trim() || replyLocked}
                loading={addNote.isPending}
                variant={mode === 'note' ? 'secondary' : 'default'}
              >
                {mode === 'note' ? 'Add note' : (
                  <>
                    Send <SendHorizontal />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <TemplatePicker
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        contactName={contactName}
        sending={send.isPending}
        onSend={sendTemplate}
      />
    </div>
  );
}
