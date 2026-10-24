import { formatPhone } from '@talkzi/shared';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { csvCell } from '@/lib/contacts/import';

export const maxDuration = 60;

const PAGE = 1000;
const HEADER = ['name', 'phone', 'whatsapp_profile_name', 'email', 'labels', 'opted_out', 'source', 'created_at', 'custom_fields'];

/** Streams every contact in the workspace as CSV (admin). */
export const GET = createHandler({ role: 'admin' }, async ({ admin, workspace, user, req }) => {
  const db = admin();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`﻿${HEADER.join(',')}\n`));
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('contacts')
          .select('name, wa_id, profile_name, email, opted_out, source, created_at, custom_fields, labels:contact_labels(label:labels(name))')
          .eq('workspace_id', workspace.id)
          .order('created_at')
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) {
          controller.error(new Error(error.message));
          return;
        }
        const lines = (data ?? []).map((c) =>
          [
            c.name,
            formatPhone(c.wa_id),
            c.profile_name,
            c.email,
            c.labels.flatMap((l) => (l.label ? [l.label.name] : [])).join('; '),
            c.opted_out ? 'yes' : 'no',
            c.source,
            c.created_at,
            c.custom_fields && Object.keys(c.custom_fields as object).length ? c.custom_fields : '',
          ]
            .map(csvCell)
            .join(','),
        );
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join('\n')}\n`));
        if (!data || data.length < PAGE) break;
      }
      controller.close();
    },
  });

  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'contact.exported', req });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="talkzi-contacts-${date}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
