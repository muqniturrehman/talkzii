import { z } from 'zod';
import { extractVariables, validateBodyVariables } from '@talkzi/whatsapp/templates';
import type { TemplateButtonDefinition, TemplateComponentDefinition } from '@talkzi/whatsapp/types';

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_META: Record<TemplateCategoryId, { label: string; description: string; examples: string }> = {
  MARKETING: {
    label: 'Marketing',
    description: 'Promotions, offers, product launches, re-engagement and newsletters.',
    examples: 'Eid sale, new arrivals, abandoned cart reminders',
  },
  UTILITY: {
    label: 'Utility',
    description: 'Updates about an existing order, booking or account the customer asked for.',
    examples: 'Order confirmed, out for delivery, appointment reminder',
  },
  AUTHENTICATION: {
    label: 'Authentication',
    description: 'One-time passcodes for login or verification. Meta provides the wording.',
    examples: 'Login code, account verification',
  },
};

/** Languages offered in the template wizard (WhatsApp language codes). */
export const TEMPLATE_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'fa', label: 'Persian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt_BR', label: 'Portuguese (BR)' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh_CN', label: 'Chinese (Simplified)' },
];

export const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;

/** "Eid Sale 2026!" → "eid_sale_2026" */
export function toTemplateName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512);
}

const buttonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal('URL'),
    text: z.string().trim().min(1).max(25),
    url: z.string().trim().url().max(2000),
    /** Full example URL when the URL ends with {{1}}. */
    example: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().trim().min(1).max(25),
    phone: z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, 'Use international format, e.g. +923001234567'),
  }),
  z.object({ type: z.literal('COPY_CODE'), example: z.string().trim().min(1).max(15) }),
]);
export type TemplateButtonDraft = z.infer<typeof buttonSchema>;

const headerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NONE') }),
  z.object({ type: z.literal('TEXT'), text: z.string().trim().min(1).max(60), example: z.string().trim().max(60).optional() }),
  z.object({
    type: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
    /** Resumable-upload handle from /api/templates/media (required by Meta for review). */
    handle: z.string().max(2000).optional(),
    /** Public sample shown in Talkzi previews. */
    previewUrl: z.string().url().optional(),
  }),
]);
export type TemplateHeaderDraft = z.infer<typeof headerSchema>;

export const templateDraftSchema = z
  .object({
    name: z.string().trim().regex(TEMPLATE_NAME_RE, 'Lowercase letters, numbers and underscores only'),
    category: z.enum(TEMPLATE_CATEGORIES),
    language: z.string().trim().min(2).max(10),
    header: headerSchema.default({ type: 'NONE' }),
    body: z.object({
      text: z.string().trim().max(1024).default(''),
      /** Sample value per {{n}}, in order. */
      examples: z.array(z.string().trim().max(200)).max(20).default([]),
    }),
    footer: z.string().trim().max(60).optional(),
    buttons: z.array(buttonSchema).max(10).default([]),
    /** Authentication templates only. */
    auth: z
      .object({
        addSecurityRecommendation: z.boolean().default(true),
        codeExpirationMinutes: z.number().int().min(1).max(90).optional(),
        buttonText: z.string().trim().min(1).max(25).default('Copy code'),
      })
      .optional(),
  })
  .superRefine((draft, ctx) => {
    if (draft.category === 'AUTHENTICATION') return;
    if (!draft.body.text) ctx.addIssue({ code: 'custom', path: ['body', 'text'], message: 'Write the message body' });

    for (const message of validateBodyVariables(draft.body.text)) {
      ctx.addIssue({ code: 'custom', path: ['body', 'text'], message });
    }
    const vars = extractVariables(draft.body.text);
    vars.forEach((n, i) => {
      if (!draft.body.examples[i]?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['body', 'examples', i], message: `Add a sample value for {{${n}}}` });
      }
    });

    if (draft.header.type === 'TEXT') {
      const headerVars = extractVariables(draft.header.text);
      if (headerVars.length > 1 || (headerVars[0] !== undefined && headerVars[0] !== 1)) {
        ctx.addIssue({ code: 'custom', path: ['header', 'text'], message: 'A text header can contain one variable, {{1}}' });
      }
      if (headerVars.length === 1 && !draft.header.example) {
        ctx.addIssue({ code: 'custom', path: ['header', 'example'], message: 'Add a sample value for the header variable' });
      }
    }

    const count = (type: TemplateButtonDraft['type']) => draft.buttons.filter((b) => b.type === type).length;
    if (count('URL') > 2) ctx.addIssue({ code: 'custom', path: ['buttons'], message: 'Up to 2 website buttons' });
    if (count('PHONE_NUMBER') > 1) ctx.addIssue({ code: 'custom', path: ['buttons'], message: 'Only 1 call button' });
    if (count('COPY_CODE') > 1) ctx.addIssue({ code: 'custom', path: ['buttons'], message: 'Only 1 copy-code button' });
    // Quick replies must be grouped together (not interleaved with call-to-action buttons).
    const kinds = draft.buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'q' : 'c')).join('');
    if (/q+c+q|c+q+c/.test(kinds)) {
      ctx.addIssue({ code: 'custom', path: ['buttons'], message: 'Keep quick replies together, before or after the other buttons' });
    }
    draft.buttons.forEach((b, i) => {
      if (b.type === 'URL' && extractVariables(b.url).length > 0) {
        if (!/\{\{1\}\}$/.test(b.url)) ctx.addIssue({ code: 'custom', path: ['buttons', i, 'url'], message: 'A URL variable must be {{1}} at the end' });
        if (!b.example) ctx.addIssue({ code: 'custom', path: ['buttons', i, 'example'], message: 'Add an example URL' });
      }
    });
  });
