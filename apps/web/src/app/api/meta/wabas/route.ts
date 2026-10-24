import { wabaActionSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { createHandler, unwrap } from '@/lib/api/handler';
import { syncWaba } from '@/lib/meta/sync';
import { getWabaContext } from '@/lib/meta/whatsapp';

/** WABAs and phone numbers for the workspace (tokens are never returned). */
export const GET = createHandler({ role: 'admin' }, async ({ supabase, workspace }) => {
  const [wabas, numbers] = await Promise.all([
    supabase
      .from('waba_accounts')
      .select('id, waba_id, name, status, account_review_status, business_verification_status, webhook_subscribed, token_expires_at, last_synced_at, created_at')
      .eq('workspace_id', workspace.id)
      .order('created_at'),
    supabase.from('phone_numbers').select('*').eq('workspace_id', workspace.id).order('created_at'),
  ]);
  return { wabas: unwrap(wabas), phoneNumbers: unwrap(numbers) };
});

export const POST = createHandler({ role: 'admin', body: wabaActionSchema }, async ({ body, workspace, user, admin, req }) => {
  const db = admin();
  if (body.action === 'sync') {
    return syncWaba(db, workspace.id, body.wabaAccountId);
  }

  // disconnect: stop webhooks, forget the token, keep history.
  const { waba, client, mock } = await getWabaContext(db, workspace.id, body.wabaAccountId);
  if (!mock) await client.unsubscribeApp(waba.waba_id).catch(() => undefined);
  unwrap(
    await db
      .from('waba_accounts')
      .update({ status: 'disconnected', access_token_encrypted: null, webhook_subscribed: false })
      .eq('id', waba.id)
      .eq('workspace_id', workspace.id),
  );
  unwrap(await db.from('phone_numbers').update({ status: 'DISCONNECTED', is_default: false }).eq('waba_account_id', waba.id));
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'whatsapp.disconnected', targetType: 'waba', targetId: waba.waba_id, req });
  return { disconnected: true };
});
