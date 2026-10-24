import {
  debugToken,
  exchangeCodeForToken,
  isWhatsAppApiError,
  wabaIdsFromDebugToken,
  type PhoneNumberInfo,
  type WabaInfo,
} from '@talkzi/whatsapp';
import type { TablesInsert } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import type { WhatsAppApi } from './whatsapp';

export interface StoredWaba {
  id: string;
  wabaId: string;
  name: string | null;
}

export interface StoredPhoneNumber {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  qualityRating: string;
  isRegistered: boolean;
}

/** Persistence port so the flow can be unit-tested without Supabase. */
export interface WabaStore {
  findWabaOwner(wabaId: string): Promise<string | null>;
  upsertWaba(row: TablesInsert<'waba_accounts'>): Promise<StoredWaba>;
  upsertPhoneNumbers(rows: TablesInsert<'phone_numbers'>[]): Promise<StoredPhoneNumber[]>;
  hasDefaultPhone(workspaceId: string): Promise<boolean>;
}

export interface EmbeddedSignupDeps {
  appId: string;
  appSecret: string;
  apiVersion?: string;
  fetch?: typeof fetch;
  store: WabaStore;
  encrypt: (plaintext: string) => string;
  /** Builds a Cloud API client for the freshly issued business token. */
  createClient: (accessToken: string) => WhatsAppApi;
}

export interface EmbeddedSignupInput {
  workspaceId: string;
  userId: string;
  code?: string;
  /** Developer fallback: a System User token instead of a code. */
  accessToken?: string;
  wabaId?: string;
  phoneNumberId?: string;
  pin?: string;
}

export interface EmbeddedSignupResult {
  waba: StoredWaba;
  phoneNumbers: StoredPhoneNumber[];
  registered: string[];
  warnings: string[];
}

