import 'server-only';
import { createHmac, randomInt } from 'node:crypto';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/lib/audit';
import { safeEqual } from '@/lib/crypto';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const WORKSPACE_BUCKETS = ['media', 'branding', 'ai-documents', 'imports'] as const;

/** Unguessable, readable confirmation code, e.g. DEL-7K2M9QX4PB. */
export function newConfirmationCode(): string {
  let code = '';
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `DEL-${code}`;
}

/** Every object under `<prefix>/` in a bucket (Storage lists one folder level at a time). */
async function listFiles(admin: TypedSupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix];
  while (folders.length > 0 && files.length < 100_000) {
    const folder = folders.shift()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
      if (error || !data) break;
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) files.push(path);
        else folders.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  return files;
}

export async function removeFiles(admin: TypedSupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (!error) removed += batch.length;
  }
  return removed;
}

/**
 * Permanently deletes a workspace: files in every bucket, the live card
 * subscription (best effort) and the workspace row, whose foreign keys
 * cascade to all tenant data. A data_deletion_requests row (which survives
 * the delete) records the outcome under a confirmation code.
 */
export async function deleteWorkspace(
  admin: TypedSupabaseClient,
  input: { workspaceId: string; requesterId: string; requesterEmail: string | null },
  deps: { cancelSubscription?: (subscriptionId: string) => Promise<void>; log: Logger },
): Promise<{ confirmationCode: string; files: number }> {
  const confirmationCode = newConfirmationCode();
  const { data: request, error } = await admin
    .from('data_deletion_requests')
    .insert({ workspace_id: input.workspaceId, source: 'user_request', confirmation_code: confirmationCode, email: input.requesterEmail, status: 'processing' })
    .select('id')
    .single();
  if (error || !request) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not start the deletion.');

  await audit({ workspaceId: input.workspaceId, actorId: input.requesterId, action: 'workspace.deletion_started', metadata: { confirmationCode } });

  const { data: subscription } = await admin
    .from('billing_subscriptions')
    .select('provider, status, stripe_subscription_id')
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();
  if (subscription?.provider === 'stripe' && subscription.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(subscription.status) && deps.cancelSubscription) {
    try {
      await deps.cancelSubscription(subscription.stripe_subscription_id);
    } catch (err) {
      deps.log.error({ err, workspaceId: input.workspaceId }, 'Could not cancel the Stripe subscription during deletion');
    }
  }

  let files = 0;
  for (const bucket of WORKSPACE_BUCKETS) {
    files += await removeFiles(admin, bucket, await listFiles(admin, bucket, input.workspaceId));
  }

  const { error: deleteError } = await admin.from('workspaces').delete().eq('id', input.workspaceId);
  if (deleteError) {
    await admin.from('data_deletion_requests').update({ status: 'pending', details: { error: deleteError.message } as Json }).eq('id', request.id);
    throw new ApiError(500, 'INTERNAL_ERROR', 'Files were removed but the workspace could not be deleted. Contact support with your confirmation code.');
  }
  await admin
    .from('data_deletion_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString(), details: { files } as Json })
    .eq('id', request.id);
  return { confirmationCode, files };
}

/**
 * Right-to-erasure for one end customer: removes their media files, then the
 * contact (conversations, messages and notes cascade) and records the request.
 */
export async function eraseContact(admin: TypedSupabaseClient, input: { workspaceId: string; contactId: string; actorId: string }) {
  const { data: contact } = await admin.from('contacts').select('id, wa_id').eq('workspace_id', input.workspaceId).eq('id', input.contactId).maybeSingle();
  if (!contact) throw ApiError.notFound('Contact not found.');

  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('messages').select('media').eq('contact_id', contact.id).not('media', 'is', null).range(from, from + 999);
    for (const row of data ?? []) {
      const path = (row.media as { storagePath?: unknown } | null)?.storagePath;
      if (typeof path === 'string' && path.startsWith(`${input.workspaceId}/`)) paths.push(path);
    }
    if (!data || data.length < 1000) break;
  }
  const files = await removeFiles(admin, 'media', paths);

  const { error } = await admin.from('contacts').delete().eq('id', contact.id);
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not erase the contact.');
  const confirmationCode = newConfirmationCode();
  await admin.from('data_deletion_requests').insert({
    workspace_id: input.workspaceId,
    source: 'contact_request',
    confirmation_code: confirmationCode,
    contact_id: contact.id,
    status: 'completed',
    completed_at: new Date().toISOString(),
    details: { files, wa_id_suffix: contact.wa_id.slice(-4) } as Json,
  });
  await audit({ workspaceId: input.workspaceId, actorId: input.actorId, action: 'contact.erased', targetType: 'contact', targetId: contact.id, metadata: { files, confirmationCode } });
  return { id: contact.id, confirmationCode, files };
}

/**
 * Meta signed_request (data deletion / deauthorize callbacks):
 * base64url(HMAC-SHA256(payload, app secret)) "." base64url(JSON payload).
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id: string; issued_at?: number } | null {
  const [signature, payload] = signedRequest.split('.', 2);
  if (!signature || !payload) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest('base64url');
  if (!safeEqual(signature.replace(/=+$/, ''), expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { algorithm?: string; user_id?: unknown; issued_at?: number };
    if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || typeof data.user_id !== 'string') return null;
    return { user_id: data.user_id, issued_at: data.issued_at };
  } catch {
    return null;
  }
}

/** Revokes Talkzi's access for a Meta user: drops their WABA tokens and disconnects numbers. */
export async function disconnectMetaUser(admin: TypedSupabaseClient, fbUserId: string): Promise<{ wabaIds: string[]; workspaceIds: string[] }> {
  const { data: wabas } = await admin.from('waba_accounts').select('id, workspace_id').eq('metadata->>fb_user_id', fbUserId);
  const rows = wabas ?? [];
  for (const waba of rows) {
    await admin.from('waba_accounts').update({ access_token_encrypted: null, status: 'disconnected', webhook_subscribed: false }).eq('id', waba.id);
    await admin.from('phone_numbers').update({ status: 'DISCONNECTED', is_default: false }).eq('waba_account_id', waba.id);
    await audit({ workspaceId: waba.workspace_id, actorType: 'webhook', action: 'meta.access_revoked', targetType: 'waba_account', targetId: waba.id });
  }
  return { wabaIds: rows.map((w) => w.id), workspaceIds: [...new Set(rows.map((w) => w.workspace_id))] };
}
