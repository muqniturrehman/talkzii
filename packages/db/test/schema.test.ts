import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asServiceRole,
  asUser,
  createAuthUser,
  createMigratedDb,
  type Db,
  type TestUser,
} from '../scripts/lib/pglite';
import { buildSeedData, SEED_INSERT_ORDER, SEED_META, type SeedData } from '../src/seed-data';

let db: PGlite;
let counter = 0;

beforeAll(async () => {
  db = await createMigratedDb();
});

afterAll(async () => {
  await db.close();
});

const unique = (prefix: string) => `${prefix}-${++counter}-${Date.now().toString(36)}`;

async function insertRow(tx: Db, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row).map((c) => `"${c}"`).join(', ');
  await tx.query(
    `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_record(null::public.${table}, $1::jsonb)`,
    [JSON.stringify(row)],
  );
}

async function createWorkspaceAs(user: TestUser, name: string): Promise<string> {
  return asUser(db, user, async (tx) => {
    const res = await tx.query<{ id: string }>('select id from public.create_workspace($1)', [name]);
    return res.rows[0]!.id;
  });
}

async function addMember(workspaceId: string, userId: string, role: string) {
  await db.query('insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)', [
    workspaceId,
    userId,
    role,
  ]);
}

async function addPhone(workspaceId: string): Promise<{ phoneId: string; metaPhoneId: string }> {
  const metaPhoneId = String(Math.floor(Math.random() * 1e15));
  const waba = await db.query<{ id: string }>(
    `insert into public.waba_accounts (workspace_id, waba_id, status) values ($1, $2, 'connected') returning id`,
    [workspaceId, unique('waba')],
  );
  const phone = await db.query<{ id: string }>(
    `insert into public.phone_numbers (workspace_id, waba_account_id, phone_number_id, display_phone_number, quality_rating)
     values ($1, $2, $3, '+92 300 1111111', 'GREEN') returning id`,
    [workspaceId, waba.rows[0]!.id, metaPhoneId],
  );
  return { phoneId: phone.rows[0]!.id, metaPhoneId };
}

async function count(tx: Db, sql: string, params: unknown[] = []): Promise<number> {
  const res = await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
  return res.rows[0]!.n;
}

