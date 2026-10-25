import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from './helpers/memory-db';
import { createFakeSupabase } from './helpers/supabase-mock';

const clients = vi.hoisted(() => ({ server: null as unknown, admin: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => clients.server) }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => clients.admin }));

import { POST as createClient } from '@/app/api/workspaces/clients/route';
import { brandingStyle } from '@/lib/branding';
import { effectiveBranding } from '@/lib/branding-server';
import { attachDomainToHost, checkDomainDns, domainStatus, domainVerificationToken } from '@/lib/custom-domain';
import { isCustomDomainHost, isPlatformHost } from '@/lib/hosts';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

const AGENCY = '7b2e4c1a-3d5f-4a6b-8c9d-0e1f2a3b4c5d';
const USER = '11111111-2222-4333-8444-555555555555';

afterEach(() => {
  delete process.env.VERCEL_API_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;
});

describe('custom domain hosts', () => {
  it('treats only foreign hosts as agency domains', () => {
    const app = 'app.talkzi.app';
    expect(isCustomDomainHost('portal.agency.com', app)).toBe(true);
    expect(isCustomDomainHost('Portal.Agency.com:443', app)).toBe(true);
    for (const host of ['app.talkzi.app', 'staging.app.talkzi.app', 'localhost:3000', 'talkzi-git-main.vercel.app', '127.0.0.1']) {
      expect(isCustomDomainHost(host, app), host).toBe(false);
    }
    expect(isCustomDomainHost('portal.agency.com', null)).toBe(false);
    expect(isPlatformHost('preview-123.vercel.app', app)).toBe(true);
  });

  it('issues per-domain TXT tokens and verifies DNS records', async () => {
    const token = domainVerificationToken(AGENCY, 'app.agency.com');
    expect(token).toMatch(/^talkzi-verify=[0-9a-f]{32}$/);
    expect(domainVerificationToken(AGENCY, 'other.agency.com')).not.toBe(token);
    expect(domainStatus(AGENCY, 'app.agency.com', null).records).toEqual([
      { type: 'CNAME', name: 'app.agency.com', value: 'cname.vercel-dns.com' },
      { type: 'TXT', name: '_talkzi.app.agency.com', value: token },
    ]);

    const resolver = {
      resolveTxt: vi.fn(async () => [['unrelated'], ['talkzi-verify=', token.slice('talkzi-verify='.length)]]),
      resolveCname: vi.fn(async () => ['cname.vercel-dns.com.']),
    };
    expect(await checkDomainDns('app.agency.com', token, resolver as never)).toEqual({ txtVerified: true, cname: 'cname.vercel-dns.com', pointsToTalkzi: true });

    const missing = { resolveTxt: vi.fn(async () => Promise.reject(new Error('ENODATA'))), resolveCname: vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))) };
    expect(await checkDomainDns('app.agency.com', token, missing as never)).toEqual({ txtVerified: false, cname: null, pointsToTalkzi: false });
  });

  it('attaches verified domains to Vercel only when configured', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await attachDomainToHost('app.agency.com', fetchImpl as never)).toMatchObject({ attached: false });
    expect(fetchImpl).not.toHaveBeenCalled();

    process.env.VERCEL_API_TOKEN = 'vercel-token';
    process.env.VERCEL_PROJECT_ID = 'prj_123';
    expect(await attachDomainToHost('app.agency.com', fetchImpl as never)).toMatchObject({ attached: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.vercel.com/v10/projects/prj_123/domains');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'app.agency.com' });
  });
});

describe('white-label theming', () => {
  it('derives readable foregrounds from brand colours and ignores invalid ones', () => {
    expect(brandingStyle({})).toBeNull();
    expect(brandingStyle({ primaryColor: 'red' as never })).toBeNull();
    const yellow = brandingStyle({ primaryColor: '#facc15' })!;
    expect(yellow).toContain('--primary:#facc15;--primary-foreground:#0a0a0f;');
    expect(brandingStyle({ primaryColor: '#1d4ed8', accentColor: '#f97316' })).toContain('--primary-foreground:#ffffff;');
  });

  it('lets client workspaces inherit the agency brand field by field', async () => {
    const db = createMemoryDb();
    db.table('workspaces').push({ id: AGENCY, plan: 'agency', branding: { brandName: 'Growth Co', primaryColor: '#1d4ed8', hidePoweredBy: true } });
    const admin = db as unknown as TypedSupabaseClient;

    expect(await effectiveBranding(admin, { plan: 'agency', branding: { primaryColor: '#16a34a' }, parent_workspace_id: AGENCY })).toEqual({
      brandName: 'Growth Co',
      primaryColor: '#16a34a',
      hidePoweredBy: true,
    });
    // Without a white-label plan nothing is applied.
    expect(await effectiveBranding(admin, { plan: 'pro', branding: { brandName: 'Mine' }, parent_workspace_id: null })).toEqual({});
  });
});

describe('client workspaces API', () => {
  let admin: ReturnType<typeof createMemoryDb>;
  const request = (body: unknown) =>
    new NextRequest('http://localhost/api/workspaces/clients', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const workspace = (overrides: Record<string, unknown> = {}) => ({
    workspace_id: AGENCY,
    role: 'admin' as const,
    plan: 'agency' as const,
    name: 'Growth Co',
    slug: 'growth-co',
    parent_workspace_id: null,
    ...overrides,
  });

  beforeEach(() => {
    admin = createMemoryDb();
    admin.rpc.mockImplementation(async (name: string) =>
      name === 'create_client_workspace' ? { data: { id: 'c1', name: 'Bano Bazaar', slug: 'bano-bazaar' }, error: null } : { data: null, error: null },
    );
    clients.admin = admin;
  });

  it('creates a client through the service-role function for agency admins', async () => {
    clients.server = createFakeSupabase({ userId: USER, workspace: workspace() });
    const res = await createClient(request({ name: 'Bano Bazaar' }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: 'c1', name: 'Bano Bazaar', slug: 'bano-bazaar' } });
    expect(admin.rpc).toHaveBeenCalledWith('create_client_workspace', expect.objectContaining({ p_parent_id: AGENCY, p_user_id: USER, p_name: 'Bano Bazaar' }));
  });

  it('refuses non-agency plans, agents and clients of clients', async () => {
    clients.server = createFakeSupabase({ userId: USER, workspace: workspace({ plan: 'pro' }) });
    expect((await createClient(request({ name: 'Nope' }), { params: Promise.resolve({}) })).status).toBe(403);

    clients.server = createFakeSupabase({ userId: USER, workspace: workspace({ role: 'agent' }) });
    expect((await createClient(request({ name: 'Nope' }), { params: Promise.resolve({}) })).status).toBe(403);

    clients.server = createFakeSupabase({ userId: USER, workspace: workspace({ parent_workspace_id: AGENCY }) });
    expect((await createClient(request({ name: 'Nested' }), { params: Promise.resolve({}) })).status).toBe(409);
    expect(admin.rpc).not.toHaveBeenCalledWith('create_client_workspace', expect.anything());
  });
});
