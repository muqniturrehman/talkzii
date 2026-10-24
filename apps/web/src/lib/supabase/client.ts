'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@talkzi/db';
import { publicEnv } from '@/lib/public-env';
import type { TypedSupabaseClient } from './types';

let browserClient: TypedSupabaseClient | null = null;

/** Singleton browser client (RLS-scoped to the signed-in user). */
export function getSupabaseBrowserClient(): TypedSupabaseClient {
  browserClient ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return browserClient;
}
