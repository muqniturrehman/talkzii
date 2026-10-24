import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { WabaStore } from './embedded-signup';

/** Supabase (service role) implementation of the Embedded Signup store. */
export function createSupabaseWabaStore(admin: TypedSupabaseClient): WabaStore {
  return {
    async findWabaOwner(wabaId) {
      const { data } = await admin.from('waba_accounts').select('workspace_id').eq('waba_id', wabaId).maybeSingle();
      return data?.workspace_id ?? null;
    },
    async upsertWaba(row) {
      const { data, error } = await admin
        .from('waba_accounts')
        .upsert(row, { onConflict: 'waba_id' })
        .select('id, waba_id, name')
        .single();
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not save the WhatsApp account: ${error.message}`);
      return { id: data.id, wabaId: data.waba_id, name: data.name };
    },
    async upsertPhoneNumbers(rows) {
      const { data, error } = await admin
        .from('phone_numbers')
        .upsert(rows, { onConflict: 'phone_number_id' })
        .select('id, phone_number_id, display_phone_number, verified_name, quality_rating, is_registered');
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not save phone numbers: ${error.message}`);
      return (data ?? []).map((p) => ({
        id: p.id,
        phoneNumberId: p.phone_number_id,
        displayPhoneNumber: p.display_phone_number,
        verifiedName: p.verified_name,
        qualityRating: p.quality_rating,
        isRegistered: p.is_registered,
      }));
    },
    async hasDefaultPhone(workspaceId) {
      const { count } = await admin
        .from('phone_numbers')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('is_default', true);
      return (count ?? 0) > 0;
    },
  };
}
