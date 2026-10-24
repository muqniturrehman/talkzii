/**
 * Browser-safe configuration. NEXT_PUBLIC_* values must be referenced
 * literally so Next.js can inline them at build time.
 */
export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  metaAppId: process.env.NEXT_PUBLIC_META_APP_ID || '',
  metaConfigId: process.env.NEXT_PUBLIC_META_CONFIG_ID || '',
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
} as const;

/** Facebook JS SDK / Graph API version used by Embedded Signup. */
export const META_SDK_VERSION = 'v21.0';

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
