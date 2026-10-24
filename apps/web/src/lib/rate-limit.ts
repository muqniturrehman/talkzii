import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

export interface RateLimitRule {
  /** Namespace, e.g. "auth:login" */
  prefix: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the window resets */
  reset: number;
}

let redis: Redis | null | undefined;
const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, { count: number; reset: number }>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  if (!redis && process.env.NODE_ENV === 'production') {
    logger.warn('Upstash Redis not configured: falling back to per-instance in-memory rate limiting.');
  }
  return redis;
}

/**
 * Sliding-window rate limit on Upstash Redis; per-instance fixed window in
 * memory when Redis isn't configured (fine for local development).
 */
export async function rateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const client = getRedis();
  if (client) {
    const cacheKey = `${rule.prefix}:${rule.limit}:${rule.windowSeconds}`;
    let limiter = limiters.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
        prefix: `talkzi:rl:${rule.prefix}`,
      });
      limiters.set(cacheKey, limiter);
    }
    const res = await limiter.limit(identifier);
    return { success: res.success, limit: res.limit, remaining: res.remaining, reset: res.reset };
  }

  const key = `${rule.prefix}:${identifier}`;
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.reset <= now) {
    memory.set(key, { count: 1, reset: now + rule.windowSeconds * 1000 });
    return { success: true, limit: rule.limit, remaining: rule.limit - 1, reset: now + rule.windowSeconds * 1000 };
  }
  entry.count += 1;
  if (memory.size > 10_000) {
    for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
  }
  return {
    success: entry.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - entry.count),
    reset: entry.reset,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
  };
}

export const RATE_LIMITS = {
  authStrict: { prefix: 'auth:strict', limit: 5, windowSeconds: 60 },
  auth: { prefix: 'auth', limit: 10, windowSeconds: 60 },
  publicApi: { prefix: 'public-api', limit: 60, windowSeconds: 60 },
  ai: { prefix: 'ai', limit: 30, windowSeconds: 60 },
  send: { prefix: 'send', limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
