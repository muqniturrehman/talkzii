import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { encryptSecret } from '@/lib/crypto';
import { env, graphApiVersion } from '@/lib/env';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { EmbeddedSignupDeps } from './embedded-signup';
import { createSupabaseWabaStore } from './waba-store';
import { createWhatsAppClient } from './whatsapp';

/** Production wiring for completeEmbeddedSignup. */
export function embeddedSignupDeps(admin: TypedSupabaseClient): EmbeddedSignupDeps {
  const { META_APP_ID, META_APP_SECRET } = env();
  if (!META_APP_ID || !META_APP_SECRET) throw ApiError.notConfigured('Meta app (META_APP_ID / META_APP_SECRET)');
  return {
    appId: META_APP_ID,
    appSecret: META_APP_SECRET,
    apiVersion: graphApiVersion(),
    store: createSupabaseWabaStore(admin),
    encrypt: encryptSecret,
    createClient: createWhatsAppClient,
  };
}
