'use client';

import * as React from 'react';
import { Copy, ExternalLink, FileText, ImageIcon, Phone, PlayCircle, Reply } from 'lucide-react';
import { fillTemplateText, summarizeTemplate } from '@talkzi/whatsapp/templates';
import type { TemplateButtonDefinition } from '@talkzi/whatsapp/types';
import { cn } from '@talkzi/ui/lib/utils';
import { WhatsAppText } from '@/lib/inbox/whatsapp-format';

function ButtonIcon({ button }: { button: TemplateButtonDefinition }) {
  switch (button.type) {
    case 'URL':
      return <ExternalLink className="size-3.5" />;
    case 'PHONE_NUMBER':
      return <Phone className="size-3.5" />;
    case 'COPY_CODE':
    case 'OTP':
      return <Copy className="size-3.5" />;
    default:
      return <Reply className="size-3.5" />;
  }
}

const buttonLabel = (b: TemplateButtonDefinition) => ('text' in b && b.text ? b.text : b.type === 'COPY_CODE' ? 'Copy offer code' : 'Copy code');

/**
 * WhatsApp-style rendering of Meta template components. `values` fill the
 * {{n}} placeholders (defaults to the template's own examples).
 */
export function TemplatePreview({
  components,
  values,
  mediaUrl,
  businessName = 'Your business',
  className,
}: {
  components: unknown;
  values?: { header?: string[]; body?: string[] };
  mediaUrl?: string | null;
  businessName?: string;
  className?: string;
}) {
  const summary = React.useMemo(() => summarizeTemplate(components), [components]);
  const list = (Array.isArray(components) ? components : []) as Record<string, unknown>[];
  const bodyComponent = list.find((c) => c.type === 'BODY') as { example?: { body_text?: string[][] }; add_security_recommendation?: boolean } | undefined;
  const headerComponent = list.find((c) => c.type === 'HEADER') as { example?: { header_text?: string[] } } | undefined;
  const footerComponent = list.find((c) => c.type === 'FOOTER') as { code_expiration_minutes?: number } | undefined;
  const isAuth = summary.buttons.some((b) => b.type === 'OTP');

  const bodyValues = values?.body ?? bodyComponent?.example?.body_text?.[0];
  const headerValues = values?.header ?? headerComponent?.example?.header_text;
  const body = isAuth
    ? `*123456* is your verification code.${bodyComponent?.add_security_recommendation ? ' For your security, do not share this code.' : ''}`
    : fillTemplateText(summary.body.text, bodyValues);
  const footer = isAuth && footerComponent?.code_expiration_minutes ? `This code expires in ${footerComponent.code_expiration_minutes} minutes.` : summary.footer;

  return (
    <div className={cn('rounded-[2rem] border border-border bg-muted/40 p-3 shadow-glow', className)} aria-label="Template preview">
      <div className="flex items-center gap-2 rounded-t-[1.5rem] bg-primary/90 px-4 py-3 text-primary-foreground">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">{businessName[0]?.toUpperCase()}</span>
        <span className="text-sm font-semibold">{businessName}</span>
      </div>
      <div className="min-h-64 space-y-2 rounded-b-[1.5rem] bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:18px_18px] p-3">
        <div className="max-w-[92%] overflow-hidden rounded-2xl rounded-tl-md bg-bubble-in text-sm shadow-sm">
          {summary.header.format === 'IMAGE' || summary.header.format === 'VIDEO' || summary.header.format === 'DOCUMENT' ? (
            mediaUrl && summary.header.format === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-provided sample (signed URL)
              <img src={mediaUrl} alt="Header sample" className="max-h-48 w-full object-cover" />
            ) : (
              <div className="flex h-32 items-center justify-center bg-primary/10 text-primary">
                {summary.header.format === 'IMAGE' ? <ImageIcon className="size-8" /> : summary.header.format === 'VIDEO' ? <PlayCircle className="size-8" /> : <FileText className="size-8" />}
              </div>
            )
          ) : null}
          <div className="space-y-1 px-3 py-2">
            {summary.header.format === 'TEXT' && summary.header.text ? (
              <p className="font-semibold">
                <WhatsAppText text={fillTemplateText(summary.header.text, headerValues)} />
              </p>
            ) : null}
            <p className="whitespace-pre-wrap break-words">
              <WhatsAppText text={body || 'Your message will appear here…'} />
            </p>
            {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
            <p className="text-right text-[10px] text-muted-foreground">12:00</p>
          </div>
          {summary.buttons.length ? (
            <div className="divide-y divide-border border-t border-border">
              {summary.buttons.map((b, i) => (
                <div key={i} className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-sky-600 dark:text-sky-400">
                  <ButtonIcon button={b} /> {buttonLabel(b)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const TEMPLATE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'secondary' | 'info'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  IN_APPEAL: 'warning',
  REJECTED: 'danger',
  PAUSED: 'danger',
  DISABLED: 'danger',
  DRAFT: 'secondary',
};
