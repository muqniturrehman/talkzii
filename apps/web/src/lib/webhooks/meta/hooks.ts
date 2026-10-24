import 'server-only';
import { attributeBroadcastReply } from '@/lib/broadcasts/replies';
import { handleChatbotInbound } from '@/lib/chatbots/runtime';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { WebhookHooks } from './types';

/**
 * Post-persistence side effects for Meta webhooks. Each concern lives in its
 * own module and is composed here; the processor isolates hook failures so a
 * failing side effect never fails the webhook.
 */
export function createWebhookHooks(admin: TypedSupabaseClient, log: Logger): WebhookHooks {
  return {
    async onInboundMessage(ctx) {
      await attributeBroadcastReply(admin, ctx);
      await handleChatbotInbound(admin, ctx, log);
    },
  };
}