export function phoneRowFromMeta(
  info: PhoneNumberInfo,
  ids: { workspaceId: string; wabaAccountId: string },
): TablesInsert<'phone_numbers'> {
  return {
    workspace_id: ids.workspaceId,
    waba_account_id: ids.wabaAccountId,
    phone_number_id: info.id,
    display_phone_number: info.display_phone_number,
    verified_name: info.verified_name ?? null,
    quality_rating: (info.quality_rating ?? 'UNKNOWN').toUpperCase(),
    messaging_limit_tier: info.messaging_limit_tier ?? null,
    throughput_level: info.throughput?.level ?? null,
    code_verification_status: info.code_verification_status ?? null,
    name_status: info.name_status ?? null,
    status: (info.status ?? 'PENDING').toUpperCase(),
    is_registered: (info.status ?? '').toUpperCase() === 'CONNECTED',
    platform_type: info.platform_type ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

export function wabaRowFromMeta(info: WabaInfo): Omit<TablesInsert<'waba_accounts'>, 'workspace_id' | 'waba_id'> {
  return {
    name: info.name ?? null,
    business_id: info.owner_business_info?.id ?? null,
    currency: info.currency ?? null,
    timezone_id: info.timezone_id ?? null,
    message_template_namespace: info.message_template_namespace ?? null,
    account_review_status: info.account_review_status ?? null,
    business_verification_status: info.business_verification_status ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

const message = (e: unknown) => (isWhatsAppApiError(e) ? e.friendlyMessage : e instanceof Error ? e.message : String(e));

/**
 * Completes Meta Embedded Signup for a workspace:
 *  1. exchange the auth code for a Business Integration System User token
 *  2. inspect it (expiry, granted WABAs) via debug_token
 *  3. fetch WABA details + phone numbers
 *  4. subscribe our app to the WABA's webhooks
 *  5. optionally register the number on the Cloud API with a 6-digit PIN
 *  6. store the WABA (token encrypted) and phone numbers
 */
export async function completeEmbeddedSignup(input: EmbeddedSignupInput, deps: EmbeddedSignupDeps): Promise<EmbeddedSignupResult> {
  const warnings: string[] = [];
  const credentials = { appId: deps.appId, appSecret: deps.appSecret, apiVersion: deps.apiVersion, fetch: deps.fetch };

  let accessToken = input.accessToken;
  let expiresIn: number | undefined;
  if (!accessToken) {
    if (!input.code) throw ApiError.badRequest('Missing authorization code.');
    try {
      const exchanged = await exchangeCodeForToken({ ...credentials, code: input.code });
      accessToken = exchanged.accessToken;
      expiresIn = exchanged.expiresIn;
    } catch (error) {
      throw new ApiError(502, 'WHATSAPP_ERROR', `Meta rejected the signup code: ${message(error)}`);
    }
  }

  const tokenInfo = await debugToken({ ...credentials, inputToken: accessToken }).catch((error: unknown) => {
    warnings.push(`Could not inspect the access token: ${message(error)}`);
    return null;
  });
  if (tokenInfo && !tokenInfo.isValid) throw new ApiError(502, 'WHATSAPP_ERROR', 'Meta returned an invalid access token.');

  const wabaId = input.wabaId ?? (tokenInfo ? wabaIdsFromDebugToken(tokenInfo)[0] : undefined);
  if (!wabaId) {
    throw ApiError.badRequest('No WhatsApp Business Account was shared during signup. Please try again and select one.');
  }

  const owner = await deps.store.findWabaOwner(wabaId);
  if (owner && owner !== input.workspaceId) {
    throw ApiError.conflict('This WhatsApp Business Account is already connected to another Talkzi workspace.');
  }

  const client = deps.createClient(accessToken);
  let wabaInfo: WabaInfo;
  let numbers: PhoneNumberInfo[];
  try {
    [wabaInfo, numbers] = await Promise.all([client.getWaba(wabaId), client.listWabaPhoneNumbers(wabaId)]);
  } catch (error) {
    throw new ApiError(502, 'WHATSAPP_ERROR', `Could not read the WhatsApp Business Account: ${message(error)}`);
  }

  let webhookSubscribed = false;
  try {
    await client.subscribeApp(wabaId);
    webhookSubscribed = true;
  } catch (error) {
    warnings.push(`Webhook subscription failed — incoming messages won't arrive until it succeeds: ${message(error)}`);
  }

  const registered: string[] = [];
  const toRegister = input.pin ? numbers.filter((n) => !input.phoneNumberId || n.id === input.phoneNumberId) : [];
  for (const number of toRegister) {
    try {
      await client.registerPhoneNumber(number.id, input.pin as string);
      registered.push(number.id);
      number.status = 'CONNECTED';
    } catch (error) {
      warnings.push(`Could not register ${number.display_phone_number}: ${message(error)}`);
    }
  }

  const waba = await deps.store.upsertWaba({
    workspace_id: input.workspaceId,
    waba_id: wabaId,
    ...wabaRowFromMeta(wabaInfo),
    access_token_encrypted: deps.encrypt(accessToken),
    token_expires_at: tokenInfo?.expiresAt?.toISOString() ?? (expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null),
    token_scopes: tokenInfo?.scopes ?? [],
    webhook_subscribed: webhookSubscribed,
    status: 'connected',
    connected_by: input.userId,
    metadata: {},
  });

  const hasDefault = await deps.store.hasDefaultPhone(input.workspaceId);
  const rows = numbers.map((n, index) => ({
    ...phoneRowFromMeta(n, { workspaceId: input.workspaceId, wabaAccountId: waba.id }),
    ...(registered.includes(n.id) ? { is_registered: true } : {}),
    ...(!hasDefault && index === 0 ? { is_default: true } : {}),
  }));
  const phoneNumbers = rows.length ? await deps.store.upsertPhoneNumbers(rows) : [];
  if (numbers.length === 0) warnings.push('No phone numbers were found on this account yet.');

  return { waba, phoneNumbers, registered, warnings };
}
