import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { hasMinRole, requiredRoleForPath, safeNextPath } from '@talkzi/shared';
import { createFakeSupabase } from './helpers/supabase-mock';

const serverClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => serverClient.current),
}));

const { createHandler } = await import('@/lib/api/handler');
const { signInvitationToken, verifyInvitationToken } = await import('@/lib/invitations');
const { POST: loginPOST } = await import('@/app/api/auth/login/route');

const segment = { params: Promise.resolve({}) };
const workspace = {
  workspace_id: '6a2f1c7e-1d4b-4c55-9a77-1e2d3c4b5a60',
  role: 'agent' as const,
  plan: 'pro' as const,
  name: 'Demo Store',
  slug: 'demo-store',
  parent_workspace_id: null,
};

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('invitation tokens', () => {
  const payload = { v: 1 as const, iid: 'inv-1', wid: 'ws-1', exp: Math.floor(Date.now() / 1000) + 3600 };

  it('round-trips a signed token and returns its hash', () => {
    const token = signInvitationToken(payload);
    const result = verifyInvitationToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
      expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('rejects tampered payloads and foreign signatures', () => {
    const token = signInvitationToken(payload);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, wid: 'someone-else' })).toString('base64url');
    expect(verifyInvitationToken(`${forged}.${sig}`)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyInvitationToken(signInvitationToken(payload, 'other-secret'))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyInvitationToken(`${body}`)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects expired tokens', () => {
    const token = signInvitationToken({ ...payload, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyInvitationToken(token)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('roles & redirects', () => {
  it('ranks roles owner > admin > agent > viewer', () => {
    expect(hasMinRole('owner', 'admin')).toBe(true);
    expect(hasMinRole('agent', 'admin')).toBe(false);
    expect(hasMinRole('viewer', 'viewer')).toBe(true);
    expect(hasMinRole(null, 'viewer')).toBe(false);
  });

  it('maps dashboard routes to minimum roles', () => {
    expect(requiredRoleForPath('/app/settings/billing')).toBe('admin');
    expect(requiredRoleForPath('/app/sessions/connect')).toBe('admin');
    expect(requiredRoleForPath('/app/inbox')).toBeNull();
  });

  it('only allows same-origin relative redirect targets', () => {
    expect(safeNextPath('/app/inbox?c=1')).toBe('/app/inbox?c=1');
    expect(safeNextPath('//evil.com')).toBe('/app');
    expect(safeNextPath('https://evil.com')).toBe('/app');
    expect(safeNextPath('/\\evil.com')).toBe('/app');
    expect(safeNextPath(undefined, '/onboarding')).toBe('/onboarding');
  });
});

describe('createHandler pipeline', () => {
  const schema = z.object({ name: z.string().min(2) });

  beforeEach(() => {
    serverClient.current = createFakeSupabase({ userId: 'user-1', workspace });
  });

  it('returns 401 without a session', async () => {
    serverClient.current = createFakeSupabase({ userId: null });
    const handler = createHandler({}, async () => ({ ok: true }));
    const res = await handler(new NextRequest('http://localhost/api/x'), segment);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('returns 403 NO_WORKSPACE when the user has no active workspace', async () => {
    serverClient.current = createFakeSupabase({ userId: 'user-1', workspace: null });
    const handler = createHandler({}, async () => ({ ok: true }));
    const res = await handler(new NextRequest('http://localhost/api/x'), segment);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'NO_WORKSPACE' } });
  });

  it('enforces the minimum role', async () => {
    const handler = createHandler({ role: 'admin' }, async () => ({ ok: true }));
    const res = await handler(new NextRequest('http://localhost/api/x'), segment);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('gates plan features', async () => {
    serverClient.current = createFakeSupabase({ userId: 'user-1', workspace: { ...workspace, plan: 'free' } });
    const handler = createHandler({ feature: 'api_access' }, async () => ({ ok: true }));
    const res = await handler(new NextRequest('http://localhost/api/x'), segment);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FEATURE_NOT_IN_PLAN', details: { requiredPlan: 'pro' } } });
  });

  it('validates the body with zod (422 + field errors)', async () => {
    const handler = createHandler({ body: schema }, async ({ body }) => body);
    const res = await handler(jsonRequest('http://localhost/api/x', { name: 'x' }), segment);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details.fieldErrors.name).toBeDefined();
  });

  it('rejects malformed JSON with 400', async () => {
    const handler = createHandler({ body: schema }, async ({ body }) => body);
    const req = new NextRequest('http://localhost/api/x', { method: 'POST', body: '{nope' });
    const res = await handler(req, segment);
    expect(res.status).toBe(400);
  });

  it('passes parsed input, user and workspace to the handler and wraps the result', async () => {
    const handler = createHandler({ body: schema }, async ({ body, user, workspace: ws }) => ({
      name: body.name,
      userId: user.id,
      workspaceId: ws.id,
      role: ws.role,
    }));
    const res = await handler(jsonRequest('http://localhost/api/x', { name: 'Ayesha' }), segment);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { name: 'Ayesha', userId: 'user-1', workspaceId: workspace.workspace_id, role: 'agent' },
    });
  });
});

describe('POST /api/auth/login', () => {
  it('rejects unsafe redirect targets at validation time', async () => {
    serverClient.current = createFakeSupabase({ userId: null, signIn: { error: null } });
    const res = await loginPOST(
      jsonRequest('http://localhost/api/auth/login', { email: 'a@b.co', password: 'secret123', next: '//evil.com' }, { 'x-forwarded-for': '10.0.0.1' }),
      segment,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('signs in with a normalised email and returns the next path', async () => {
    const fake = createFakeSupabase({ userId: null, signIn: { error: null } });
    serverClient.current = fake;
    const res = await loginPOST(
      jsonRequest('http://localhost/api/auth/login', { email: '  Owner@Demo.app ', password: 'secret123', next: '/app/inbox' }, { 'x-forwarded-for': '10.0.0.3' }),
      segment,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { next: '/app/inbox' } });
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@demo.app', password: 'secret123' });
  });

  it('returns a generic error for bad credentials', async () => {
    serverClient.current = createFakeSupabase({ userId: null, signIn: { error: { message: 'Invalid login credentials' } } });
    const res = await loginPOST(
      jsonRequest('http://localhost/api/auth/login', { email: 'a@b.co', password: 'wrong-pass' }, { 'x-forwarded-for': '10.0.0.2' }),
      segment,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { message: 'Incorrect email or password.' } });
  });

  it('rate limits repeated attempts for the same account', async () => {
    serverClient.current = createFakeSupabase({ userId: null, signIn: { error: { message: 'Invalid login credentials' } } });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await loginPOST(
        jsonRequest('http://localhost/api/auth/login', { email: 'victim@b.co', password: 'guess' + i }, { 'x-forwarded-for': `10.1.0.${i}` }),
        segment,
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
