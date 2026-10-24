import { normalizePhone, type ImportRow } from '@talkzi/shared';

export interface PreparedImportRow {
  row_number: number;
  wa_id: string;
  name: string | null;
  email: string | null;
  custom_fields: Record<string, string>;
  labels: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalises phones (workspace default country code), validates emails and
 * de-duplicates numbers within the batch (first occurrence wins).
 */
export function prepareImportRows(rows: ImportRow[], defaultCountryCode: string) {
  const valid: PreparedImportRow[] = [];
  const invalid: { row: number; reason: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const waId = normalizePhone(row.phone, defaultCountryCode);
    if (!waId) {
      invalid.push({ row: row.row, reason: row.phone.trim() ? `Invalid phone number “${row.phone.trim().slice(0, 32)}”` : 'Missing phone number' });
      continue;
    }
    if (seen.has(waId)) {
      invalid.push({ row: row.row, reason: `Duplicate of an earlier row (+${waId})` });
      continue;
    }
    const email = row.email?.trim() || null;
    if (email && !EMAIL_RE.test(email)) {
      invalid.push({ row: row.row, reason: `Invalid email “${email.slice(0, 64)}”` });
      continue;
    }
    seen.add(waId);
    valid.push({
      row_number: row.row,
      wa_id: waId,
      name: row.name?.trim() || null,
      email,
      custom_fields: Object.fromEntries(Object.entries(row.customFields ?? {}).filter(([k, v]) => k.trim() && v.trim())),
      labels: [...new Set((row.labels ?? []).map((l) => l.trim()).filter(Boolean))],
    });
  }
  return { valid, invalid };
}

/** Escapes one CSV cell (RFC 4180) and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
