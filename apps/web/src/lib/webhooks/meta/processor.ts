import {
  messagePreviewText,
  parseWebhookPayload,
  SESSION_WINDOW_ERROR_CODES,
  type NormalizedWebhookEvent,
} from '@talkzi/whatsapp';
import type { Logger } from '@/lib/logger';
import type { ProcessSummary, WebhookHooks, WebhookStore } from './types';

/** Meta template webhook events → stored template status. */
export function templateStatusFromEvent(event: string): string | null {
  switch (event.toUpperCase()) {
    case 'REINSTATED':
    case 'UNPAUSED':
      return 'APPROVED';
    case 'FLAGGED':
      return null; // still approved; quality webhook carries the detail
    default:
      return event.toUpperCase();
  }
}

/**
 * Applies every event in a Meta webhook payload. Idempotent: inbound
 * messages dedupe on wamid and statuses only move forward, so Meta's
 * at-least-once retries are harmless.
 */
export async function processMetaWebhookPayload(
  payload: unknown,
  deps: { store: WebhookStore; hooks?: WebhookHooks; log: Logger },
): Promise<ProcessSummary> {
  const { store, hooks = {}, log } = deps;
  const events = parseWebhookPayload(payload);
  const summary: ProcessSummary = {
    events: events.length,
    messages: 0,
    duplicates: 0,
    statuses: 0,
    unknownPhone: 0,
    other: 0,
    hookErrors: 0,
  };

  const runHook = async (name: string, fn: () => Promise<void> | undefined) => {
    try {
      await fn();
    } catch (error) {
      summary.hookErrors += 1;
      log.error({ err: error, hook: name }, 'webhook hook failed');
    }
  };

  for (const event of events) {
    await handleEvent(event);
  }
  return summary;

  async function handleEvent(event: NormalizedWebhookEvent): Promise<void> {
    switch (event.kind) {
      case 'message': {
        const { message } = event;
        const body = message.text ?? (message.type === 'text' ? '' : messagePreviewText(message));
        const result = await store.recordInboundMessage({
          phoneNumberId: event.phoneNumberId,
          waId: event.contact.waId,
          profileName: event.contact.profileName,
          wamid: message.wamid,
          type: message.type,
          timestamp: message.timestamp,
          body: body || null,
          content: { ...message.raw, from: undefined, id: undefined, timestamp: undefined },
          media: message.media ? { ...message.media } : null,
          replyToWamid: message.context?.id ?? null,
        });

        if (result.status === 'unknown_phone_number') {
          summary.unknownPhone += 1;
          log.warn({ phoneNumberId: event.phoneNumberId }, 'message for an unknown phone number');
          return;
        }
        if (result.status === 'duplicate') {
          summary.duplicates += 1;
          return;
        }
        summary.messages += 1;
        if (hooks.onInboundMessage) {
          await runHook('onInboundMessage', () =>
            hooks.onInboundMessage?.({
              workspaceId: result.workspace_id,
              conversationId: result.conversation_id,
              contactId: result.contact_id,
              messageId: result.message_id,
              phoneNumberRowId: result.phone_number_id,
              metaPhoneNumberId: event.phoneNumberId,
              contactWaId: event.contact.waId,
              profileName: event.contact.profileName,
              message,
            }),
          );
        }
        return;
      }

      case 'status': {
        const { status } = event;
        const firstError = status.errors[0];
        const result = await store.applyMessageStatus({
          wamid: status.wamid,
          status: status.status,
          timestamp: status.timestamp,
          errorCode: firstError?.code ?? null,
          errorMessage: firstError ? (firstError.error_data?.details ?? firstError.message ?? firstError.title ?? null) : null,
          pricingCategory: status.pricing?.category ?? status.conversation?.category ?? null,
          pricingBillable: status.pricing?.billable ?? null,
          pricingModel: status.pricing?.model ?? null,
          pricingType: status.pricing?.type ?? null,
          metaConversationId: status.conversation?.id ?? null,
          metaConversationExpiresAt: status.conversation?.expiresAt ?? null,
        });
        summary.statuses += 1;

        if (status.status === 'failed' && firstError && SESSION_WINDOW_ERROR_CODES.has(firstError.code) && result.conversation_id) {
          await store.closeSessionWindow(result.conversation_id, status.timestamp);
        }
        if (result.workspace_id && hooks.onStatus) {
          await runHook('onStatus', () =>
            hooks.onStatus?.({
              workspaceId: result.workspace_id as string,
              conversationId: result.conversation_id,
              messageId: result.message_id,
              broadcastId: result.broadcast_id,
              status,
            }),
          );
        }
        return;
      }

      case 'template_status': {
        summary.other += 1;
        const updated = await store.updateTemplateStatus({
          wabaId: event.wabaId,
          metaTemplateId: event.templateId,
          name: event.name,
          language: event.language,
          event: event.event,
          reason: event.reason,
        });
        if (updated && hooks.onTemplateStatus) {
          await runHook('onTemplateStatus', () =>
            hooks.onTemplateStatus?.({ ...updated, status: event.event, reason: event.reason }),
          );
        }
        return;
      }

      case 'template_quality':
        summary.other += 1;
        await store.updateTemplateQuality({ wabaId: event.wabaId, metaTemplateId: event.templateId, score: event.newScore });
        return;

      case 'template_category':
        summary.other += 1;
        await store.updateTemplateCategory({ wabaId: event.wabaId, metaTemplateId: event.templateId, category: event.newCategory });
        return;

      case 'phone_quality': {
        summary.other += 1;
        const phone = await store.recordPhoneQuality({
          wabaId: event.wabaId,
          displayPhoneNumber: event.displayPhoneNumber,
          event: event.event,
          currentLimit: event.currentLimit,
          payload: { event: event.event, currentLimit: event.currentLimit, oldLimit: event.oldLimit },
        });
        // Protect the number: stop broadcasting when quality is low.
        if (phone && (phone.qualityRating === 'RED' || event.event === 'FLAGGED')) {
          const paused = await store.pauseBroadcastsForPhone(phone.phoneRowId, `Paused automatically: number quality ${event.event}`);
          if (paused) log.warn({ phoneRowId: phone.phoneRowId, paused }, 'broadcasts paused due to quality rating');
        }
        return;
      }

      case 'phone_name':
        summary.other += 1;
        await store.updatePhoneName({
          wabaId: event.wabaId,
          displayPhoneNumber: event.displayPhoneNumber,
          decision: event.decision,
          requestedName: event.requestedName,
          rejectionReason: event.rejectionReason,
        });
        return;

      case 'account_review':
        summary.other += 1;
        await store.updateWabaReview({ wabaId: event.wabaId, decision: event.decision });
        return;

      case 'account_update': {
        summary.other += 1;
        const severe = ['DISABLED_UPDATE', 'ACCOUNT_VIOLATION', 'ACCOUNT_RESTRICTION', 'ACCOUNT_DELETED', 'PARTNER_REMOVED'];
        await store.recordWabaEvent({
          wabaId: event.wabaId,
          key: 'last_account_update',
          value: { event: event.event, phoneNumber: event.phoneNumber, ...event.details, at: new Date().toISOString() },
          status: severe.includes(event.event) ? 'error' : undefined,
        });
        return;
      }

      case 'business_capability':
        summary.other += 1;
        await store.recordWabaEvent({
          wabaId: event.wabaId,
          key: 'capabilities',
          value: {
            maxDailyConversationsPerPhone: event.maxDailyConversationsPerPhone,
            maxPhoneNumbersPerBusiness: event.maxPhoneNumbersPerBusiness,
            maxPhoneNumbersPerWaba: event.maxPhoneNumbersPerWaba,
          },
        });
        return;

      case 'error':
        summary.other += 1;
        log.warn({ wabaId: event.wabaId, errors: event.errors }, 'Meta webhook reported errors');
        return;

      case 'unknown':
        summary.other += 1;
        log.debug({ field: event.field }, 'ignoring unhandled webhook field');
        return;
    }
  }
}
