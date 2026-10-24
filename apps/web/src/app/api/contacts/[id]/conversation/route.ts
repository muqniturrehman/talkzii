import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';

/**
 * Finds or opens the conversation between a contact and a business number
 * (default number unless given), so agents can start with a template.
 */
export const POST = createHandler(
  { role: 'agent', body: z.object({ phoneNumberId: z.uuid().optional() }) },
  async ({ supabase, params, body, workspace }) => {
    const contactId = requireUuid(params.id, 'Contact');
    const { data: contact } = await supabase.from('contacts').select('id').eq('id', contactId).maybeSingle();
    if (!contact) throw ApiError.notFound('Contact not found.');

    let phoneQuery = supabase.from('phone_numbers').select('id').eq('workspace_id', workspace.id);
    phoneQuery = body.phoneNumberId
      ? phoneQuery.eq('id', body.phoneNumberId)
      : phoneQuery.order('is_default', { ascending: false }).order('created_at');
    const { data: phones } = await phoneQuery.limit(1);
    const phone = phones?.[0];
    if (!phone) throw ApiError.conflict('Connect a WhatsApp number first (WhatsApp numbers → Connect).', 'WHATSAPP_ERROR');

    const { error } = await supabase
      .from('conversations')
      .upsert({ workspace_id: workspace.id, contact_id: contactId, phone_number_id: phone.id }, {
        onConflict: 'workspace_id,contact_id,phone_number_id',
        ignoreDuplicates: true,
      });
    if (error) throw ApiError.forbidden();
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .eq('phone_number_id', phone.id)
      .maybeSingle();
    if (!conversation) throw ApiError.notFound('Conversation could not be opened.');
    return { conversationId: conversation.id };
  },
);
