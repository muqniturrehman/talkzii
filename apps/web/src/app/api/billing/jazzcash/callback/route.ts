import { NextResponse, type NextRequest } from 'next/server';
import type { Json } from '@talkzi/db';
import { audit } from '@/lib/audit';
import { verifyJazzcashCallback } from '@/lib/billing/local';
import { appUrl, configured, env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readFields(req: NextRequest): Promise<Record<string, string>> {
  const fields: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams);
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === 'string') fields[key] = value;
    });
  }
  return fields;
}

const back = (outcome: 'success' | 'failed', reason?: string) =>
  NextResponse.redirect(
    new URL(`/app/settings/billing?payment=${outcome}&provider=jazzcash${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`, appUrl()),
    303,
  );

/**
 * JazzCash return URL. The response is signed with the integrity salt, so a
 * verified "000" response for the expected amount activates the plan.
 */
async function handle(req: NextRequest) {
  const log = logger.child({ callback: 'jazzcash' });
  if (!configured.jazzcash()) return back('failed', 'JazzCash is not configured.');
  const fields = await readFields(req);
  if (!verifyJazzcashCallback(fields, env().JAZZCASH_INTEGRITY_SALT!)) {
    log.warn({ ref: fields.pp_TxnRefNo }, 'JazzCash callback with an invalid signature');
    return back('failed', 'The payment response could not be verified.');
  }

  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin
    .from('billing_payments')
    .select('id, workspace_id, amount, status, plan')
    .eq('provider', 'jazzcash')
    .eq('reference', fields.pp_TxnRefNo ?? '')
    .maybeSingle();
  if (!payment) return back('failed', 'Unknown payment reference.');

  const { pp_SecureHash: _hash, pp_Password: _password, ...response } = fields;
  const paid = fields.pp_ResponseCode === '000' && fields.pp_Amount === String(Math.round(Number(payment.amount) * 100));
  if (!paid) {
    await admin
      .from('billing_payments')
      .update({ status: 'failed', provider_response: response as Json })
      .eq('id', payment.id)
      .eq('status', 'pending');
    return back('failed', fields.pp_ResponseMessage || 'The payment was not completed.');
  }

  const { error } = await admin.rpc('activate_prepaid_plan', { p_payment_id: payment.id, p_response: response as Json });
  if (error) {
    log.error({ err: error, paymentId: payment.id }, 'Could not activate prepaid plan');
    return back('failed', 'Payment received but activation failed — contact support with your reference.');
  }
  await audit({ workspaceId: payment.workspace_id, actorType: 'webhook', action: 'billing.payment_received', targetType: 'billing_payment', targetId: payment.id, metadata: { provider: 'jazzcash', plan: payment.plan } });
  return back('success');
}

export const GET = handle;
export const POST = handle;
