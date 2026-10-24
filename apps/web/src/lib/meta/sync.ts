import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { phoneRowFromMeta, wabaRowFromMeta } from './embedded-signup';
import { getWabaContext } from './whatsapp';

/** Refreshes WABA details and phone numbers (quality, tier, name status) from Meta. */
export async function syncWaba(admin: TypedSupabaseClient, workspaceId: string, wabaAccountId: string) {
  const { waba, client, mock } = await getWabaContext(admin, workspaceId, wabaAccountId);
  if (mock) return { synced: 0, mock: true };

  const [info, numbers] = await Promise.all([client.getWaba(waba.waba_id), client.listWabaPhoneNumbers(waba.waba_id)]);

  const { error: wabaError } = await admin
    .from('waba_accounts')
    .update({ ...wabaRowFromMeta(info), status: 'connected' })
    .eq('id', waba.id)
    .eq('workspace_id', workspaceId);
  if (wabaError) throw new ApiError(500, 'INTERNAL_ERROR', wabaError.message);

  if (numbers.length) {
    const rows = numbers.map((n) => {
      const row = phoneRowFromMeta(n, { workspaceId, wabaAccountId: waba.id });
      // Don't downgrade registration we performed ourselves.
      delete row.is_registered;
      return row;
    });
    const { error } = await admin.from('phone_numbers').upsert(rows, { onConflict: 'phone_number_id' });
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  }
  return { synced: numbers.length, mock: false };
}
