import 'server-only';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

/** Phone numbers and approved templates for the broadcast wizard (RLS-scoped). */
export async function loadWizardData(supabase: TypedSupabaseClient) {
  const [phones, templates] = await Promise.all([
    supabase.from('phone_numbers').select('id, display_phone_number, verified_name, quality_rating').order('is_default', { ascending: false }).order('created_at'),
    supabase.from('message_templates').select('id, name, language, category, components').eq('status', 'APPROVED').order('name'),
  ]);
  return { phones: phones.data ?? [], templates: templates.data ?? [] };
}
