import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api/errors';
import { disconnectMetaUser, parseSignedRequest } from '@/lib/compliance/deletion';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/** Meta "Deauthorize" callback: the user removed Talkzi, so drop their tokens (data is kept). */
export async function POST(req: NextRequest) {
  const log = logger.child({ callback: 'meta-deauthorize' });
  try {
    const secret = env().META_APP_SECRET;
    if (!secret) throw ApiError.notConfigured('Meta app secret');
    const form = await req.formData().catch(() => null);
    const signed = form?.get('signed_request');
    const payload = typeof signed === 'string' ? parseSignedRequest(signed, secret) : null;
    if (!payload) throw ApiError.badRequest('Invalid signed_request.');
    const { wabaIds } = await disconnectMetaUser(createSupabaseAdminClient(), payload.user_id);
    log.info({ disconnected: wabaIds.length }, 'Meta deauthorization processed');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, log);
  }
}