export type TemplateDraft = z.infer<typeof templateDraftSchema>;
export type TemplateDraftInput = z.input<typeof templateDraftSchema>;

/** Converts a wizard draft into Meta's template component definitions. */
export function draftToComponents(draft: TemplateDraft): TemplateComponentDefinition[] {
  if (draft.category === 'AUTHENTICATION') {
    // Meta writes the wording of authentication templates; we only choose options.
    const auth = draft.auth ?? { addSecurityRecommendation: true, buttonText: 'Copy code' };
    return [
      { type: 'BODY', add_security_recommendation: auth.addSecurityRecommendation },
      ...(auth.codeExpirationMinutes ? [{ type: 'FOOTER', code_expiration_minutes: auth.codeExpirationMinutes }] : []),
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: auth.buttonText }] },
    ] as unknown as TemplateComponentDefinition[];
  }

  const components: TemplateComponentDefinition[] = [];
  const h = draft.header;
  if (h.type === 'TEXT') {
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: h.text,
      ...(extractVariables(h.text).length && h.example ? { example: { header_text: [h.example] } } : {}),
    });
  } else if (h.type !== 'NONE') {
    components.push({ type: 'HEADER', format: h.type, ...(h.handle ? { example: { header_handle: [h.handle] } } : {}) });
  }

  const vars = extractVariables(draft.body.text);
  components.push({
    type: 'BODY',
    text: draft.body.text,
    ...(vars.length ? { example: { body_text: [vars.map((_, i) => draft.body.examples[i] ?? '')] } } : {}),
  });
  if (draft.footer) components.push({ type: 'FOOTER', text: draft.footer });

  if (draft.buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: draft.buttons.map((b): TemplateButtonDefinition => {
        switch (b.type) {
          case 'QUICK_REPLY':
            return { type: 'QUICK_REPLY', text: b.text };
          case 'URL':
            return { type: 'URL', text: b.text, url: b.url, ...(b.example ? { example: [b.example] } : {}) };
          case 'PHONE_NUMBER':
            return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone.startsWith('+') ? b.phone : `+${b.phone}` };
          case 'COPY_CODE':
            return { type: 'COPY_CODE', example: b.example };
        }
      }),
    });
  }
  return components;
}

/** Best-effort inverse of draftToComponents, for editing stored templates. */
export function componentsToDraft(
  meta: { name: string; category: string; language: string },
  components: unknown,
): TemplateDraftInput {
  const list = (Array.isArray(components) ? components : []) as (TemplateComponentDefinition & Record<string, unknown>)[];
  const header = list.find((c) => c.type === 'HEADER');
  const body = list.find((c) => c.type === 'BODY') as { text?: string; example?: { body_text?: string[][] } } | undefined;
  const footer = list.find((c) => c.type === 'FOOTER') as { text?: string } | undefined;
  const buttons = (list.find((c) => c.type === 'BUTTONS') as { buttons?: TemplateButtonDefinition[] } | undefined)?.buttons ?? [];

  let headerDraft: TemplateHeaderDraft = { type: 'NONE' };
  if (header && 'format' in header) {
    if (header.format === 'TEXT' && 'text' in header) {
      headerDraft = { type: 'TEXT', text: header.text, example: header.example?.header_text?.[0] };
    } else if (header.format === 'IMAGE' || header.format === 'VIDEO' || header.format === 'DOCUMENT') {
      headerDraft = { type: header.format, handle: 'example' in header ? header.example?.header_handle?.[0] : undefined };
    }
  }

  return {
    name: meta.name,
    category: (TEMPLATE_CATEGORIES as readonly string[]).includes(meta.category) ? (meta.category as TemplateCategoryId) : 'UTILITY',
    language: meta.language,
    header: headerDraft,
    body: { text: body?.text ?? '', examples: body?.example?.body_text?.[0] ?? [] },
    footer: footer?.text || undefined,
    buttons: buttons.flatMap((b): TemplateButtonDraft[] => {
      switch (b.type) {
        case 'QUICK_REPLY':
          return [{ type: 'QUICK_REPLY', text: b.text }];
        case 'URL':
          return [{ type: 'URL', text: b.text, url: b.url, example: b.example?.[0] }];
        case 'PHONE_NUMBER':
          return [{ type: 'PHONE_NUMBER', text: b.text, phone: b.phone_number }];
        case 'COPY_CODE':
          return [{ type: 'COPY_CODE', example: b.example }];
        default:
          return [];
      }
    }),
  };
}

/** Statuses that freeze a template (no edits — duplicate it instead). */
export const LOCKED_TEMPLATE_STATUSES = ['APPROVED', 'PENDING', 'IN_APPEAL', 'PAUSED', 'DISABLED', 'PENDING_DELETION'] as const;
export const isTemplateLocked = (status: string) => (LOCKED_TEMPLATE_STATUSES as readonly string[]).includes(status);

export const saveTemplateSchema = z.object({
  draft: templateDraftSchema,
  submit: z.boolean().default(false),
  wabaAccountId: z.uuid().optional(),
});
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

export const templateMediaSchema = z.object({
  storagePath: z.string().min(10).max(500),
  mimeType: z.enum(['image/jpeg', 'image/png', 'video/mp4', 'application/pdf']),
  filename: z.string().min(1).max(240),
});
