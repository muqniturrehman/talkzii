import type { VariableMapping, VariableSource } from '@talkzi/shared';
import type { TemplateSendValues } from '@talkzi/whatsapp/templates';

export interface RecipientContact {
  name: string | null;
  profile_name: string | null;
  wa_id: string;
  custom_fields: unknown;
}

/** One variable for one contact. Never empty — WhatsApp rejects blank parameters. */
export function resolveVariable(source: VariableSource, contact: RecipientContact): string {
  const fullName = (contact.name ?? contact.profile_name ?? '').trim();
  let value: string;
  switch (source.source) {
    case 'contact.name':
      value = fullName || source.fallback;
      break;
    case 'contact.first_name':
      value = fullName.split(/\s+/)[0] || source.fallback;
      break;
    case 'contact.phone':
      value = `+${contact.wa_id}`;
      break;
    case 'custom_field': {
      const fields = (contact.custom_fields && typeof contact.custom_fields === 'object' ? contact.custom_fields : {}) as Record<string, unknown>;
      const raw = fields[source.key];
      value = raw === null || raw === undefined || raw === '' ? source.fallback : String(raw);
      break;
    }
    case 'static':
      value = source.value;
      break;
  }
  return value.trim() || '-';
}

/** Template values (header/body/buttons/media) for one recipient. */
export function resolveTemplateValues(mapping: VariableMapping, contact: RecipientContact): TemplateSendValues {
  return {
    header: mapping.header.length ? mapping.header.map((s) => resolveVariable(s, contact)) : undefined,
    body: mapping.body.length ? mapping.body.map((s) => resolveVariable(s, contact)) : undefined,
    buttons: Object.keys(mapping.buttons).length
      ? Object.fromEntries(Object.entries(mapping.buttons).map(([index, s]) => [Number(index), resolveVariable(s, contact)]))
      : undefined,
    headerMedia: mapping.headerMediaUrl ? { link: mapping.headerMediaUrl } : undefined,
  };
}
