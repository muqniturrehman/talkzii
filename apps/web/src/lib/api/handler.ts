import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  hasMinRole,
  minimumPlanFor,
  PLANS,
  planHasFeature,
  type PlanFeature,
  type PlanId,
  type WorkspaceRole,
} from '@talkzi/shared';
import { logger, type Logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/public-env';
import { rateLimit, rateLimitHeaders, type RateLimitRule } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { ApiError, errorResponse, fromPostgrestError } from './errors';

type AnySchema = z.ZodType;
type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;

/**
 * public    → no session required (rate-limit these)
 * user      → signed-in user, workspace optional (onboarding, invitations)
 * workspace → signed-in user with an active workspace (default)
 */
export type AuthMode = 'public' | 'user' | 'workspace';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
  plan: PlanId;
  name: string;
  slug: string;
  parentWorkspaceId: string | null;
}

export interface HandlerOptions<B extends AnySchema | undefined, Q extends AnySchema | undefined, A extends AuthMode> {
  auth?: A;
  /** Minimum workspace role (workspace mode). */
  role?: WorkspaceRole;
  /** Plan feature required (workspace mode). */
  feature?: PlanFeature;
  body?: B;
  query?: Q;
  /** Keyed by client IP (public) or user id. */
  rateLimit?: RateLimitRule;
}

export interface HandlerContext<B, Q, A extends AuthMode> {
  req: NextRequest;
  params: Record<string, string>;
  body: Parsed<B>;
  query: Parsed<Q>;
  log: Logger;
  requestId: string;
  user: A extends 'public' ? AuthUser | null : AuthUser;
  workspace: A extends 'workspace' ? WorkspaceContext : WorkspaceContext | null;
  /** User-scoped client (RLS applies). */
  supabase: TypedSupabaseClient;
  /** Service-role client (bypasses RLS) — scope every query by workspace yourself. */
  admin: () => TypedSupabaseClient;
}

type RouteSegment = { params: Promise<Record<string, string | string[] | undefined>> };

async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
}

function parseWith<S extends AnySchema>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(z.flattenError(result.error));
  return result.data;
}

function normalizeParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join('/');
  }
  return out;
}

/**
 * Wraps a Route Handler with the standard pipeline:
 * rate limit → auth → workspace → role → plan feature → Zod (query/body) →
 * handler → typed error response. Returning a plain value responds with
 * `{ data }`; returning a Response passes it through.
 */
export function createHandler<
  B extends AnySchema | undefined = undefined,
  Q extends AnySchema | undefined = undefined,
  A extends AuthMode = 'workspace',
>(options: HandlerOptions<B, Q, A>, handler: (ctx: HandlerContext<B, Q, A>) => Promise<unknown>) {
  return async (req: NextRequest, segment: RouteSegment): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const log = logger.child({ requestId, method: req.method, path: req.nextUrl.pathname });
    const auth: AuthMode = options.auth ?? 'workspace';
    let limitHeaders: Record<string, string> = {};

    try {
      if (!isSupabaseConfigured()) throw ApiError.notConfigured('Supabase');

      if (options.rateLimit && auth === 'public') {
        const result = await rateLimit(options.rateLimit, getClientIp(req));
        limitHeaders = rateLimitHeaders(result);
        if (!result.success) throw ApiError.rateLimited(Math.ceil((result.reset - Date.now()) / 1000));
      }

      const supabase = await createSupabaseServerClient();
      let user: AuthUser | null = null;
      let workspace: WorkspaceContext | null = null;

      if (auth !== 'public') {
        const { data } = await supabase.auth.getClaims();
        const claims = data?.claims;
        if (!claims?.sub) throw ApiError.unauthorized();
        user = { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };

        if (options.rateLimit) {
          const result = await rateLimit(options.rateLimit, user.id);
          limitHeaders = rateLimitHeaders(result);
          if (!result.success) throw ApiError.rateLimited(Math.ceil((result.reset - Date.now()) / 1000));
        }
      }

      if (auth === 'workspace') {
        const { data, error } = await supabase.rpc('current_workspace_context');
        if (error) throw fromPostgrestError(error);
        const row = data?.[0];
        if (!row) throw ApiError.noWorkspace();
        workspace = {
          id: row.workspace_id,
          role: row.role,
          plan: row.plan,
          name: row.name,
          slug: row.slug,
          parentWorkspaceId: row.parent_workspace_id ?? null,
        };

        if (options.role && !hasMinRole(workspace.role, options.role)) {
          throw ApiError.forbidden(`This action requires the ${options.role} role or higher.`);
        }
        if (options.feature && !planHasFeature(workspace.plan, options.feature)) {
          const needed = PLANS[minimumPlanFor(options.feature)].name;
          throw new ApiError(403, 'FEATURE_NOT_IN_PLAN', `Upgrade to ${needed} to use this feature.`, {
            feature: options.feature,
            requiredPlan: minimumPlanFor(options.feature),
          });
        }
      }

      const params = normalizeParams(await segment.params);
      const query = (options.query
        ? parseWith(options.query, Object.fromEntries(req.nextUrl.searchParams))
        : undefined) as Parsed<Q>;
      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
      const body = (options.body && hasBody ? parseWith(options.body, await readJson(req)) : undefined) as Parsed<B>;

      const ctx = {
        req,
        params,
        body,
        query,
        log: log.child({ userId: user?.id, workspaceId: workspace?.id }),
        requestId,
        user,
        workspace,
        supabase,
        admin: createSupabaseAdminClient,
      } as HandlerContext<B, Q, A>;

      const result = await handler(ctx);
      if (result instanceof Response) {
        Object.entries(limitHeaders).forEach(([k, v]) => result.headers.set(k, v));
        return result;
      }
      return NextResponse.json({ data: result ?? null }, { headers: { 'x-request-id': requestId, ...limitHeaders } });
    } catch (error) {
      const response = errorResponse(error, log, requestId);
      Object.entries(limitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    }
  };
}

/**
 * Throws a typed API error for a failed Supabase query, else returns the
 * success variant's data: `.single()` → row, `.maybeSingle()` → row | null,
 * `.select()` → rows. (Generic over the whole response so inline
 * `unwrap(await q.single())` keeps the row type.)
 */
export function unwrap<R extends { data: unknown; error: { code?: string; message: string } | null }>(
  result: R,
): Extract<R, { error: null }>['data'] {
  if (result.error) throw fromPostgrestError(result.error);
  return result.data as Extract<R, { error: null }>['data'];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a dynamic route segment as a UUID (404 otherwise, so bad ids never reach Postgres). */
export function requireUuid(value: string | undefined, what = 'Resource'): string {
  if (!value || !UUID_RE.test(value)) throw ApiError.notFound(`${what} not found.`);
  return value.toLowerCase();
}
