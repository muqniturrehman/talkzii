import 'server-only';
import { z } from 'zod';

/** Empty strings in .env files count as "not set". */
const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: optional,
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  DATABASE_URL: optional,
  UPSTASH_REDIS_REST_URL: optional,
  UPSTASH_REDIS_REST_TOKEN: optional,
  REDIS_URL: optional,
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_CONFIG_ID: optional,
  META_WEBHOOK_VERIFY_TOKEN: optional,
  META_SYSTEM_USER_TOKEN: optional,
  META_GRAPH_API_VERSION: optional,
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: optional,
  OPENAI_EMBEDDING_MODEL: optional,
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,
  AI_PROVIDER: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  JAZZCASH_MERCHANT_ID: optional,
  JAZZCASH_PASSWORD: optional,
  JAZZCASH_INTEGRITY_SALT: optional,
  JAZZCASH_CHECKOUT_URL: optional,
  EASYPAISA_STORE_ID: optional,
  EASYPAISA_HASH_KEY: optional,
  EASYPAISA_CHECKOUT_URL: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  INTERNAL_API_SECRET: optional,
  ENCRYPTION_KEY: optional,
  CRON_SECRET: optional,
  LOG_LEVEL: optional,
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Parsed server environment. Never throws: missing keys simply disable features. */
export function env(): ServerEnv {
  if (cached && process.env.NODE_ENV !== 'test') return cached;
  const parsed = schema.safeParse(process.env);
  cached = parsed.success ? parsed.data : (schema.partial().parse({}) as ServerEnv);
  return cached;
}

export const appUrl = () => (env().NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const graphApiVersion = () => env().META_GRAPH_API_VERSION ?? 'v21.0';

/** Which optional integrations are configured. */
export const configured = {
  supabase: () => Boolean(env().NEXT_PUBLIC_SUPABASE_URL && env().NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseAdmin: () => Boolean(env().NEXT_PUBLIC_SUPABASE_URL && env().SUPABASE_SERVICE_ROLE_KEY),
  meta: () => Boolean(env().META_APP_ID && env().META_APP_SECRET),
  redisRest: () => Boolean(env().UPSTASH_REDIS_REST_URL && env().UPSTASH_REDIS_REST_TOKEN),
  bullmq: () => Boolean(env().REDIS_URL),
  openai: () => Boolean(env().OPENAI_API_KEY),
  anthropic: () => Boolean(env().ANTHROPIC_API_KEY),
  stripe: () => Boolean(env().STRIPE_SECRET_KEY),
  resend: () => Boolean(env().RESEND_API_KEY),
  jazzcash: () => Boolean(env().JAZZCASH_MERCHANT_ID && env().JAZZCASH_INTEGRITY_SALT),
  easypaisa: () => Boolean(env().EASYPAISA_STORE_ID && env().EASYPAISA_HASH_KEY),
} as const;

export const isProduction = () => env().NODE_ENV === 'production';
