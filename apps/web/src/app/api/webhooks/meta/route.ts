import { after, type NextRequest } from 'next/server';
import { verifyWebhookChallenge } from '@talkzi/whatsapp';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { receiveMetaWebhook } from '@/lib/webhooks/meta/receive';
import { persistMetaEvent, runMetaEvent } from '@/lib/webhooks/meta/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Webhook verification handshake (Meta App Dashboard → WhatsApp → Configuration). */
export function GET(req: NextRequest) {
  const challenge = verifyWebhookChallenge(req.nextUrl.searchParams, env().META_WEBHOOK_VERIFY_TOKEN ?? '');
  if (challenge === null) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

/** Messages, statuses and account/template/phone events from Meta. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  try {
    const result = await receiveMetaWebhook(rawBody, req.headers.get('x-hub-signature-256'), {
      appSecret: env().META_APP_SECRET,
      persist: persistMetaEvent,
      schedule: (eventId, payload) => after(() => runMetaEvent(eventId, payload)),
    });
    if (result.status !== 200) logger.warn({ status: result.status, reason: result.body }, 'meta webhook rejected');
    return new Response(result.body, { status: result.status, headers: { 'content-type': 'text/plain' } });
  } catch (error) {
    // Persisting failed: let Meta retry the delivery.
    logger.error({ err: error }, 'meta webhook intake failed');
    return new Response('Temporary failure', { status: 500 });
  }
}
