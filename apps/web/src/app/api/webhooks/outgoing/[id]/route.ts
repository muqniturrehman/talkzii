import { updateWebhookSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { isProduction } from '@/lib/env';
import { assertPublicUrl } from '@/lib/outbound/url-guard';

const COLUMNS = 'id, url, description, events, active, failure_count, last_delivery_at, last_status, created_at';

export const PATCH = createHandler({ role: 'admin', body: updateWebhookSchema }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Webhook');
  if (body.url) {
    try {
      await assertPublicUrl(body.url, { allowLocalhost: !isProduction() });
    } catch (error) {
      throw ApiError.validation({ fieldErrors: { url: [(error as Error).message] } }, (error as Error).message);
    }
  }
  const row = unwrap(
    await supabase
      .from('webhooks')
      .update({
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.events !== undefined ? { events: body.events } : {}),
        ...(body.active !== undefined ? { active: body.active, ...(body.active ? { failure_count: 0 } : {}) } : {}),
      })
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle(),
  );
  if (!row) throw ApiError.notFound('Webhook not found.');
  return row;
});

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Webhook');
  const rows = unwrap(await supabase.from('webhooks').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Webhook not found.');
  return { id };
});
