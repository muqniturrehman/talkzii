import { contactImportSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { prepareImportRows } from '@/lib/contacts/import';
import { contactCapacity, workspaceCountryCode } from '@/lib/contacts/service';
import type { ImportResult } from '@/lib/contacts/types';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 60;

/**
 * One CSV batch (≤500 rows, parsed and mapped in the browser). Phones are
 * normalised here, then a single import_contacts() call inserts/merges and
 * links labels, capped by the plan's remaining contact capacity.
 */
export const POST = createHandler(
  { role: 'admin', body: contactImportSchema, rateLimit: { ...RATE_LIMITS.send, prefix: 'contacts:import' } },
  async ({ body, workspace, user, admin, req }) => {
    const db = admin();
    const cc = body.defaultCountryCode ?? (await workspaceCountryCode(db, workspace.id));
    const { valid, invalid } = prepareImportRows(body.rows, cc);

    if (body.labelIds.length) {
      const { data: labels } = await db.from('labels').select('id').eq('workspace_id', workspace.id).in('id', body.labelIds);
      if ((labels ?? []).length !== body.labelIds.length) throw ApiError.badRequest('One of the selected labels no longer exists.');
    }

    let summary = { received: 0, created: 0, updated: 0, existing: 0, skipped_limit: 0 };
    if (valid.length) {
      const capacity = await contactCapacity(db, workspace);
      const { data, error } = await db.rpc('import_contacts', {
        p_workspace_id: workspace.id,
        p_rows: valid as unknown as Json,
        p_update_existing: body.updateExisting,
        p_label_ids: body.labelIds,
        p_created_by: user.id,
        p_capacity: Number.isFinite(capacity) ? capacity : undefined,
      });
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Import failed: ${error.message}`);
      summary = data as typeof summary;
    }

    await audit({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'contact.imported',
      metadata: { ...summary, invalid: invalid.length },
      req,
    });
    return { ...summary, invalid } satisfies ImportResult;
  },
);
