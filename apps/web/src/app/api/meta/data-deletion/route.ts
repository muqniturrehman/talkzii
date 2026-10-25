import { NextResponse, type NextRequest } from 'next/server';
import type { Json } from '@talkzi/db';
import { ApiError, errorResponse } from '@/lib/api/errors';
import { disconnectMetaUser, newConfirmationCode, parseSignedRequest } from '@/lib/compliance/deletion';
import { appUrl, env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Meta "Data Deletion Request" callback (App Dashboard → Settings → Basic).
 * Verifies the signed_request, revokes that user's WhatsApp tokens, records
 * the request and returns the status URL + confirmation code Meta shows them.
 */
export async function POST(req: NextRequest) {
  const log = logger.child({ callback: 'meta-data-deletion' });
  try {
    const secret = env().META_APP_SECRET;
    if (!secret) throw ApiError.notConfigured('Meta app secret');
    const form = await req.formData().catch(() => null);
    const signed = form?.get('signed_request');
    const payload = typeof signed === 'string' ? parseSignedRequest(signed, secret) : null;
    if (!payload) throw ApiError.badRequest('Invalid signed_request.');

    const admin = createSupabaseAdminClient();
    const { wabaIds, workspaceIds } = await disconnectMetaUser(admin, payload.user_id);
    const code = newConfirmationCode();
    await admin.from('data_deletion_requests').insert({
      source: 'meta_callback',
      confirmation_code: code,
      meta_user_id: payload.user_id,
      workspace_id: workspaceIds[0] ?? null,
      // Unmatched requests stay pending for manual review within 30 days.
      status: wabaIds.length ? 'completed' : 'pending',
      completed_at: wabaIds.length ? new Date().toISOString() : null,
      details: { waba_account_ids: wabaIds, workspace_ids: workspaceIds } as Json,
    });
    log.info({ matched: wabaIds.length }, 'Meta data deletion request recorded');
    return NextResponse.json({ url: `${appUrl()}/data-deletion?code=${code}`, confirmation_code: code });
  } catch (error) {
    return errorResponse(error, log);
  }
}
