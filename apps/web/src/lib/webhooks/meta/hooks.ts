import 'server-only';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { WebhookHooks } from './types';

/**
 * Post-persistence side effects for Meta webhooks. Each concern lives in its
 * own module and is composed here; a failing hook never fails the webhook.
 */
export function createWebhookHooks(_admin: TypedSupabaseClient, _log: Logger): WebhookHooks {
  return {};
}
