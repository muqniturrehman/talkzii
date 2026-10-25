import { NextResponse, type NextRequest } from 'next/server';
import type { Json } from '@talkzi/db';
import { audit } from '@/lib/audit';
import { autoSubmitPage, easypaisaConfirmForm, EASYPAISA_SANDBOX_URL } from '@/lib/billing/local';
import { appUrl, configured, env } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (outcome: 'pending' | 'failed', reason?: string) =>
  NextResponse.redirect(
    new URL(`/app/settings/billing?payment=${outcome}&provider=easypaisa${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`, appUrl()),
    303,
  );

/**
 * Easypaisa redirects here twice: first with an auth_token (we post it back to
 * Confirm.jsf), then with the final status. The final redirect isn't signed,
 * so a successful status only marks the order `pending_verification`.
 */
async function handle(req: NextRequest) {
  if (!configured.easypaisa()) return back('failed', 'Easypaisa is not configured.');
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams);
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    form?.forEach((value, key) => {
      if (typeof value === 'string') params[key] = value;
    });
  }

  if (params.auth_token) {
    const form = easypaisaConfirmForm(params.auth_token, `${appUrl()}/api/billing/easypaisa/callback`, env().EASYPAISA_CHECKOUT_URL ?? EASYPAISA_SANDBOX_URL);
    return new NextResponse(autoSubmitPage(form, 'Confirming your Easypaisa payment…'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const reference = params.orderRefNumber ?? params.orderRefNum;
  if (!reference) return back('failed', 'Missing payment reference.');
  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin.from('billing_payments').select('id, workspace_id, plan').eq('provider', 'easypaisa').eq('reference', reference).maybeSingle();
  if (!payment) return back('failed', 'Unknown payment reference.');

  const success = params.status === '0000';
  await admin
    .from('billing_payments')
    .update({ status: success ? 'pending_verification' : 'failed', provider_response: params as Json })
    .eq('id', payment.id)
    .eq('status', 'pending');
  if (!success) return back('failed', params.desc || 'The payment was not completed.');
  await audit({ workspaceId: payment.workspace_id, actorType: 'webhook', action: 'billing.payment_pending_verification', targetType: 'billing_payment', targetId: payment.id, metadata: { provider: 'easypaisa', plan: payment.plan } });
  return back('pending');
}

export const GET = handle;
export const POST = handle;
