/**
 * Seeds a Supabase project with the Talkzi demo workspace.
 *
 *   pnpm db:seed
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Idempotent: re-running upserts the same deterministic rows.
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, requireEnv } from './scripts/lib/env';
import { buildSeedData, SEED_IDS } from './src/seed-data';
import type { Database } from './types';

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Talkzi@demo123';
const USERS = {
  owner: { email: 'owner@demo.talkzi.app', fullName: 'Muqnit (Owner)' },
  agent: { email: 'agent@demo.talkzi.app', fullName: 'Sara (Agent)' },
};

async function main() {
  loadLocalEnv();
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function ensureUser(email: string, fullName: string): Promise<string> {
    const created = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (created.data.user) return created.data.user.id;

    for (let page = 1; page <= 50; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const match = data.users.find((u) => u.email?.toLowerCase() === email);
      if (match) return match.id;
      if (data.users.length < 200) break;
    }
    throw created.error ?? new Error(`Could not create or find ${email}`);
  }

  const ownerId = await ensureUser(USERS.owner.email, USERS.owner.fullName);
  const agentId = await ensureUser(USERS.agent.email, USERS.agent.fullName);
  const data = buildSeedData({ ownerId, agentId });

  const check = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    console.log(`  ✓ ${label}`);
  };

  console.log('Seeding demo workspace…');
  check('workspace', (await admin.from('workspaces').upsert(data.workspace)).error);
  check('members', (await admin.from('workspace_members').upsert(data.members, { onConflict: 'workspace_id,user_id' })).error);
  check('WABA (mock)', (await admin.from('waba_accounts').upsert(data.wabaAccount)).error);
  check('phone number (mock)', (await admin.from('phone_numbers').upsert(data.phoneNumber)).error);
  check('labels', (await admin.from('labels').upsert(data.labels)).error);
  check('50 contacts', (await admin.from('contacts').upsert(data.contacts)).error);
  check('contact labels', (await admin.from('contact_labels').upsert(data.contactLabels, { onConflict: 'contact_id,label_id' })).error);
  check('3 templates', (await admin.from('message_templates').upsert(data.templates)).error);
  check('20 conversations', (await admin.from('conversations').upsert(data.conversations)).error);
  check('conversation labels', (await admin.from('conversation_labels').upsert(data.conversationLabels, { onConflict: 'conversation_id,label_id' })).error);
  check('100 messages', (await admin.from('messages').upsert(data.messages)).error);
  check('3 canned replies', (await admin.from('canned_replies').upsert(data.cannedReplies)).error);
  check('draft broadcast', (await admin.from('broadcasts').upsert(data.broadcasts)).error);
  check('chatbot flow', (await admin.from('chatbot_flows').upsert(data.chatbotFlows)).error);

  for (const [id, fullName] of [
    [ownerId, USERS.owner.fullName],
    [agentId, USERS.agent.fullName],
  ] as const) {
    check(
      `profile ${fullName}`,
      (await admin.from('profiles').update({ full_name: fullName, active_workspace_id: SEED_IDS.workspace }).eq('id', id)).error,
    );
  }

  console.log('\n✓ Done. Sign in with:');
  console.log(`  ${USERS.owner.email} / ${DEMO_PASSWORD}  (owner)`);
  console.log(`  ${USERS.agent.email} / ${DEMO_PASSWORD}  (agent)`);
}

main().catch((error: unknown) => {
  console.error('✗ Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
