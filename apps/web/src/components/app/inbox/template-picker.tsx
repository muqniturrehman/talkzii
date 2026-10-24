'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';
import { renderTemplatePreview, summarizeTemplate, type TemplateSummary } from '@talkzi/whatsapp/templates';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talkzi/ui/dialog';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Skeleton } from '@talkzi/ui/skeleton';
import { cn } from '@talkzi/ui/lib/utils';
import type { TemplateOption } from '@/lib/inbox/types';
import { WhatsAppText } from '@/lib/inbox/whatsapp-format';
import { useApprovedTemplates } from './use-inbox';

const buttonText = (button: TemplateSummary['buttons'][number] | undefined) =>
  button && 'text' in button ? button.text : 'Copy code';

export interface TemplateSendRequest {
  templateId: string;
  variables: { header?: string[]; body?: string[]; buttons?: Record<string, string>; headerMediaUrl?: string };
}

function TemplateForm({
  template,
  contactName,
  sending,
  onSend,
  onBack,
}: {
  template: TemplateOption;
  contactName: string | null;
  sending: boolean;
  onSend: (request: TemplateSendRequest) => void;
  onBack: () => void;
}) {
  const summary = React.useMemo(() => summarizeTemplate(template.components), [template.components]);
  const [header, setHeader] = React.useState<string[]>(() => summary.header.variables.map(() => ''));
  const [body, setBody] = React.useState<string[]>(() =>
    summary.body.variables.map((_, i) => (i === 0 && contactName ? contactName.split(' ')[0] ?? '' : '')),
  );
  const [buttons, setButtons] = React.useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = React.useState('');
  const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(summary.header.format);

  const preview = renderTemplatePreview(summary, { header, body });
  const complete =
    header.every((v) => v.trim()) &&
    body.every((v) => v.trim()) &&
    summary.dynamicUrlButtons.every((i) => buttons[String(i)]?.trim()) &&
    (!needsMedia || /^https:\/\//.test(mediaUrl));

  return (
    <form
      className="grid gap-5 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        onSend({
          templateId: template.id,
          variables: {
            ...(header.length ? { header } : {}),
            ...(body.length ? { body } : {}),
            ...(summary.dynamicUrlButtons.length ? { buttons } : {}),
            ...(needsMedia ? { headerMediaUrl: mediaUrl } : {}),
          },
        });
      }}
    >
      <div className="space-y-4">
        {needsMedia ? (
          <div className="space-y-1.5">
            <Label htmlFor="tpl-media">Header {summary.header.format.toLowerCase()} URL</Label>
            <Input id="tpl-media" type="url" placeholder="https://…" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
          </div>
        ) : null}
        {summary.header.variables.map((n, i) => (
          <div key={`h${n}`} className="space-y-1.5">
            <Label htmlFor={`tpl-h-${n}`}>Header {`{{${n}}}`}</Label>
            <Input
              id={`tpl-h-${n}`}
              maxLength={60}
              value={header[i] ?? ''}
              onChange={(e) => setHeader((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </div>
        ))}
        {summary.body.variables.map((n, i) => (
          <div key={`b${n}`} className="space-y-1.5">
            <Label htmlFor={`tpl-b-${n}`}>Body {`{{${n}}}`}</Label>
            <Input
              id={`tpl-b-${n}`}
              value={body[i] ?? ''}
              onChange={(e) => setBody((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </div>
        ))}
        {summary.dynamicUrlButtons.map((index) => (
          <div key={`btn${index}`} className="space-y-1.5">
            <Label htmlFor={`tpl-btn-${index}`}>URL suffix for “{buttonText(summary.buttons[index])}”</Label>
            <Input
              id={`tpl-btn-${index}`}
              value={buttons[String(index)] ?? ''}
              onChange={(e) => setButtons((prev) => ({ ...prev, [String(index)]: e.target.value }))}
            />
          </div>
        ))}
        {summary.header.variables.length + summary.body.variables.length + summary.dynamicUrlButtons.length === 0 && !needsMedia ? (
          <p className="text-sm text-muted-foreground">This template has no variables — it is ready to send.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="rounded-2xl bg-muted/50 p-3">
          <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-bubble-out px-3 py-2 text-sm shadow-sm">
            <p className="whitespace-pre-wrap break-words">
              <WhatsAppText text={preview} />
            </p>
            {summary.buttons.length ? (
              <div className="mt-2 flex flex-col gap-1">
                {summary.buttons.map((b, i) => (
                  <span key={i} className="rounded-lg border border-primary/30 px-3 py-1 text-center text-xs font-medium text-primary dark:text-accent">
                    {buttonText(b)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <DialogFooter className="md:col-span-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={!complete} loading={sending}>
          Send template
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TemplatePicker({
  open,
  onOpenChange,
  contactName,
  sending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string | null;
  sending: boolean;
  onSend: (request: TemplateSendRequest) => void;
}) {
  const templates = useApprovedTemplates(open);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');
  const selected = templates.data?.find((t) => t.id === selectedId) ?? null;
  const visible = (templates.data ?? []).filter((t) => t.name.includes(filter.toLowerCase().replace(/\s+/g, '_')));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelectedId(null);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{selected ? selected.name : 'Send a template'}</DialogTitle>
          <DialogDescription>
            {selected
              ? `${selected.category.toLowerCase()} · ${selected.language}`
              : 'Approved templates can be sent at any time, including outside the 24-hour window.'}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <TemplateForm
            key={selected.id}
            template={selected}
            contactName={contactName}
            sending={sending}
            onSend={onSend}
            onBack={() => setSelectedId(null)}
          />
        ) : templates.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (templates.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="No approved templates yet"
            description="Create a template and submit it to Meta for approval from the Templates page."
            action={
              <Button asChild variant="outline">
                <a href="/app/templates/new">Create template</a>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <Input placeholder="Filter templates" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter templates" />
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto scrollbar-thin">
              {visible.map((t) => {
                const text = summarizeTemplate(t.components).body.text;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        'w-full rounded-xl border border-border p-3 text-left transition hover:border-primary/50 hover:bg-muted/40',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{t.name}</span>
                        <span className="flex gap-1">
                          <Badge variant="secondary">{t.category.toLowerCase()}</Badge>
                          <Badge variant="outline">{t.language}</Badge>
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
