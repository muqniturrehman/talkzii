import { describe, expect, it } from 'vitest';
import {
  buildTemplateSendComponents,
  extractVariables,
  fillTemplateText,
  renderTemplatePreview,
  summarizeTemplate,
  tierLimit,
  validateBodyVariables,
} from '../src';

const components = [
  { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' },
  { type: 'BODY', text: 'Hi {{1}}, your order {{2}} ships on {{3}}.', example: { body_text: [['Ali', 'TZ-1', 'Friday']] } },
  { type: 'FOOTER', text: 'Reply STOP to opt out' },
  {
    type: 'BUTTONS',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Thanks' },
      { type: 'URL', text: 'Track', url: 'https://demo.talkzi.app/track/{{1}}', example: ['https://demo.talkzi.app/track/TZ-1'] },
    ],
  },
];

describe('template variables', () => {
  it('extracts unique, sorted positional variables', () => {
    expect(extractVariables('Hi {{2}} and {{ 1 }}, again {{2}}')).toEqual([1, 2]);
    expect(extractVariables(null)).toEqual([]);
  });

  it('enforces Meta body rules', () => {
    expect(validateBodyVariables('Hi {{1}}, your order {{2}} is ready for pickup today.')).toEqual([]);
    expect(validateBodyVariables('Hi {{1}}, order {{3}} is ready now.')).toContain(
      'Variables must be numbered in order starting at {{1}} (found {{3}}).',
    );
    expect(validateBodyVariables('{{1}} you left items in your cart')).toContain('The body cannot start with a variable.');
    expect(validateBodyVariables('Your code is {{1}}')).toContain('The body cannot end with a variable.');
    expect(validateBodyVariables('Hello {{1}}{{2}} there friend, welcome back')).toContain('Variables cannot be placed next to each other.');
    expect(validateBodyVariables('Hi {{1}} {{2}} {{3}} ok')).toContain(
      'Add more text: there are too many variables for the length of the message.',
    );
  });

  it('fills values and keeps placeholders for missing ones', () => {
    expect(fillTemplateText('Hi {{1}}, code {{2}}', ['Sana'])).toBe('Hi Sana, code {{2}}');
  });
});

describe('summarize + build send components', () => {
  const summary = summarizeTemplate(components);

  it('summarises Meta-format components', () => {
    expect(summary.header).toEqual({ format: 'TEXT', text: 'Order {{1}}', variables: [1] });
    expect(summary.body.variables).toEqual([1, 2, 3]);
    expect(summary.footer).toBe('Reply STOP to opt out');
    expect(summary.dynamicUrlButtons).toEqual([1]);
  });

  it('builds header, body and dynamic URL button parameters', () => {
    expect(
      buildTemplateSendComponents(summary, { header: ['TZ-1'], body: ['Ali', 'TZ-1', 'Friday'], buttons: { 1: 'TZ-1' } }),
    ).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'TZ-1' }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ali' },
          { type: 'text', text: 'TZ-1' },
          { type: 'text', text: 'Friday' },
        ],
      },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'TZ-1' }] },
    ]);
  });

  it('throws when a variable has no value', () => {
    expect(() => buildTemplateSendComponents(summary, { header: ['x'], body: ['Ali'], buttons: { 1: 'x' } })).toThrow(/\{\{2\}\}, \{\{3\}\}/);
    expect(() => buildTemplateSendComponents(summary, { header: ['x'], body: ['a', 'b', 'c'] })).toThrow(/button 2/);
  });

  it('requires media for media headers', () => {
    const media = summarizeTemplate([{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'New arrivals are here, take a look!' }]);
    expect(() => buildTemplateSendComponents(media, {})).toThrow(/image header/);
    expect(buildTemplateSendComponents(media, { headerMedia: { link: 'https://x.test/a.jpg' } })).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x.test/a.jpg' } }] },
    ]);
  });

  it('renders a plain-text preview', () => {
    expect(renderTemplatePreview(summary, { header: ['TZ-1'], body: ['Ali', 'TZ-1', 'Friday'] })).toBe(
      'Order TZ-1\n\nHi Ali, your order TZ-1 ships on Friday.\n\nReply STOP to opt out',
    );
  });
});

describe('messaging tiers', () => {
  it('maps tiers to daily limits with a safe default', () => {
    expect(tierLimit('TIER_1K')).toBe(1000);
    expect(tierLimit('TIER_UNLIMITED')).toBe(Number.POSITIVE_INFINITY);
    expect(tierLimit(null)).toBe(250);
  });
});
