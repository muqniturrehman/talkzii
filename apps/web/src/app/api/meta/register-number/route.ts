import { isWhatsAppApiError } from '@talkzi/whatsapp';
import { phoneNumberActionSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { getPhoneContext } from '@/lib/meta/whatsapp';

function metaError(error: unknown): never {
  if (isWhatsAppApiError(error)) throw new ApiError(502, 'WHATSAPP_ERROR', error.friendlyMessage, { code: error.code });
  throw error;
}

/**
 * Phone number lifecycle: register with a 6-digit PIN, request / verify the
 * ownership code, request a display-name change, set the default number and
 * update the WhatsApp business profile.
 */
export const POST = createHandler({ role: 'admin', body: phoneNumberActionSchema }, async ({ body, workspace, user, admin, req }) => {
  const db = admin();
  const { client, phone } = await getPhoneContext(db, workspace.id, body.phoneNumberId);
  const metaId = phone.phone_number_id;

  switch (body.action) {
    case 'register': {
      await client.registerPhoneNumber(metaId, body.pin).catch(metaError);
      unwrap(await db.from('phone_numbers').update({ is_registered: true, status: 'CONNECTED' }).eq('id', phone.id));
      await audit({ workspaceId: workspace.id, actorId: user.id, action: 'phone.registered', targetType: 'phone_number', targetId: metaId, req });
      return { registered: true };
    }
    case 'request_code': {
      await client.requestVerificationCode(metaId, { method: body.method }).catch(metaError);
      return { requested: true };
    }
    case 'verify_code': {
      await client.verifyPhoneNumber(metaId, body.code).catch(metaError);
      unwrap(await db.from('phone_numbers').update({ code_verification_status: 'VERIFIED' }).eq('id', phone.id));
      return { verified: true };
    }
    case 'display_name': {
      await client.requestDisplayNameChange(metaId, body.displayName).catch(metaError);
      unwrap(
        await db
          .from('phone_numbers')
          .update({ requested_display_name: body.displayName, name_status: 'PENDING_REVIEW' })
          .eq('id', phone.id),
      );
      await audit({
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'phone.display_name_requested',
        targetType: 'phone_number',
        targetId: metaId,
        metadata: { displayName: body.displayName },
        req,
      });
      return { requested: true };
    }
    case 'set_default': {
      unwrap(await db.from('phone_numbers').update({ is_default: false }).eq('workspace_id', workspace.id).eq('is_default', true));
      unwrap(await db.from('phone_numbers').update({ is_default: true }).eq('id', phone.id));
      return { default: phone.id };
    }
    case 'profile': {
      await client.updatePhoneProfile(metaId, body.profile).catch(metaError);
      return { updated: true };
    }
  }
});
