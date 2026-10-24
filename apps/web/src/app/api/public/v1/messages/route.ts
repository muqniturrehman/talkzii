import { publicSendMessageSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { createPublicHandler } from '@/lib/public-api/handler';
import { sendPublicMessage } from '@/lib/public-api/service';

export const maxDuration = 30;

/** POST /api/public/v1/messages — send a text (24h window) or an approved template. */
export const POST = createPublicHandler({ scope: 'messages:write', body: publicSendMessageSchema }, async ({ admin, key, body, log, req }) => {
  const result = await sendPublicMessage(admin, key.workspace, body, log);
  await audit({
    workspaceId: key.workspace.id,
    actorId: key.userId,
    actorType: 'api_key',
    action: 'api.message_sent',
    targetType: 'message',
    targetId: result.id,
    metadata: { apiKeyId: key.keyId, type: body.type },
    req,
  });
  return result;
});
