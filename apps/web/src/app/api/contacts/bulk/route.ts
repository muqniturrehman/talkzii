import { bulkContactActionSchema, hasMinRole } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** Bulk label / opt-out / delete on selected contacts (RLS-scoped). */
export const POST = createHandler({ role: 'agent', body: bulkContactActionSchema }, async ({ supabase, body, workspace, user, req }) => {
  switch (body.action) {
    case 'add_label': {
      const { data: label } = await supabase.from('labels').select('id').eq('id', body.labelId).maybeSingle();
      if (!label) throw ApiError.notFound('Label not found.');
      const { data: contacts } = await supabase.from('contacts').select('id').in('id', body.ids);
      const rows = (contacts ?? []).map((c) => ({ contact_id: c.id, label_id: body.labelId, workspace_id: workspace.id }));
      if (rows.length) {
        const { error } = await supabase.from('contact_labels').upsert(rows, { ignoreDuplicates: true });
        if (error) throw ApiError.forbidden();
      }
      return { affected: rows.length };
    }
    case 'remove_label': {
      const rows = unwrap(await supabase.from('contact_labels').delete().eq('label_id', body.labelId).in('contact_id', body.ids).select('contact_id'));
      return { affected: rows.length };
    }
    case 'opt_out':
    case 'opt_in': {
      const optedOut = body.action === 'opt_out';
      const rows = unwrap(
        await supabase
          .from('contacts')
          .update({
            opted_out: optedOut,
            opted_out_at: optedOut ? new Date().toISOString() : null,
            opt_out_reason: optedOut ? 'Marked by agent' : null,
          })
          .in('id', body.ids)
          .select('id'),
      );
      return { affected: rows.length };
    }
    case 'delete': {
      if (!hasMinRole(workspace.role, 'admin')) throw ApiError.forbidden('Only admins can delete contacts.');
      const rows = unwrap(await supabase.from('contacts').delete().in('id', body.ids).select('id'));
      await audit({ workspaceId: workspace.id, actorId: user.id, action: 'contact.bulk_deleted', metadata: { count: rows.length }, req });
      return { affected: rows.length };
    }
  }
});
