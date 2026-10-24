import type {
  MediaRef,
  TemplateButtonDefinition,
  TemplateComponentDefinition,
  TemplateSendComponent,
} from './types';

export const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
export const TEMPLATE_LIMITS = {
  name: 512,
  headerText: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  quickReplies: 10,
  urlButtons: 2,
  phoneButtons: 1,
  totalButtons: 10,
} as const;

const VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;

/** Positional variable indexes used in a text, e.g. "Hi {{1}}, {{2}}" → [1, 2]. */
export function extractVariables(text: string | null | undefined): number[] {
  if (!text) return [];
  const found = new Set<number>();
  for (const match of text.matchAll(VARIABLE)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

/**
 * Meta's rules for positional variables in a body: numbered 1..n without gaps,
 * not at the very start or end, and never directly adjacent ("{{1}}{{2}}").
 */
export function validateBodyVariables(text: string): string[] {
  const errors: string[] = [];
  const vars = extractVariables(text);
  vars.forEach((n, i) => {
    if (n !== i + 1) errors.push(`Variables must be numbered in order starting at {{1}} (found {{${n}}}).`);
  });
  const trimmed = text.trim();
  if (/^\{\{\s*\d+\s*\}\}/.test(trimmed)) errors.push('The body cannot start with a variable.');
  if (/\{\{\s*\d+\s*\}\}[.!?]?$/.test(trimmed)) errors.push('The body cannot end with a variable.');
  if (/\}\}\s*\{\{/.test(text)) errors.push('Variables cannot be placed next to each other.');
  const words = trimmed.replace(VARIABLE, ' ').split(/\s+/).filter(Boolean).length;
  if (vars.length > 0 && words < vars.length * 2 + 1) {
    errors.push('Add more text: there are too many variables for the length of the message.');
  }
  return [...new Set(errors)];
}

/** Replaces {{n}} with values[n-1] (or a visible placeholder) — used for previews. */
export function fillTemplateText(
  text: string,
  values: ReadonlyArray<string | null | undefined> = [],
  placeholder: (n: number) => string = (n) => `{{${n}}}`,
): string {
  return text.replace(VARIABLE, (_, n: string) => {
    const value = values[Number(n) - 1];
    return value !== undefined && value !== null && value !== '' ? value : placeholder(Number(n));
  });
}

export type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

export interface TemplateSummary {
  header: { format: HeaderFormat; text: string | null; variables: number[] };
  body: { text: string; variables: number[] };
  footer: string | null;
  buttons: TemplateButtonDefinition[];
  /** Dynamic URL buttons ("https://x.com/{{1}}") by button index. */
  dynamicUrlButtons: number[];
}

/** Reads Meta-format template components (as stored in message_templates.components). */
export function summarizeTemplate(components: unknown): TemplateSummary {
  const list = (Array.isArray(components) ? components : []) as TemplateComponentDefinition[];
  const header = list.find((c) => c.type === 'HEADER');
  const body = list.find((c) => c.type === 'BODY');
  const footer = list.find((c) => c.type === 'FOOTER');
  const buttons = list.find((c) => c.type === 'BUTTONS');
  const headerText = header && 'text' in header ? header.text : null;
  const bodyText = body && 'text' in body ? body.text : '';
  const buttonList = buttons && 'buttons' in buttons ? buttons.buttons : [];

  return {
    header: {
      format: (header && 'format' in header ? header.format : 'NONE') as HeaderFormat,
      text: headerText,
      variables: extractVariables(headerText),
    },
    body: { text: bodyText, variables: extractVariables(bodyText) },
    footer: footer && 'text' in footer ? footer.text : null,
    buttons: buttonList,
    dynamicUrlButtons: buttonList.flatMap((b, i) => (b.type === 'URL' && extractVariables(b.url).length > 0 ? [i] : [])),
  };
}

export interface TemplateSendValues {
  header?: string[];
  headerMedia?: MediaRef & { filename?: string };
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  body?: string[];
  /** URL suffix per dynamic URL button index. */
  buttons?: Record<number, string>;
}

/**
 * Builds the `components` array for sending a template, validating that every
 * variable has a value. Throws with a descriptive message otherwise.
 */
export function buildTemplateSendComponents(summary: TemplateSummary, values: TemplateSendValues): TemplateSendComponent[] {
  const components: TemplateSendComponent[] = [];
  const text = (v: string) => ({ type: 'text' as const, text: v });

  if (summary.header.format === 'TEXT' && summary.header.variables.length > 0) {
    const header = values.header ?? [];
    if (header.length < summary.header.variables.length || header.some((v) => !v)) {
      throw new Error('Missing value for the header variable.');
    }
    components.push({ type: 'header', parameters: header.slice(0, summary.header.variables.length).map(text) });
  } else if (summary.header.format === 'IMAGE' || summary.header.format === 'VIDEO' || summary.header.format === 'DOCUMENT') {
    if (!values.headerMedia) throw new Error(`This template needs a ${summary.header.format.toLowerCase()} header.`);
    const media = values.headerMedia;
    components.push({
      type: 'header',
      parameters: [
        summary.header.format === 'IMAGE'
          ? { type: 'image', image: media }
          : summary.header.format === 'VIDEO'
            ? { type: 'video', video: media }
            : { type: 'document', document: media },
      ],
    });
  } else if (summary.header.format === 'LOCATION') {
    if (!values.headerLocation) throw new Error('This template needs a location header.');
    components.push({ type: 'header', parameters: [{ type: 'location', location: values.headerLocation }] });
  }

  if (summary.body.variables.length > 0) {
    const body = values.body ?? [];
    const missing = summary.body.variables.filter((n) => !body[n - 1]);
    if (missing.length) throw new Error(`Missing value for body variable(s): ${missing.map((n) => `{{${n}}}`).join(', ')}.`);
    components.push({ type: 'body', parameters: summary.body.variables.map((n) => text(body[n - 1] as string)) });
  }

  for (const index of summary.dynamicUrlButtons) {
    const suffix = values.buttons?.[index];
    if (!suffix) throw new Error(`Missing URL value for button ${index + 1}.`);
    components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [text(suffix)] });
  }

  return components;
}

/** Renders the template as plain text (for message history and previews). */
export function renderTemplatePreview(summary: TemplateSummary, values: TemplateSendValues = {}): string {
  const parts = [
    summary.header.format === 'TEXT' && summary.header.text ? fillTemplateText(summary.header.text, values.header) : null,
    fillTemplateText(summary.body.text, values.body),
    summary.footer,
  ].filter(Boolean);
  return parts.join('\n\n');
}

/** Daily unique-recipient limits for business-initiated messages per tier. */
export const MESSAGING_TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

/** Unknown/new numbers start at the 250 tier. */
export function tierLimit(tier: string | null | undefined): number {
  return (tier && MESSAGING_TIER_LIMITS[tier]) || 250;
}
