'use client';

import * as React from 'react';
import { AlertCircle, Bot, Check, CheckCheck, Clock, FileText, MapPin, Trash2 } from 'lucide-react';
import { cn } from '@talkzi/ui/lib/utils';
import { SimpleTooltip } from '@talkzi/ui/tooltip';
import { parseMessageMedia } from '@/lib/inbox/media';
import type { MessageItem, NoteItem } from '@/lib/inbox/types';
import { WhatsAppText } from '@/lib/inbox/whatsapp-format';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function StatusTicks({ message }: { message: MessageItem }) {
  if (message.direction !== 'outbound') return null;
  switch (message.status) {
    case 'queued':
      return <Clock className="size-3.5" aria-label="Sending" />;
    case 'sent':
      return <Check className="size-3.5" aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck className="size-3.5" aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className="size-3.5 text-sky-500" aria-label="Read" />;
    case 'failed':
      return (
        <SimpleTooltip label={message.error_message ?? 'Failed to send'}>
          <AlertCircle className="size-3.5 text-danger" aria-label={`Failed: ${message.error_message ?? 'unknown error'}`} />
        </SimpleTooltip>
      );
    default:
      return null;
  }
}

function MediaContent({ message }: { message: MessageItem }) {
  const media = parseMessageMedia(message.media);
  const pending = message.id.startsWith('temp-');
  if (!media || pending) return null;
  const src = `/api/media/${message.id}`;

  switch (message.type) {
    case 'image':
    case 'sticker':
      return (
        <a href={src} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived media URLs */}
          <img
            src={src}
            alt={media.caption ?? 'Photo'}
            loading="lazy"
            className={cn('rounded-xl object-cover', message.type === 'sticker' ? 'size-32 bg-transparent' : 'max-h-80 w-full max-w-xs')}
          />
        </a>
      );
    case 'video':
      return <video src={src} controls preload="metadata" className="max-h-80 w-full max-w-xs rounded-xl" />;
    case 'audio':
      return <audio src={src} controls preload="none" className="w-60 max-w-full" />;
    case 'document':
      return (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-black/5 p-2 text-sm hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <FileText className="size-5 shrink-0 text-primary" />
          <span className="truncate">{media.filename ?? 'Document'}</span>
        </a>
      );
    default:
      return null;
  }
}

function LocationContent({ message }: { message: MessageItem }) {
  const loc = (message.content as { location?: { latitude?: number; longitude?: number; name?: string; address?: string } } | null)?.location;
  if (!loc?.latitude || !loc.longitude) return null;
  return (
    <a
      href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-xl bg-black/5 p-2 text-sm hover:bg-black/10 dark:bg-white/5"
    >
      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <span className="block font-medium">{loc.name ?? 'Shared location'}</span>
        {loc.address ? <span className="block text-xs text-muted-foreground">{loc.address}</span> : null}
      </span>
    </a>
  );
}

function InteractiveButtons({ message }: { message: MessageItem }) {
  const interactive = (message.content as { interactive?: { buttons?: { id: string; title: string }[]; rows?: { id: string; title: string }[]; buttonText?: string } } | null)
    ?.interactive;
  if (interactive?.rows?.length) {
    return (
      <div className="mt-2 rounded-lg border border-primary/30 px-3 py-1 text-center text-xs font-medium text-primary dark:text-accent" title={interactive.rows.map((r) => r.title).join(', ')}>
        ☰ {interactive.buttonText ?? 'Options'} · {interactive.rows.length} options
      </div>
    );
  }
  const buttons = interactive?.buttons;
  if (!buttons?.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {buttons.map((b) => (
        <span key={b.id} className="rounded-lg border border-primary/30 px-3 py-1 text-center text-xs font-medium text-primary dark:text-accent">
          {b.title}
        </span>
      ))}
    </div>
  );
}

export function MessageBubble({ message, quoted }: { message: MessageItem; quoted?: MessageItem | null }) {
  const outbound = message.direction === 'outbound';
  if (message.type === 'reaction') {
    return (
      <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
        <span className="rounded-full bg-muted px-2 py-0.5 text-sm" title="Reaction">
          {message.body}
        </span>
      </div>
    );
  }

  const showBody = message.body && !(message.type === 'location' || (parseMessageMedia(message.media) && !parseMessageMedia(message.media)?.caption && message.type !== 'template'));

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%]',
          outbound ? 'rounded-br-md bg-bubble-out' : 'rounded-bl-md bg-bubble-in',
          message.status === 'failed' && 'ring-1 ring-danger/50',
        )}
      >
        {message.sender_type === 'bot' ? (
          <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-primary dark:text-accent">
            <Bot className="size-3" /> Chatbot
          </span>
        ) : null}
        {quoted ? (
          <div className="mb-1 rounded-lg border-l-2 border-primary bg-black/5 px-2 py-1 text-xs text-muted-foreground dark:bg-white/5">
            <span className="line-clamp-2">{quoted.body ?? `[${quoted.type}]`}</span>
          </div>
        ) : null}
        {message.type === 'template' ? (
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Template</span>
        ) : null}
        <MediaContent message={message} />
        <LocationContent message={message} />
        {showBody ? (
          <p className="whitespace-pre-wrap break-words">
            <WhatsAppText text={message.body ?? ''} />
          </p>
        ) : null}
        <InteractiveButtons message={message} />
        <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          {time(message.created_at)}
          <StatusTicks message={message} />
        </span>
      </div>
    </div>
  );
}

export function NoteBubble({ note, canDelete, onDelete }: { note: NoteItem; canDelete: boolean; onDelete: () => void }) {
  return (
    <div className="flex justify-center">
      <div className="group relative w-full max-w-lg rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-warning">
          <span>Internal note · {note.author?.full_name ?? note.author?.email ?? 'Teammate'}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {time(note.created_at)}
            {canDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="rounded p-0.5 opacity-0 transition hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Delete note"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </span>
        </span>
        <p className="whitespace-pre-wrap break-words">
          <WhatsAppText text={note.body} />
        </p>
      </div>
    </div>
  );
}