describe('schema hardening', () => {
  it('enables RLS on every public table', async () => {
    const res = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(res.rows).toEqual([]);
  });

  it('blocks authenticated users from service-only functions', async () => {
    const user = await createAuthUser(db, `${unique('svc')}@test.dev`);
    await expect(
      asUser(db, user, (tx) =>
        tx.query(`select public.record_inbound_message('1', '923001234567', 'wamid.x', 'text', now())`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, user, (tx) => tx.query(`select public.custom_access_token_hook('{}'::jsonb)`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('multi-tenancy', () => {
  it('create_workspace bootstraps the owner membership and active workspace', async () => {
    const owner = await createAuthUser(db, `${unique('owner')}@test.dev`, 'Owner One');
    const wsId = await createWorkspaceAs(owner, 'Lahore Lawn Co');

    const member = await db.query<{ role: string }>(
      'select role from public.workspace_members where workspace_id = $1 and user_id = $2',
      [wsId, owner.id],
    );
    expect(member.rows[0]?.role).toBe('owner');

    const profile = await db.query<{ active_workspace_id: string; full_name: string }>(
      'select active_workspace_id, full_name from public.profiles where id = $1',
      [owner.id],
    );
    expect(profile.rows[0]).toMatchObject({ active_workspace_id: wsId, full_name: 'Owner One' });

    const slug = await db.query<{ slug: string }>('select slug from public.workspaces where id = $1', [wsId]);
    expect(slug.rows[0]?.slug).toMatch(/^lahore-lawn-co/);
  });

  it('isolates tenants from each other', async () => {
    const alice = await createAuthUser(db, `${unique('alice')}@test.dev`);
    const bob = await createAuthUser(db, `${unique('bob')}@test.dev`);
    const wsA = await createWorkspaceAs(alice, 'Alice Store');
    const wsB = await createWorkspaceAs(bob, 'Bob Store');

    await db.query(`insert into public.contacts (workspace_id, wa_id, name) values ($1, '923001110001', 'A1'), ($1, '923001110002', 'A2')`, [wsA]);
    await db.query(`insert into public.contacts (workspace_id, wa_id, name) values ($1, '923001110003', 'B1')`, [wsB]);

    const aliceSees = await asUser(db, alice, (tx) => count(tx, 'select 1 from public.contacts'));
    expect(aliceSees).toBe(2);

    const bobSees = await asUser(db, bob, (tx) => count(tx, 'select 1 from public.contacts'));
    expect(bobSees).toBe(1);

    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.contacts (workspace_id, wa_id) values ($1, '923009999999')`, [wsB]),
      ),
    ).rejects.toThrow(/row-level security/);

    const workspacesVisible = await asUser(db, alice, (tx) => count(tx, 'select 1 from public.workspaces'));
    expect(workspacesVisible).toBe(1);
  });

  it('enforces minimum roles for writes', async () => {
    const owner = await createAuthUser(db, `${unique('own')}@test.dev`);
    const agent = await createAuthUser(db, `${unique('agent')}@test.dev`);
    const viewer = await createAuthUser(db, `${unique('viewer')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Roles Co');
    await addMember(ws, agent.id, 'agent');
    await addMember(ws, viewer.id, 'viewer');
    const claims = { workspace_id: ws };

    await expect(
      asUser(db, viewer, (tx) => tx.query(`insert into public.contacts (workspace_id, wa_id) values ($1, '923001230001')`, [ws]), claims),
    ).rejects.toThrow(/row-level security/);

    await asUser(db, agent, (tx) => tx.query(`insert into public.contacts (workspace_id, wa_id) values ($1, '923001230002')`, [ws]), claims);

    await expect(
      asUser(db, agent, (tx) =>
        tx.query(`insert into public.message_templates (workspace_id, name, language, category) values ($1, 'promo', 'en', 'MARKETING')`, [ws]),
      claims),
    ).rejects.toThrow(/row-level security/);

    await asUser(db, owner, (tx) =>
      tx.query(`insert into public.message_templates (workspace_id, name, language, category) values ($1, 'promo', 'en', 'MARKETING')`, [ws]),
    claims);

    // Agents can't read WABA rows (they hold encrypted tokens); admins can.
    await db.query(`insert into public.waba_accounts (workspace_id, waba_id) values ($1, $2)`, [ws, unique('waba')]);
    expect(await asUser(db, agent, (tx) => count(tx, 'select 1 from public.waba_accounts'), claims)).toBe(0);
    expect(await asUser(db, owner, (tx) => count(tx, 'select 1 from public.waba_accounts'), claims)).toBe(1);
  });

  it('uses the JWT workspace claim and re-checks membership live', async () => {
    const user = await createAuthUser(db, `${unique('multi')}@test.dev`);
    const ws1 = await createWorkspaceAs(user, 'First Co');
    const ws2 = await createWorkspaceAs(user, 'Second Co');
    await db.query(`insert into public.contacts (workspace_id, wa_id) values ($1, '923004440001')`, [ws1]);
    await db.query(`insert into public.contacts (workspace_id, wa_id) values ($1, '923004440002'), ($1, '923004440003')`, [ws2]);

    expect(await asUser(db, user, (tx) => count(tx, 'select 1 from public.contacts'), { workspace_id: ws1 })).toBe(1);
    expect(await asUser(db, user, (tx) => count(tx, 'select 1 from public.contacts'), { workspace_id: ws2 })).toBe(2);

    // Fallback to profiles.active_workspace_id when the hook isn't configured.
    expect(await asUser(db, user, (tx) => count(tx, 'select 1 from public.contacts'))).toBe(2);

    // Promote a second owner so the original one can be removed from ws1.
    const other = await createAuthUser(db, `${unique('other')}@test.dev`);
    await addMember(ws1, other.id, 'owner');
    await db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws1, user.id]);
    // A stale claim for ws1 can no longer read ws1; RLS falls back to the active workspace (ws2).
    expect(
      await asUser(db, user, (tx) => count(tx, 'select 1 from public.contacts where workspace_id = $1', [ws1]), { workspace_id: ws1 }),
    ).toBe(0);
    expect(await asUser(db, user, (tx) => count(tx, 'select 1 from public.contacts'), { workspace_id: ws1 })).toBe(2);
    const ctx = await asUser(db, user, async (tx) =>
      (await tx.query<{ workspace_id: string; role: string }>('select * from public.current_workspace_context()')).rows,
    { workspace_id: ws1 });
    expect(ctx).toEqual([expect.objectContaining({ workspace_id: ws2, role: 'owner' })]);
  });

  it('custom access token hook injects workspace claims', async () => {
    const user = await createAuthUser(db, `${unique('hook')}@test.dev`);
    const ws = await createWorkspaceAs(user, 'Hook Co');
    const res = await db.query<{ event: { claims: Record<string, unknown> } }>(
      'select public.custom_access_token_hook($1::jsonb) as event',
      [JSON.stringify({ user_id: user.id, claims: { sub: user.id, role: 'authenticated' } })],
    );
    expect(res.rows[0]?.event.claims).toMatchObject({ workspace_id: ws, workspace_role: 'owner', role: 'authenticated' });

    const loner = await createAuthUser(db, `${unique('loner')}@test.dev`);
    const res2 = await db.query<{ event: { claims: Record<string, unknown> } }>(
      'select public.custom_access_token_hook($1::jsonb) as event',
      [JSON.stringify({ user_id: loner.id, claims: { sub: loner.id, workspace_id: 'stale' } })],
    );
    expect(res2.rows[0]?.event.claims.workspace_id).toBeUndefined();
  });

  it('keeps at least one owner and lets only owners manage owners', async () => {
    const owner = await createAuthUser(db, `${unique('solo')}@test.dev`);
    const admin = await createAuthUser(db, `${unique('adm')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Solo Co');
    await addMember(ws, admin.id, 'admin');

    await expect(
      asUser(db, owner, (tx) => tx.query(`update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [ws, owner.id])),
    ).rejects.toThrow(/cannot_remove_last_owner/);

    await expect(
      asUser(db, admin, (tx) => tx.query(`update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2`, [ws, admin.id]), { workspace_id: ws }),
    ).rejects.toThrow(/only_owners_can_manage_owners/);

    // Deleting the workspace cascades without tripping the guard.
    await asUser(db, owner, (tx) => tx.query('delete from public.workspaces where id = $1', [ws]));
    expect(await count(db, 'select 1 from public.workspace_members where workspace_id = $1', [ws])).toBe(0);
  });

  it('accepts invitations only for the invited email with a valid token hash', async () => {
    const owner = await createAuthUser(db, `${unique('inv-owner')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Invite Co');
    const email = `${unique('invitee')}@test.dev`;
    const inv = await db.query<{ id: string }>(
      `insert into public.workspace_invitations (workspace_id, email, role, invited_by, token_hash)
       values ($1, $2, 'agent', $3, 'hash-123') returning id`,
      [ws, email, owner.id],
    );
    const invitationId = inv.rows[0]!.id;

    const intruder = await createAuthUser(db, `${unique('intruder')}@test.dev`);
    await expect(
      asUser(db, intruder, (tx) => tx.query('select public.accept_workspace_invitation($1, $2)', [invitationId, 'hash-123'])),
    ).rejects.toThrow(/invitation_email_mismatch/);

    const invitee = await createAuthUser(db, email);
    await expect(
      asUser(db, invitee, (tx) => tx.query('select public.accept_workspace_invitation($1, $2)', [invitationId, 'wrong'])),
    ).rejects.toThrow(/invitation_not_found/);

    const accepted = await asUser(db, invitee, (tx) =>
      tx.query<{ ws: string }>('select public.accept_workspace_invitation($1, $2) as ws', [invitationId, 'hash-123']),
    );
    expect(accepted.rows[0]?.ws).toBe(ws);

    const role = await db.query<{ role: string }>(
      'select role from public.workspace_members where workspace_id = $1 and user_id = $2',
      [ws, invitee.id],
    );
    expect(role.rows[0]?.role).toBe('agent');

    await expect(
      asUser(db, invitee, (tx) => tx.query('select public.accept_workspace_invitation($1, $2)', [invitationId, 'hash-123'])),
    ).rejects.toThrow(/invitation_already_accepted/);
  });
});

describe('messaging functions', () => {
  async function inbound(tx: Transaction, metaPhoneId: string, wamid: string, ts: string, body = 'Hello', type = 'text') {
    const res = await tx.query<{ r: Record<string, string> }>(
      `select public.record_inbound_message($1, '923335550001', $2, $3::public.message_type, $4::timestamptz, 'Ayesha', $5) as r`,
      [metaPhoneId, wamid, type, ts, body],
    );
    return res.rows[0]!.r;
  }

  it('records inbound messages idempotently and maintains the 24h window', async () => {
    const owner = await createAuthUser(db, `${unique('in')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Inbound Co');
    const { metaPhoneId } = await addPhone(ws);
    const ts = '2026-10-20T10:00:00Z';

    const first = await asServiceRole(db, (tx) => inbound(tx, metaPhoneId, 'wamid.IN1', ts));
    expect(first.status).toBe('created');

    const dup = await asServiceRole(db, (tx) => inbound(tx, metaPhoneId, 'wamid.IN1', ts));
    expect(dup.status).toBe('duplicate');

    const conv = await db.query<{ unread_count: number; expires_at: Date; last_message_preview: string; status: string }>(
      'select unread_count, expires_at, last_message_preview, status from public.conversations where id = $1',
      [first.conversation_id],
    );
    expect(conv.rows[0]?.unread_count).toBe(1);
    expect(new Date(conv.rows[0]!.expires_at).toISOString()).toBe('2026-10-21T10:00:00.000Z');
    expect(conv.rows[0]?.last_message_preview).toBe('Hello');

    await db.query(`update public.conversations set status = 'resolved' where id = $1`, [first.conversation_id]);
    const second = await asServiceRole(db, (tx) => inbound(tx, metaPhoneId, 'wamid.IN2', '2026-10-20T12:00:00Z', 'Still there?'));
    expect(second.conversation_id).toBe(first.conversation_id);

    const after = await db.query<{ unread_count: number; expires_at: Date; status: string }>(
      'select unread_count, expires_at, status from public.conversations where id = $1',
      [first.conversation_id],
    );
    expect(after.rows[0]?.unread_count).toBe(2);
    expect(after.rows[0]?.status).toBe('open');
    expect(new Date(after.rows[0]!.expires_at).toISOString()).toBe('2026-10-21T12:00:00.000Z');

    const contact = await db.query<{ profile_name: string; source: string }>(
      `select profile_name, source from public.contacts where workspace_id = $1 and wa_id = '923335550001'`,
      [ws],
    );
    expect(contact.rows[0]).toMatchObject({ profile_name: 'Ayesha', source: 'whatsapp' });

    const unknown = await asServiceRole(db, (tx) => inbound(tx, '000', 'wamid.IN3', ts));
    expect(unknown.status).toBe('unknown_phone_number');
  });

  it('applies statuses forward-only and keeps broadcast counters exact', async () => {
    const owner = await createAuthUser(db, `${unique('st')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Status Co');
    const { phoneId } = await addPhone(ws);
    const contact = await db.query<{ id: string }>(
      `insert into public.contacts (workspace_id, wa_id) values ($1, '923216660001') returning id`,
      [ws],
    );
    const contactId = contact.rows[0]!.id;
    const broadcast = await db.query<{ id: string }>(
      `insert into public.broadcasts (workspace_id, name, status) values ($1, 'Promo', 'sending') returning id`,
      [ws],
    );
    const broadcastId = broadcast.rows[0]!.id;

    await asServiceRole(db, async (tx) => {
      await tx.query(
        `select public.record_outbound_message($1, $2, $3, 'template', 'broadcast', 'Hi', '{}'::jsonb, null, 'sent', 'wamid.OUT1', null, null, $4)`,
        [ws, contactId, phoneId, broadcastId],
      );
      await tx.query(
        `insert into public.broadcast_recipients (workspace_id, broadcast_id, contact_id, wa_id) values ($1, $2, $3, '923216660001')`,
        [ws, broadcastId, contactId],
      );
      const claimed = await tx.query('select * from public.claim_broadcast_recipients($1, 10)', [broadcastId]);
      expect(claimed.rows).toHaveLength(1);
      await tx.query(
        `update public.broadcast_recipients set status = 'sent', wamid = 'wamid.OUT1', sent_at = now() where broadcast_id = $1`,
        [broadcastId],
      );
    });

    const apply = (status: string, extra = '') =>
      asServiceRole(db, (tx) =>
        tx.query(`select public.apply_message_status('wamid.OUT1', $1::public.message_status, now()${extra})`, [status]),
      );

    await apply('read', `, null, null, 'marketing', true, 'PMP', 'regular'`);
    await apply('delivered');
    await apply('failed');

    const msg = await db.query<{ status: string; pricing_category: string; pricing_billable: boolean; read_at: Date | null }>(
      `select status, pricing_category, pricing_billable, read_at from public.messages where wamid = 'wamid.OUT1'`,
    );
    expect(msg.rows[0]).toMatchObject({ status: 'read', pricing_category: 'marketing', pricing_billable: true });
    expect(msg.rows[0]?.read_at).not.toBeNull();

    const counters = await db.query<Record<string, number>>(
      'select sent_count, delivered_count, read_count, failed_count from public.broadcasts where id = $1',
      [broadcastId],
    );
    expect(counters.rows[0]).toEqual({ sent_count: 1, delivered_count: 1, read_count: 1, failed_count: 0 });

    const conv = await db.query<{ category: string }>(
      'select category from public.conversations where workspace_id = $1',
      [ws],
    );
    expect(conv.rows[0]?.category).toBe('marketing');

    // A reply within 72h is attributed to the broadcast.
    const { metaPhoneId } = await db
      .query<{ phone_number_id: string }>('select phone_number_id from public.phone_numbers where id = $1', [phoneId])
      .then((r) => ({ metaPhoneId: r.rows[0]!.phone_number_id }));
    await asServiceRole(db, (tx) =>
      tx.query(`select public.record_inbound_message($1, '923216660001', 'wamid.REPLY1', 'text', now(), null, 'Interested!')`, [metaPhoneId]),
    );
    const replied = await db.query<{ replied_count: number }>('select replied_count from public.broadcasts where id = $1', [broadcastId]);
    expect(replied.rows[0]?.replied_count).toBe(1);
  });

  it('claims broadcast recipients exactly once and completes the broadcast', async () => {
    const owner = await createAuthUser(db, `${unique('claim')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Claim Co');
    const broadcast = await db.query<{ id: string }>(
      `insert into public.broadcasts (workspace_id, name, status) values ($1, 'Bulk', 'sending') returning id`,
      [ws],
    );
    const broadcastId = broadcast.rows[0]!.id;
    for (let i = 0; i < 5; i += 1) {
      await db.query(
        `insert into public.broadcast_recipients (workspace_id, broadcast_id, wa_id) values ($1, $2, $3)`,
        [ws, broadcastId, `92300777000${i}`],
      );
    }

    const claim = (n: number) =>
      asServiceRole(db, async (tx) => (await tx.query('select id from public.claim_broadcast_recipients($1, $2)', [broadcastId, n])).rows.length);

    expect(await claim(3)).toBe(3);
    expect(await claim(3)).toBe(2);
    expect(await claim(3)).toBe(0);

    const notDone = await asServiceRole(db, async (tx) =>
      (await tx.query<{ done: boolean }>('select public.complete_broadcast_if_done($1) as done', [broadcastId])).rows[0]!.done,
    );
    expect(notDone).toBe(false);

    await db.query(`update public.broadcast_recipients set status = 'sent' where broadcast_id = $1`, [broadcastId]);
    const done = await asServiceRole(db, async (tx) =>
      (await tx.query<{ done: boolean }>('select public.complete_broadcast_if_done($1) as done', [broadcastId])).rows[0]!.done,
    );
    expect(done).toBe(true);
    const status = await db.query<{ status: string; sent_count: number }>(
      'select status, sent_count from public.broadcasts where id = $1',
      [broadcastId],
    );
    expect(status.rows[0]).toEqual({ status: 'completed', sent_count: 5 });
  });

  it('leases due broadcasts through the Postgres queue fallback', async () => {
    const owner = await createAuthUser(db, `${unique('queue')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Queue Co');
    await db.query(
      `insert into public.broadcasts (workspace_id, name, status, scheduled_at) values
        ($1, 'Due', 'scheduled', now() - interval '1 minute'),
        ($1, 'Future', 'scheduled', now() + interval '1 day')`,
      [ws],
    );
    const leased = await asServiceRole(db, async (tx) =>
      (await tx.query<{ name: string; status: string }>(
        `select name, status from public.claim_due_broadcasts(50, 55) where workspace_id = $1`,
        [ws],
      )).rows,
    );
    expect(leased).toEqual([{ name: 'Due', status: 'sending' }]);

    const again = await asServiceRole(db, async (tx) =>
      (await tx.query(`select 1 from public.claim_due_broadcasts(50, 55) where workspace_id = $1`, [ws])).rows.length,
    );
    expect(again).toBe(0);
  });
});

describe('realtime, storage and AI search', () => {
  it('broadcasts inbox changes to private workspace topics', async () => {
    const owner = await createAuthUser(db, `${unique('rt')}@test.dev`);
    const outsider = await createAuthUser(db, `${unique('rt-out')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Realtime Co');
    await createWorkspaceAs(outsider, 'Elsewhere Co');
    const { metaPhoneId } = await addPhone(ws);

    await asServiceRole(db, (tx) =>
      tx.query(`select public.record_inbound_message($1, '923451230000', 'wamid.RT1', 'text', now(), null, 'Hi')`, [metaPhoneId]),
    );

    const events = await db.query<{ event: string }>(
      `select event from realtime.messages where topic = $1 order by id`,
      [`workspace:${ws}`],
    );
    expect(events.rows.map((r) => r.event)).toEqual(
      expect.arrayContaining(['conversations.insert', 'messages.insert', 'conversations.update']),
    );

    const canJoin = (user: TestUser) =>
      asUser(db, user, async (tx) => {
        await tx.query(`select set_config('realtime.topic', $1, true)`, [`workspace:${ws}`]);
        return count(tx, 'select 1 from realtime.messages');
      });
    expect(await canJoin(owner)).toBeGreaterThan(0);
    expect(await canJoin(outsider)).toBe(0);
  });

  it('scopes storage objects to the workspace folder', async () => {
    const a = await createAuthUser(db, `${unique('st-a')}@test.dev`);
    const b = await createAuthUser(db, `${unique('st-b')}@test.dev`);
    const wsA = await createWorkspaceAs(a, 'Files A');
    const wsB = await createWorkspaceAs(b, 'Files B');
    await db.query(
      `insert into storage.objects (bucket_id, name) values ('media', $1), ('media', $2)`,
      [`${wsA}/conv/photo.jpg`, `${wsB}/conv/photo.jpg`],
    );
    expect(await asUser(db, a, (tx) => count(tx, 'select 1 from storage.objects'))).toBe(1);
  });

  it('match_document_chunks searches the active workspace knowledge base', async () => {
    const owner = await createAuthUser(db, `${unique('rag')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'RAG Co');
    const doc = await db.query<{ id: string }>(
      `insert into public.ai_documents (workspace_id, title, status) values ($1, 'FAQ', 'ready') returning id`,
      [ws],
    );
    const vec = (hot: number) => {
      const v = new Array<number>(1536).fill(0);
      v[hot] = 1;
      return `[${v.join(',')}]`;
    };
    await db.query(
      `insert into public.ai_document_chunks (workspace_id, document_id, chunk_index, content, embedding)
       values ($1, $2, 0, 'Delivery takes 2-3 days', $3::extensions.vector), ($1, $2, 1, 'Returns within 7 days', $4::extensions.vector)`,
      [ws, doc.rows[0]!.id, vec(0), vec(1)],
    );
    const res = await asUser(db, owner, (tx) =>
      tx.query<{ content: string; similarity: number }>(
        'select content, similarity from public.match_document_chunks($1::extensions.vector, 2, 0.5)',
        [vec(0)],
      ),
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.content).toBe('Delivery takes 2-3 days');
  });

  it('match_workspace_chunks only compares vectors from the same embedding model', async () => {
    const owner = await createAuthUser(db, `${unique('rag2')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'RAG Two');
    const doc = await db.query<{ id: string }>(
      `insert into public.ai_documents (workspace_id, title, status, embedding_model) values ($1, 'Policies', 'ready', 'talkzi-hash-v1') returning id`,
      [ws],
    );
    const vec = (hot: number) => {
      const v = new Array<number>(1536).fill(0);
      v[hot] = 1;
      return `[${v.join(',')}]`;
    };
    await db.query(
      `insert into public.ai_document_chunks (workspace_id, document_id, chunk_index, content, embedding, embedding_model)
       values ($1, $2, 0, 'Shipping is free over Rs 5,000', $3::extensions.vector, 'talkzi-hash-v1')`,
      [ws, doc.rows[0]!.id, vec(7)],
    );

    const search = (model: string) =>
      asServiceRole(db, (tx) =>
        tx.query<{ title: string; content: string }>(
          'select title, content from public.match_workspace_chunks($1, $2::extensions.vector, $3, 3, 0.5)',
          [ws, vec(7), model],
        ),
      );
    expect((await search('talkzi-hash-v1')).rows).toEqual([{ title: 'Policies', content: 'Shipping is free over Rs 5,000' }]);
    expect((await search('text-embedding-3-small')).rows).toHaveLength(0);

    await expect(
      asUser(db, owner, (tx) =>
        tx.query('select * from public.match_workspace_chunks($1, $2::extensions.vector, $3)', [ws, vec(7), 'talkzi-hash-v1']),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('contact import', () => {
  it('imports set-based: dedupes, caps by capacity, merges existing and links labels', async () => {
    const owner = await createAuthUser(db, `${unique('imp')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Import Co');
    await db.query(`insert into public.contacts (workspace_id, wa_id, name, custom_fields) values ($1, '923001111111', 'Old Name', '{"city":"Lahore"}')`, [ws]);
    const vip = await db.query<{ id: string }>(`insert into public.labels (workspace_id, name) values ($1, 'VIP') returning id`, [ws]);

    const rows = [
      { row_number: 2, wa_id: '923001111111', name: 'New Name', email: null, custom_fields: { tier: 'gold' }, labels: ['Wholesale'] },
      { row_number: 3, wa_id: '923002222222', name: 'Bilal', email: 'BILAL@Example.com', custom_fields: {}, labels: ['Wholesale'] },
      { row_number: 4, wa_id: '923002222222', name: 'Bilal duplicate', email: null, custom_fields: {}, labels: [] },
      { row_number: 5, wa_id: '923003333333', name: 'Sana', email: null, custom_fields: {}, labels: [] },
      { row_number: 6, wa_id: 'not-a-number', name: 'Bad', email: null, custom_fields: {}, labels: [] },
    ];
    const result = await asServiceRole(db, (tx) =>
      tx.query<{ r: Record<string, number> }>('select public.import_contacts($1, $2::jsonb, true, $3::uuid[], $4, 1) as r', [
        ws,
        JSON.stringify(rows),
        [vip.rows[0]!.id],
        owner.id,
      ]),
    );
    expect(result.rows[0]!.r).toEqual({ received: 3, created: 1, updated: 1, existing: 1, skipped_limit: 1 });

    const contacts = await db.query<{ wa_id: string; name: string; email: string | null; custom_fields: Record<string, string>; source: string }>(
      'select wa_id, name, email, custom_fields, source from public.contacts where workspace_id = $1 order by wa_id',
      [ws],
    );
    expect(contacts.rows).toEqual([
      { wa_id: '923001111111', name: 'New Name', email: null, custom_fields: { city: 'Lahore', tier: 'gold' }, source: 'manual' },
      { wa_id: '923002222222', name: 'Bilal', email: 'bilal@example.com', custom_fields: {}, source: 'import' },
    ]);

    const links = await db.query<{ wa_id: string; label: string }>(
      `select c.wa_id, l.name as label from public.contact_labels cl
       join public.contacts c on c.id = cl.contact_id join public.labels l on l.id = cl.label_id
       where cl.workspace_id = $1 order by c.wa_id, l.name`,
      [ws],
    );
    expect(links.rows).toEqual([
      { wa_id: '923001111111', label: 'VIP' },
      { wa_id: '923001111111', label: 'Wholesale' },
      { wa_id: '923002222222', label: 'VIP' },
      { wa_id: '923002222222', label: 'Wholesale' },
    ]);

    await expect(
      asUser(db, owner, (tx) => tx.query('select public.import_contacts($1, $2::jsonb)', [ws, '[]'])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('broadcast audiences', () => {
  it('materializes label audiences with exclusions, skips opted-out contacts and enforces the cap', async () => {
    const owner = await createAuthUser(db, `${unique('aud')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Audience Co');
    const label = async (name: string) =>
      (await db.query<{ id: string }>('insert into public.labels (workspace_id, name) values ($1, $2) returning id', [ws, name])).rows[0]!.id;
    const vip = await label('VIP');
    const blocked = await label('Do not message');
    const contact = async (waId: string, optedOut = false, labels: string[] = []) => {
      const id = (
        await db.query<{ id: string }>('insert into public.contacts (workspace_id, wa_id, opted_out) values ($1, $2, $3) returning id', [ws, waId, optedOut])
      ).rows[0]!.id;
      for (const l of labels) await db.query('insert into public.contact_labels (contact_id, label_id, workspace_id) values ($1, $2, $3)', [id, l, ws]);
      return id;
    };
    await contact('923000000001', false, [vip]);
    await contact('923000000002', true, [vip]);
    await contact('923000000003', false, [vip, blocked]);
    await contact('923000000004');

    const broadcast = await db.query<{ id: string }>(
      `insert into public.broadcasts (workspace_id, name, audience) values ($1, 'Eid sale', $2::jsonb) returning id`,
      [ws, JSON.stringify({ type: 'labels', labelIds: [vip], excludeLabelIds: [blocked] })],
    );
    const id = broadcast.rows[0]!.id;

    await expect(
      asServiceRole(db, (tx) => tx.query('select public.materialize_broadcast_recipients($1, 0)', [id])),
    ).rejects.toThrow(/plan_limit:1:0/);

    const result = await asServiceRole(db, (tx) =>
      tx.query<{ r: Record<string, number> }>('select public.materialize_broadcast_recipients($1, 10) as r', [id]),
    );
    expect(result.rows[0]!.r).toEqual({ total: 2, sendable: 1, skipped: 1 });

    const recipients = await db.query<{ wa_id: string; status: string }>(
      'select wa_id, status::text from public.broadcast_recipients where broadcast_id = $1 order by wa_id',
      [id],
    );
    expect(recipients.rows).toEqual([
      { wa_id: '923000000001', status: 'pending' },
      { wa_id: '923000000002', status: 'skipped' },
    ]);
    const counters = await db.query<{ total_recipients: number; skipped_count: number }>(
      'select total_recipients, skipped_count from public.broadcasts where id = $1',
      [id],
    );
    expect(counters.rows[0]).toEqual({ total_recipients: 2, skipped_count: 1 });
  });
});

describe('billing', () => {
  async function createPayment(workspaceId: string, plan: string, interval: string, provider = 'jazzcash') {
    const res = await db.query<{ id: string }>(
      `insert into public.billing_payments (workspace_id, provider, reference, plan, billing_interval, amount)
       values ($1, $2, $3, $4, $5, 7999) returning id`,
      [workspaceId, provider, unique('T'), plan, interval],
    );
    return res.rows[0]!.id;
  }

  it('activates, extends and expires prepaid wallet plans idempotently', async () => {
    const owner = await createAuthUser(db, `${unique('payer')}@test.dev`);
    const agent = await createAuthUser(db, `${unique('payagent')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Prepaid Co');
    await addMember(ws, agent.id, 'agent');

    const first = await createPayment(ws, 'pro', 'month');
    const activated = await asServiceRole(db, async (tx) =>
      (await tx.query<{ plan: string; status: string; months: number }>(
        `select plan::text, status::text, round(extract(epoch from current_period_end - now()) / 86400 / 30)::int as months
         from public.activate_prepaid_plan($1, '{"pp_ResponseCode":"000"}')`,
        [first],
      )).rows[0]!,
    );
    expect(activated).toMatchObject({ plan: 'pro', status: 'active', months: 1 });
    const plan = await db.query<{ plan: string }>('select plan::text from public.workspaces where id = $1', [ws]);
    expect(plan.rows[0]?.plan).toBe('pro');

    // Replaying the same callback must not add another month.
    await asServiceRole(db, (tx) => tx.query('select public.activate_prepaid_plan($1)', [first]));
    // Paying again for the same plan extends from the current period end.
    const second = await createPayment(ws, 'pro', 'month');
    await asServiceRole(db, (tx) => tx.query('select public.activate_prepaid_plan($1)', [second]));
    const period = await db.query<{ months: number; cancel_at_period_end: boolean }>(
      `select round(extract(epoch from current_period_end - now()) / 86400 / 30)::int as months, cancel_at_period_end
       from public.billing_subscriptions where workspace_id = $1`,
      [ws],
    );
    expect(period.rows[0]).toMatchObject({ months: 2, cancel_at_period_end: true });

    // Admins can read their payment history; agents can't, and nobody can write it directly.
    expect(await asUser(db, owner, (tx) => count(tx, 'select 1 from public.billing_payments'))).toBe(2);
    expect(await asUser(db, agent, (tx) => count(tx, 'select 1 from public.billing_payments'))).toBe(0);
    await expect(
      asUser(db, owner, (tx) => tx.query(`update public.billing_payments set status = 'paid' where workspace_id = $1`, [ws]).then((r) => r.affectedRows)),
    ).resolves.toBe(0);
    await expect(asUser(db, owner, (tx) => tx.query('select public.activate_prepaid_plan($1)', [first]))).rejects.toThrow(/permission denied/);

    // Once the period runs out the workspace falls back to Free.
    await db.query(`update public.billing_subscriptions set current_period_end = now() - interval '1 minute' where workspace_id = $1`, [ws]);
    const expired = await asServiceRole(db, async (tx) => (await tx.query<{ ws: string }>('select ws from public.expire_prepaid_subscriptions() ws')).rows);
    expect(expired.map((r) => r.ws)).toContain(ws);
    const after = await db.query<{ plan: string }>('select plan::text from public.workspaces where id = $1', [ws]);
    expect(after.rows[0]?.plan).toBe('free');
  });

  it('dedupes provider events and reconciles the messages_sent counter upwards', async () => {
    await db.query(`insert into public.webhook_events (source, external_id, payload) values ('stripe', 'evt_dup', '{}')`);
    await expect(db.query(`insert into public.webhook_events (source, external_id, payload) values ('stripe', 'evt_dup', '{}')`)).rejects.toThrow(/duplicate key/);
    await db.query(`insert into public.webhook_events (source, payload) values ('meta', '{}'), ('meta', '{}')`);

    const owner = await createAuthUser(db, `${unique('usage')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Usage Co');
    const { phoneId } = await addPhone(ws);
    const contact = await db.query<{ id: string }>(`insert into public.contacts (workspace_id, wa_id) values ($1, '923005550001') returning id`, [ws]);
    const conversation = await db.query<{ id: string }>(
      `insert into public.conversations (workspace_id, contact_id, phone_number_id) values ($1, $2, $3) returning id`,
      [ws, contact.rows[0]!.id, phoneId],
    );
    for (const status of ['sent', 'delivered', 'read', 'failed']) {
      await db.query(
        `insert into public.messages (workspace_id, conversation_id, contact_id, direction, status, sender_type) values ($1, $2, $3, 'outbound', $4, 'agent')`,
        [ws, conversation.rows[0]!.id, contact.rows[0]!.id, status],
      );
    }
    await db.query(`select public.increment_usage($1, 'messages_sent', 1)`, [ws]);
    await asServiceRole(db, (tx) => tx.query('select public.rollup_usage()'));
    const counter = await db.query<{ value: string }>(
      `select value from public.usage_counters where workspace_id = $1 and metric = 'messages_sent'`,
      [ws],
    );
    expect(Number(counter.rows[0]?.value)).toBe(3);
  });
});

describe('agency workspaces', () => {
  it('creates client workspaces that inherit and follow the agency plan', async () => {
    const owner = await createAuthUser(db, `${unique('agency')}@test.dev`);
    const agent = await createAuthUser(db, `${unique('agencyagent')}@test.dev`);
    const agency = await createWorkspaceAs(owner, 'Karachi Growth Agency');
    await addMember(agency, agent.id, 'agent');
    await db.query(`update public.workspaces set plan = 'agency' where id = $1`, [agency]);

    const client = await asServiceRole(db, async (tx) =>
      (await tx.query<{ id: string; plan: string; parent_workspace_id: string }>(
        `select id, plan::text, parent_workspace_id from public.create_client_workspace($1, $2, 'Bano Bazaar')`,
        [agency, owner.id],
      )).rows[0]!,
    );
    expect(client).toMatchObject({ plan: 'agency', parent_workspace_id: agency });
    const membership = await db.query<{ role: string }>('select role from public.workspace_members where workspace_id = $1 and user_id = $2', [client.id, owner.id]);
    expect(membership.rows[0]?.role).toBe('owner');

    // Agents can't create clients; clients can't have clients; users can't call it directly.
    await expect(asServiceRole(db, (tx) => tx.query(`select public.create_client_workspace($1, $2, 'Nope')`, [agency, agent.id]))).rejects.toThrow(/forbidden/);
    await expect(asServiceRole(db, (tx) => tx.query(`select public.create_client_workspace($1, $2, 'Nested')`, [client.id, owner.id]))).rejects.toThrow(/nested/);
    await expect(asUser(db, owner, (tx) => tx.query(`select public.create_client_workspace($1, $2, 'Direct')`, [agency, owner.id]))).rejects.toThrow(/permission denied/);

    // Plan changes on the agency flow to its clients; deleting the agency drops them to Free.
    await db.query(`update public.workspaces set plan = 'pro' where id = $1`, [agency]);
    const followed = await db.query<{ plan: string }>('select plan::text from public.workspaces where id = $1', [client.id]);
    expect(followed.rows[0]?.plan).toBe('pro');
    await db.query('delete from public.workspaces where id = $1', [agency]);
    const orphan = await db.query<{ plan: string; parent_workspace_id: string | null }>('select plan::text, parent_workspace_id from public.workspaces where id = $1', [client.id]);
    expect(orphan.rows[0]).toEqual({ plan: 'free', parent_workspace_id: null });
  });

  it('lets admins edit presentation columns but never plan, parent or domain verification', async () => {
    const owner = await createAuthUser(db, `${unique('cols')}@test.dev`);
    const ws = await createWorkspaceAs(owner, 'Columns Co');
    const renamed = await asUser(db, owner, (tx) =>
      tx.query(`update public.workspaces set name = 'Columns & Co', branding = '{"brandName":"Columns"}' where id = $1`, [ws]).then((r) => r.affectedRows),
    );
    expect(renamed).toBe(1);
    for (const column of [`plan = 'agency'`, `parent_workspace_id = null`, `custom_domain_verified_at = now()`, `owner_id = null`]) {
      await expect(asUser(db, owner, (tx) => tx.query(`update public.workspaces set ${column} where id = $1`, [ws]))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('seed data', () => {
  it('fits the schema and powers the analytics functions', async () => {
    const owner = await createAuthUser(db, `${unique('seed-owner')}@test.dev`);
    const agent = await createAuthUser(db, `${unique('seed-agent')}@test.dev`);
    const data: SeedData = buildSeedData({ ownerId: owner.id, agentId: agent.id, now: new Date() });

    for (const [table, key] of SEED_INSERT_ORDER) {
      const value = data[key];
      const rows = Array.isArray(value) ? value : [value];
      for (const row of rows) await insertRow(db, table, row as Record<string, unknown>);
    }
    await db.query('update public.profiles set active_workspace_id = $1 where id in ($2, $3)', [
      data.workspace.id,
      owner.id,
      agent.id,
    ]);

    const ws = data.workspace.id!;
    expect(await count(db, 'select 1 from public.contacts where workspace_id = $1', [ws])).toBe(50);
    expect(await count(db, 'select 1 from public.conversations where workspace_id = $1', [ws])).toBe(20);
    expect(await count(db, 'select 1 from public.messages where workspace_id = $1', [ws])).toBe(100);
    expect(await count(db, 'select 1 from public.canned_replies where workspace_id = $1', [ws])).toBe(3);
    expect(await count(db, 'select 1 from public.labels where workspace_id = $1', [ws])).toBe(2);
    expect(await count(db, `select 1 from public.broadcasts where workspace_id = $1 and status = 'draft'`, [ws])).toBe(1);
    expect(await count(db, 'select 1 from public.chatbot_flows where workspace_id = $1', [ws])).toBe(1);
    const statuses = await db.query<{ status: string }>(
      'select status from public.message_templates where workspace_id = $1 order by status',
      [ws],
    );
    expect(statuses.rows.map((r) => r.status)).toEqual(['APPROVED', 'PENDING', 'REJECTED']);
    const phone = await db.query<{ phone_number_id: string }>('select phone_number_id from public.phone_numbers where workspace_id = $1', [ws]);
    expect(phone.rows[0]?.phone_number_id).toBe(SEED_META.phoneNumberId);

    const overview = await asUser(db, owner, async (tx) =>
      (await tx.query<{ o: Record<string, unknown> }>('select public.analytics_overview() as o')).rows[0]!.o,
    );
    expect(overview).toMatchObject({ contacts_total: 50, contacts_opted_out: 2 });

    const volume = await asUser(db, agent, async (tx) =>
      (await tx.query<{ inbound: number; outbound: number }>(
        `select inbound::int, outbound::int from public.analytics_message_volume(now() - interval '30 days', now() + interval '1 day')`,
      )).rows,
    );
    const totals = volume.reduce((acc, r) => acc + r.inbound + r.outbound, 0);
    expect(totals).toBe(100);

    const cost = await asUser(db, owner, async (tx) =>
      (await tx.query<{ category: string; billable: number }>(
        `select category::text, billable::int from public.analytics_cost_by_category(now() - interval '30 days', now() + interval '1 day')`,
      )).rows,
    );
    expect(cost.find((r) => r.category === 'marketing')?.billable).toBe(4);

    const response = await asUser(db, owner, async (tx) =>
      (await tx.query<{ answered: number }>(
        `select answered::int from public.analytics_response_times(now() - interval '30 days', now() + interval '1 day')`,
      )).rows,
    );
    expect(response.reduce((acc, r) => acc + r.answered, 0)).toBeGreaterThan(0);

    const csat = await asUser(db, owner, async (tx) =>
      (await tx.query('select * from public.analytics_csat(now() - interval \'30 days\', now() + interval \'1 day\')')).rows,
    );
    expect(csat.length).toBeGreaterThan(0);
  });
});
