import { publicContactUpsertSchema, publicListQuerySchema, sanitizeSearchTerm } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createPublicHandler } from '@/lib/public-api/handler';
import { cursorFilter, decodeCursor, encodeCursor, upsertContactByPhone } from '@/lib/public-api/service';

/** GET /api/public/v1/contacts — newest first, cursor pagination, optional search. */
export const GET = createPublicHandler({ scope: 'contacts:read', query: publicListQuerySchema }, async ({ admin, key, query }) => {
  let q = admin
    .from('contacts')
    .select('id, wa_id, name, profile_name, email, opted_out, custom_fields, source, created_at, labels:contact_labels(label:labels(name))')
    .eq('workspace_id', key.workspace.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1);
  const cursor = decodeCursor(query.cursor);
  if (cursor) q = q.or(cursorFilter(cursor));
  const term = query.q ? sanitizeSearchTerm(query.q) : '';
  if (term) {
    const digits = term.replace(/\D/g, '');
    q = q.or([`name.ilike.*${term}*`, `email.ilike.*${term}*`, ...(digits.length >= 3 ? [`wa_id.like.*${digits}*`] : [])].join(','));
  }
  const { data, error } = await q;
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  const rows = data ?? [];
  const page = rows.slice(0, query.limit).map(({ labels, ...c }) => ({ ...c, phone: `+${c.wa_id}`, labels: labels.flatMap((l) => (l.label ? [l.label.name] : [])) }));
  const last = page.at(-1);
  return { items: page, next_cursor: rows.length > query.limit && last ? encodeCursor(last) : null };
});

/** POST /api/public/v1/contacts — create or update a contact by phone. */
export const POST = createPublicHandler({ scope: 'contacts:write', body: publicContactUpsertSchema }, async ({ admin, key, body, log }) => {
  const { contact, created } = await upsertContactByPhone(admin, key.workspace, body, { log });
  return { ...contact, phone: `+${contact.wa_id}`, created };
});
