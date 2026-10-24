import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { planHasFeature, type ApiScope } from '@talkzi/shared';
import { assertScope, authenticateApiKey, bearerToken, type ApiKeyContext } from '@/lib/api-keys';
import { ApiError, errorResponse } from '@/lib/api/errors';
import { sha256Hex } from '@/lib/crypto';
import { configured } from '@/lib/env';
import { logger, type Logger } from '@/lib/logger';
import { rateLimit, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

type AnySchema = z.ZodType;
type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface PublicContext<B, Q> {
  req: NextRequest;
  admin: TypedSupabaseClient;
  key: ApiKeyContext;
  body: Parsed<B>;
  query: Parsed<Q>;
  log: Logger;
}

function parse<S extends AnySchema>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(z.flattenError(result.error));
  return result.data;
}

/**
 * Public REST API pipeline: per-key rate limit (60/min) → API key → plan
 * (api_access) → scope (and the user's role for personal tokens) → Zod →
 * handler. Same `{ data }` / `{ error }` envelope as the app API.
 */
export function createPublicHandler<B extends AnySchema | undefined = undefined, Q extends AnySchema | undefined = undefined>(
  options: { scope: ApiScope; body?: B; query?: Q },
  handler: (ctx: PublicContext<B, Q>) => Promise<unknown>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const log = logger.child({ requestId, api: 'public', method: req.method, path: req.nextUrl.pathname });
    let headers: Record<string, string> = { 'x-request-id': requestId };
    try {
      if (!configured.supabaseAdmin()) throw ApiError.notConfigured('Supabase');
      const token = bearerToken(req.headers.get('authorization'));
      const limit = await rateLimit(RATE_LIMITS.publicApi, token ? sha256Hex(token).slice(0, 32) : `ip:${getClientIp(req)}`);
      headers = { ...headers, ...rateLimitHeaders(limit) };
      if (!limit.success) throw ApiError.rateLimited(Math.ceil((limit.reset - Date.now()) / 1000));

      const admin = createSupabaseAdminClient();
      const key = await authenticateApiKey(admin, token);
      if (!planHasFeature(key.workspace.plan, 'api_access')) {
        throw new ApiError(403, 'FEATURE_NOT_IN_PLAN', 'The REST API is available on the Pro and Agency plans.');
      }
      assertScope(key, options.scope);

      const query = (options.query ? parse(options.query, Object.fromEntries(req.nextUrl.searchParams)) : undefined) as Parsed<Q>;
      let body = undefined as Parsed<B>;
      if (options.body) {
        const text = await req.text();
        let json: unknown = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw ApiError.badRequest('Request body must be valid JSON.');
        }
        body = parse(options.body, json) as Parsed<B>;
      }

      const result = await handler({ req, admin, key, body, query, log: log.child({ workspaceId: key.workspace.id, apiKeyId: key.keyId }) });
      return NextResponse.json({ data: result ?? null }, { headers });
    } catch (error) {
      const response = errorResponse(error, log, requestId);
      Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    }
  };
}
