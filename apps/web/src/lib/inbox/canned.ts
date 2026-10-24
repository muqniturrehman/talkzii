/** Contact fields available to canned replies. */
export interface CannedContact {
  wa_id: string;
  name: string | null;
  profile_name: string | null;
}

/** Personalises canned replies: {{contact.name}}, {{contact.first_name}}, {{contact.phone}}. */
export function renderCannedReply(body: string, contact: CannedContact): string {
  const name = contact.name ?? contact.profile_name ?? '';
  return body
    .replace(/\{\{\s*contact\.name\s*\}\}/g, name || 'there')
    .replace(/\{\{\s*contact\.first_name\s*\}\}/g, name.split(' ')[0] || 'there')
    .replace(/\{\{\s*contact\.phone\s*\}\}/g, `+${contact.wa_id}`);
}
