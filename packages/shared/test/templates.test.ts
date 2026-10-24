import { describe, expect, it } from 'vitest';
import { componentsToDraft, draftToComponents, isTemplateLocked, templateDraftSchema, toTemplateName } from '../src/schemas/templates';

const base = {
  name: 'order_update',
  category: 'UTILITY' as const,
  language: 'en',
  body: { text: 'Hi {{1}}, your order {{2}} is on its way.', examples: ['Ayesha', '#1042'] },
};

describe('template drafts', () => {
  it('converts a full draft into Meta components and back', () => {
    const draft = templateDraftSchema.parse({
      ...base,
      header: { type: 'TEXT', text: 'Order {{1}}', example: '#1042' },
      footer: 'Reply STOP to opt out',
      buttons: [
        { type: 'URL', text: 'Track order', url: 'https://shop.pk/track/{{1}}', example: 'https://shop.pk/track/1042' },
        { type: 'PHONE_NUMBER', text: 'Call us', phone: '+923001234567' },
      ],
    });
    const components = draftToComponents(draft);
    expect(components).toEqual([
      { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}', example: { header_text: ['#1042'] } },
      { type: 'BODY', text: base.body.text, example: { body_text: [['Ayesha', '#1042']] } },
      { type: 'FOOTER', text: 'Reply STOP to opt out' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'Track order', url: 'https://shop.pk/track/{{1}}', example: ['https://shop.pk/track/1042'] },
          { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+923001234567' },
        ],
      },
    ]);
    const roundTrip = templateDraftSchema.parse(componentsToDraft({ name: draft.name, category: draft.category, language: draft.language }, components));
    expect(draftToComponents(roundTrip)).toEqual(components);
  });

  it("enforces Meta's variable, sample and button rules", () => {
    const issues = (input: object) => templateDraftSchema.safeParse({ ...base, ...input }).error?.issues.map((i) => i.message) ?? [];
    expect(issues({ body: { text: '{{1}} is ready', examples: ['x'] } })).toContain('The body cannot start with a variable.');
    expect(issues({ body: { text: 'Hi {{2}}, welcome to our shop today', examples: ['x'] } })[0]).toMatch(/numbered in order/);
    expect(issues({ body: { text: 'Hi {{1}}, your order is ready', examples: [] } })).toContain('Add a sample value for {{1}}');
    expect(
      issues({
        buttons: [
          { type: 'QUICK_REPLY', text: 'Yes' },
          { type: 'URL', text: 'Shop', url: 'https://shop.pk' },
          { type: 'QUICK_REPLY', text: 'No' },
        ],
      }),
    ).toContain('Keep quick replies together, before or after the other buttons');
    expect(issues({ buttons: [{ type: 'URL', text: 'Track', url: 'https://shop.pk/{{1}}' }] })).toContain('Add an example URL');
  });

  it('builds authentication templates from options only', () => {
    const draft = templateDraftSchema.parse({ name: 'login_code', category: 'AUTHENTICATION', language: 'en', body: {}, auth: { codeExpirationMinutes: 10 } });
    expect(draftToComponents(draft)).toEqual([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
    ]);
  });

  it('names and locks templates', () => {
    expect(toTemplateName('Eid Sale 2026!')).toBe('eid_sale_2026');
    expect(isTemplateLocked('APPROVED')).toBe(true);
    expect(isTemplateLocked('REJECTED')).toBe(false);
    expect(isTemplateLocked('DRAFT')).toBe(false);
  });
});
