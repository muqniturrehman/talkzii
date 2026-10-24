import { MEDIA_LIMITS, mediaKindForMime, mediaUploadSchema } from '@talkzi/shared';
import { isWhatsAppApiError } from '@talkzi/whatsapp';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { getPhoneContext } from '@/lib/meta/whatsapp';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 60;

/**
 * The browser uploads attachments straight to Storage (media/<workspace>/
 * <conversation>/…, enforced by storage RLS) — serverless request bodies are
 * capped at ~4.5 MB. This route then copies the file to WhatsApp and returns
 * the media id to send with.
 */
export const POST = createHandler(
  { role: 'agent', body: mediaUploadSchema, rateLimit: RATE_LIMITS.send },
  async ({ body, workspace, admin }) => {
    const prefix = `${workspace.id}/${body.conversationId}/`;
    if (!body.storagePath.startsWith(prefix) || body.storagePath.includes('..')) {
      throw ApiError.forbidden('That file does not belong to this conversation.');
    }
    const kind = mediaKindForMime(body.mimeType);
    if (!kind) throw ApiError.validation({ fieldErrors: { mimeType: ['WhatsApp does not support this file type'] } });

    const db = admin();
    const { data: conversation } = await db
      .from('conversations')
      .select('id, phone_number_id')
      .eq('id', body.conversationId)
      .eq('workspace_id', workspace.id)
      .maybeSingle();
    if (!conversation) throw ApiError.notFound('Conversation not found.');

    const { data: blob, error } = await db.storage.from('media').download(body.storagePath);
    if (error || !blob) throw ApiError.notFound('Uploaded file not found. Try attaching it again.');
    if (blob.size > MEDIA_LIMITS[kind].maxBytes) {
      throw ApiError.validation(
        { fieldErrors: { file: [`${kind} files must be under ${Math.round(MEDIA_LIMITS[kind].maxBytes / 1024 / 1024)} MB`] } },
        'File is too large for WhatsApp.',
      );
    }

    const ctx = await getPhoneContext(db, workspace.id, conversation.phone_number_id);
    try {
      const { id } = await ctx.client.uploadMedia(ctx.phone.phone_number_id, blob, { filename: body.filename, mimeType: body.mimeType });
      return { mediaId: id, kind, storagePath: body.storagePath, size: blob.size };
    } catch (err) {
      if (isWhatsAppApiError(err)) throw new ApiError(502, 'WHATSAPP_ERROR', err.friendlyMessage, { code: err.code });
      throw err;
    }
  },
);
