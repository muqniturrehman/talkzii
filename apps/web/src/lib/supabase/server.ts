import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@talkzi/db';
import { publicEnv } from '@/lib/public-env';
import type { TypedSupabaseClient } from './types';

/**
 * User-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions. Queries run as the signed-in user, so RLS applies.
 */
export async function createSupabaseServerClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // proxy refreshes the session on the next navigation.
        }
      },
    },
  });
}
