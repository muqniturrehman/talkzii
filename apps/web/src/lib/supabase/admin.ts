import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import type { TypedSupabaseClient } from './types';

let adminClient: TypedSupabaseClient | null = null;

/**
 * Service-role client: BYPASSES RLS. Use only on the server for trusted work
 * (webhooks, cron, cross-tenant lookups) and always scope queries by
 * workspace_id yourself.
 */
export function createSupabaseAdminClient(): TypedSupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = env();
  if (!url || !key) throw ApiError.notConfigured('Supabase service role (SUPABASE_SERVICE_ROLE_KEY)');
  adminClient ??= createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}
