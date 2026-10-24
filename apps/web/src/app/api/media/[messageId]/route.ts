import { NextResponse } from 'next/server';
import { isWhatsAppApiError } from '@talkzi/whatsapp';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { extensionForMime, parseMessageMedia } from '@/lib/inbox/media';
import { getPhoneContext } from '@/lib/meta/whatsapp';

export const maxDuration = 60;

const SIGNED_URL_TTL = 300;

function placeholder(type: string): Response {
  const label = { image: 'Demo photo', video: 'Demo video', audio: 'Demo audio', document: 'Demo document', sticker: 'Sticker' }[type] ?? 'Demo media';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6D28D9"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs><rect width="480" height="320" rx="24" fill="url(#g)"/><text x="240" y="170" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="600" fill="#fff">${label}</text></svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'private, max-age=3600' } });
}

/**
 * Serves message media: a short-lived signed Storage URL. Inbound media is
 * fetched from WhatsApp on first view (media ids expire after ~30 days) and
 * cached in Storage under media/<workspace>/<conversation>/.
 */
export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params, workspace, admin, log }) => {
  const messageId = requireUuid(params.messageId, 'Message');
  const { data: message } = await supabase
    .from('messages')
    .select('id, conversation_id, type, media, phone_number_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) throw ApiError.notFound('Message not found.');
  const media = parseMessageMedia(message.media);
  if (!media) throw ApiError.notFound('This message has no media.');

  const db = admin();
  const redirectTo = async (path: string) => {
    const { data, error } = await db.storage.from('media').createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data) throw ApiError.notFound('Media file is missing.');
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'cache-control': `private, max-age=${SIGNED_URL_TTL - 60}` } });
  };

  if (media.storagePath) return redirectTo(media.storagePath);
  if (media.link) return NextResponse.redirect(media.link, 302);
  if (!media.id) throw ApiError.notFound('This message has no media.');

  const ctx = await getPhoneContext(db, workspace.id, message.phone_number_id);
  if (ctx.mock) return placeholder(message.type);

  try {
    const info = await ctx.client.getMediaUrl(media.id, { phoneNumberId: ctx.phone.phone_number_id });
    const bytes = await ctx.client.downloadMedia(info.url);
    const mimeType = info.mime_type || media.mimeType || 'application/octet-stream';
    const path = `${workspace.id}/${message.conversation_id}/${message.id}.${extensionForMime(mimeType, media.filename)}`;
    const { error: uploadError } = await db.storage.from('media').upload(path, bytes, { contentType: mimeType, upsert: true });
    if (uploadError) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not cache media.');

    const nextMedia = { ...(message.media as Record<string, Json>), storagePath: path, mimeType };
    await db.from('messages').update({ media: nextMedia }).eq('id', message.id).eq('workspace_id', workspace.id);
    return redirectTo(path);
  } catch (err) {
    if (isWhatsAppApiError(err)) {
      log.warn({ err, mediaId: media.id }, 'Media download failed');
      throw ApiError.notFound('This media is no longer available on WhatsApp.');
    }
    throw err;
  }
});
