import 'server-only';
import { WhatsAppClient } from '@talkzi/whatsapp';
import type { Tables } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { decryptSecret } from '@/lib/crypto';
import { env, graphApiVersion } from '@/lib/env';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { createMockWhatsAppClient } from './mock-client';

/** The Cloud API surface the app uses (implemented by WhatsAppClient and the mock). */
export type WhatsAppApi = Pick<
  WhatsAppClient,
  | 'sendMessage'
  | 'sendText'
  | 'sendTemplate'
  | 'sendImage'
  | 'sendVideo'
  | 'sendAudio'
  | 'sendDocument'
  | 'sendLocation'
  | 'sendContacts'
  | 'sendInteractiveButtons'
  | 'sendInteractiveList'
  | 'sendInteractiveCta'
  | 'sendReaction'
  | 'markAsRead'
  | 'uploadMedia'
  | 'getMediaUrl'
  | 'downloadMedia'
  | 'createTemplate'
  | 'listAllTemplates'
  | 'getTemplateStatus'
  | 'editTemplate'
  | 'deleteTemplate'
  | 'uploadTemplateExample'
  | 'registerPhoneNumber'
  | 'requestVerificationCode'
  | 'verifyPhoneNumber'
  | 'updatePhoneProfile'
  | 'getPhoneProfile'
  | 'getPhoneQuality'
  | 'getPhoneNumber'
  | 'listWabaPhoneNumbers'
  | 'requestDisplayNameChange'
  | 'getWaba'
  | 'subscribeApp'
  | 'unsubscribeApp'
>;

type WabaRow = Pick<Tables<'waba_accounts'>, 'id' | 'workspace_id' | 'waba_id' | 'access_token_encrypted' | 'metadata' | 'status'>;
type PhoneRow = Pick<
  Tables<'phone_numbers'>,
  'id' | 'workspace_id' | 'waba_account_id' | 'phone_number_id' | 'display_phone_number' | 'verified_name' | 'quality_rating' | 'messaging_limit_tier' | 'status' | 'is_registered'
>;

export interface WabaContext {
  waba: WabaRow;
  client: WhatsAppApi;
  mock: boolean;
}

export interface PhoneContext extends WabaContext {
  phone: PhoneRow;
}

export function isMockWaba(waba: Pick<WabaRow, 'metadata'>): boolean {
  if (process.env.WHATSAPP_MOCK === 'true') return true;
  const metadata = waba.metadata as { mock?: boolean } | null;
  return metadata?.mock === true;
}

/** Real client for a token (with appsecret_proof when the app secret is set). */
export function createWhatsAppClient(accessToken: string): WhatsAppClient {
  return new WhatsAppClient({
    accessToken,
    appSecret: env().META_APP_SECRET,
    apiVersion: graphApiVersion(),
  });
}

export function clientForWaba(waba: WabaRow): { client: WhatsAppApi; mock: boolean } {
  if (isMockWaba(waba)) return { client: createMockWhatsAppClient(), mock: true };
  const token = waba.access_token_encrypted
    ? decryptSecret(waba.access_token_encrypted)
    : (env().META_SYSTEM_USER_TOKEN ?? null);
  if (!token) {
    throw ApiError.conflict('This WhatsApp account has no access token. Reconnect it from WhatsApp numbers.', 'WHATSAPP_ERROR');
  }
  return { client: createWhatsAppClient(token), mock: false };
}

const WABA_COLUMNS = 'id, workspace_id, waba_id, access_token_encrypted, metadata, status';
const PHONE_COLUMNS =
  'id, workspace_id, waba_account_id, phone_number_id, display_phone_number, verified_name, quality_rating, messaging_limit_tier, status, is_registered';

/** Loads a WABA (service role) scoped to the workspace and builds its client. */
export async function getWabaContext(admin: TypedSupabaseClient, workspaceId: string, wabaAccountId: string): Promise<WabaContext> {
  const { data, error } = await admin
    .from('waba_accounts')
    .select(WABA_COLUMNS)
    .eq('id', wabaAccountId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  if (!data) throw ApiError.notFound('WhatsApp Business Account not found.');
  return { waba: data, ...clientForWaba(data) };
}

/** Loads a phone number + its WABA client. Falls back to the workspace default number. */
export async function getPhoneContext(
  admin: TypedSupabaseClient,
  workspaceId: string,
  phoneNumberRowId?: string | null,
): Promise<PhoneContext> {
  let query = admin.from('phone_numbers').select(PHONE_COLUMNS).eq('workspace_id', workspaceId);
  query = phoneNumberRowId ? query.eq('id', phoneNumberRowId) : query.order('is_default', { ascending: false }).order('created_at');
  const { data: phones, error } = await query.limit(1);
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  const phone = phones?.[0];
  if (!phone) {
    throw ApiError.conflict('Connect a WhatsApp number first (WhatsApp numbers → Connect).', 'WHATSAPP_ERROR');
  }
  const wabaCtx = await getWabaContext(admin, workspaceId, phone.waba_account_id);
  return { ...wabaCtx, phone };
}
