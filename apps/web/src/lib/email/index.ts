import 'server-only';
import { Resend } from 'resend';
import { logger } from '@/lib/logger';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

let resend: Resend | null = null;

/** Sends via Resend; logs to the console when RESEND_API_KEY is not set. */
export async function sendEmail(message: EmailMessage): Promise<{ id: string; delivered: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.info({ to: message.to, subject: message.subject, text: message.text }, '[email stub] RESEND_API_KEY not set');
    return { id: 'console', delivered: false };
  }
  resend ??= new Resend(key);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Talkzi <onboarding@resend.dev>',
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  if (error) {
    logger.error({ err: error, to: message.to }, 'Failed to send email');
    throw new Error(error.message);
  }
  return { id: data?.id ?? 'unknown', delivered: true };
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Minimal, client-safe branded layout (inline styles for email clients). */
function layout(title: string, bodyHtml: string, brand = 'Talkzi'): string {
  return `<!doctype html><html><body style="margin:0;background:#0A0A0F;font-family:Inter,Segoe UI,Arial,sans-serif;color:#FFFFFF">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
  <tr><td align="center"><table role="presentation" width="100%" style="max-width:520px;background:#141420;border:1px solid #2A2A3A;border-radius:16px;padding:32px">
  <tr><td><p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#A78BFA">${escape(brand)}</p>
  <h1 style="margin:0 0 16px;font-size:22px">${escape(title)}</h1>${bodyHtml}
  <p style="margin:32px 0 0;font-size:12px;color:#B4B4C7">You received this email because of activity on ${escape(brand)}. If this wasn't you, you can ignore it.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#6D28D9);color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${escape(label)}</a></p>`;
}

export function invitationEmail(input: {
  workspaceName: string;
  inviterName: string;
  role: string;
  url: string;
  brandName?: string;
}): Omit<EmailMessage, 'to'> {
  const subject = `${input.inviterName} invited you to ${input.workspaceName} on ${input.brandName ?? 'Talkzi'}`;
  const html = layout(
    `Join ${input.workspaceName}`,
    `<p style="color:#B4B4C7;line-height:1.6">${escape(input.inviterName)} invited you to join <strong style="color:#fff">${escape(input.workspaceName)}</strong> as <strong style="color:#fff">${escape(input.role)}</strong>.</p>${button(input.url, 'Accept invitation')}<p style="color:#B4B4C7;font-size:13px">This link expires in 7 days.</p>`,
    input.brandName,
  );
  const text = `${input.inviterName} invited you to join ${input.workspaceName} as ${input.role}.\nAccept: ${input.url}\nThis link expires in 7 days.`;
  return { subject, html, text };
}

export function simpleEmail(title: string, paragraphs: string[], cta?: { url: string; label: string }): Omit<EmailMessage, 'to'> {
  const html = layout(
    title,
    paragraphs.map((p) => `<p style="color:#B4B4C7;line-height:1.6">${escape(p)}</p>`).join('') + (cta ? button(cta.url, cta.label) : ''),
  );
  const text = [...paragraphs, cta ? `${cta.label}: ${cta.url}` : ''].filter(Boolean).join('\n\n');
  return { subject: title, html, text };
}
