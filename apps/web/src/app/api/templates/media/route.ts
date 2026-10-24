import { templateMediaSchema } from '@talkzi/shared';
import { isWhatsAppApiError } from '@talkzi/whatsapp';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { getWabaContext } from '@/lib/meta/whatsapp';
import { resolveWabaId } from '@/lib/templates/service';

export const maxDuration = 60;

/**
 * Media header samples: the browser uploads to Storage (media/<workspace>/
 * templates/…), then we send the file through Meta's Resumable Upload API and
 * return the header_handle Meta requires for review.
 */
export const POST = createHandler({ role: 'admin', body: templateMediaSchema }, async ({ body, workspace, admin }) => {
  if (!body.storagePath.startsWith(`${workspace.id}/templates/`) || body.storagePath.includes('..')) {
    throw ApiError.forbidden('That file does not belong to this workspace.');
  }
  const db = admin();
  const ctx = await getWabaContext(db, workspace.id, await resolveWabaId(db, workspace.id));
  const appId = env().META_APP_ID;
  if (!appId && !ctx.mock) throw ApiError.notConfigured('META_APP_ID');

  const { data: blob, error } = await db.storage.from('media').download(body.storagePath);
  if (error || !blob) throw ApiError.notFound('Uploaded file not found.');
  if (blob.size > 16 * 1024 * 1024) throw ApiError.validation({ fieldErrors: { file: ['Sample files must be under 16 MB'] } });

  const { data: signed } = await db.storage.from('media').createSignedUrl(body.storagePath, 60 * 60 * 24 * 7);
  try {
    const handle = await ctx.client.uploadTemplateExample(appId ?? 'mock-app', blob, { filename: body.filename, mimeType: body.mimeType });
    return { handle, previewUrl: signed?.signedUrl ?? null };
  } catch (err) {
    if (isWhatsAppApiError(err)) throw new ApiError(502, 'WHATSAPP_ERROR', err.friendlyMessage);
    throw err;
  }
});
