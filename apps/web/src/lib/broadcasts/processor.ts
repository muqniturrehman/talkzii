import { variableMappingSchema } from '@talkzi/shared';
import { isWhatsAppApiError, type MessagePayload } from '@talkzi/whatsapp';
import { buildTemplateSendComponents, renderTemplatePreview, summarizeTemplate, tierLimit } from '@talkzi/whatsapp/templates';
import type { Logger } from '@/lib/logger';
import type { WhatsAppApi } from '@/lib/meta/whatsapp';
import { resolveTemplateValues, type RecipientContact } from './variables';

export interface ProcessBroadcastRow {
  id: string;
  workspace_id: string;
  status: string;
  phone_number_id: string | null;
  variable_mapping: unknown;
  template: { id: string; name: string; language: string; category: string; status: string; components: unknown } | null;
}

export interface ProcessPhoneRow {
  id: string;
  phone_number_id: string;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
}

export interface RecipientRow {
  id: string;
  contact_id: string | null;
  wa_id: string;
  attempts: number;
}

export interface ProcessContactRow extends RecipientContact {
  id: string;
  opted_out: boolean;
}

export interface BroadcastStore {
  getBroadcast(id: string): Promise<ProcessBroadcastRow | null>;
  getPhone(workspaceId: string, phoneRowId: string): Promise<ProcessPhoneRow | null>;
  /** Business-initiated broadcast sends from this number in the last 24h (tier usage). */
  sentInLast24h(phoneRowId: string): Promise<number>;
  markSending(broadcastId: string): Promise<void>;
  claimRecipients(broadcastId: string, limit: number): Promise<RecipientRow[]>;
  getContacts(workspaceId: string, ids: string[]): Promise<Map<string, ProcessContactRow>>;
  recordMessage(input: {
    workspaceId: string;
    contactId: string;
    phoneNumberRowId: string;
    broadcastId: string;
    templateId: string;
    body: string;
    content: Record<string, unknown>;
    clientMessageId: string;
  }): Promise<{ id: string; status: string; wamid: string | null; duplicate: boolean }>;
  markSent(input: { recipientId: string; messageId: string; wamid: string }): Promise<void>;
  markFailed(input: { recipientId: string; messageId: string | null; code: number | null; message: string }): Promise<void>;
  retryLater(recipientId: string, at: Date, message: string): Promise<void>;
  skip(recipientId: string, reason: string): Promise<void>;
  markContactOptedOut(contactId: string, reason: string): Promise<void>;
  pause(broadcastId: string, reason: string): Promise<void>;
  completeIfDone(broadcastId: string): Promise<boolean>;
}

export interface ProcessDeps {
  store: BroadcastStore;
  getClient: (workspaceId: string, phoneRowId: string) => Promise<WhatsAppApi>;
  log: Logger;
  now?: () => Date;
}

export interface ProcessResult {
  broadcastId: string;
  workspaceId: string | null;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
  done: boolean;
  paused: string | null;
  waiting: 'tier_limit' | null;
}

/** Errors that mean "stop this broadcast now" to protect the number/account. */
const PAUSE_CODES = new Set([368, 131031, 131042, 131048, 130497]);
/** The customer turned off marketing messages from this business inside WhatsApp. */
const STOPPED_MARKETING = 131050;
const MAX_ATTEMPTS = 3;
const SLICE = 50;
const CONCURRENCY = 10;

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Sends the next slices of one broadcast until the deadline, the per-tick cap
 * or the number's 24h messaging tier is reached. Opted-out contacts are
 * skipped at send time, retryable Meta errors back off, account-level
 * errors and RED quality pause the broadcast.
 */
export async function processBroadcast(
  deps: ProcessDeps,
  broadcastId: string,
  options: { deadline: number; maxPerTick?: number },
): Promise<ProcessResult> {
  const { store, log } = deps;
  const now = () => deps.now?.() ?? new Date();
  const result: ProcessResult = { broadcastId, workspaceId: null, sent: 0, failed: 0, skipped: 0, retried: 0, done: false, paused: null, waiting: null };

  const broadcast = await store.getBroadcast(broadcastId);
  if (!broadcast || !['scheduled', 'sending'].includes(broadcast.status)) return { ...result, done: true };
  result.workspaceId = broadcast.workspace_id;

  const pause = async (reason: string) => {
    await store.pause(broadcast.id, reason);
    result.paused = reason;
    return result;
  };

  const template = broadcast.template;
  if (!template || template.status !== 'APPROVED') return pause('Template is no longer approved by Meta.');
  if (!broadcast.phone_number_id) return pause('No WhatsApp number selected.');
  const phone = await store.getPhone(broadcast.workspace_id, broadcast.phone_number_id);
  if (!phone) return pause('The WhatsApp number was disconnected.');
  if (phone.quality_rating === 'RED') return pause('Paused automatically: number quality is RED.');

  let capacity = tierLimit(phone.messaging_limit_tier) - (await store.sentInLast24h(phone.id));
  if (capacity <= 0) {
    result.waiting = 'tier_limit';
    return result;
  }

  if (broadcast.status === 'scheduled') await store.markSending(broadcast.id);

  const mapping = variableMappingSchema.parse(broadcast.variable_mapping ?? {});
  const summary = summarizeTemplate(template.components);
  const marketing = template.category === 'MARKETING';
  const client = await deps.getClient(broadcast.workspace_id, phone.id);
  const maxPerTick = options.maxPerTick ?? 1_500;
  let processed = 0;
  let stop: string | null = null;

  while (!stop && Date.now() < options.deadline && processed < maxPerTick && capacity > 0) {
    const recipients = await store.claimRecipients(broadcast.id, Math.min(SLICE, capacity, maxPerTick - processed));
    if (recipients.length === 0) break;
    processed += recipients.length;
    const contacts = await store.getContacts(
      broadcast.workspace_id,
      recipients.flatMap((r) => (r.contact_id ? [r.contact_id] : [])),
    );

    await inBatches(recipients, CONCURRENCY, async (recipient) => {
      if (stop) {
        await store.retryLater(recipient.id, now(), 'Broadcast paused');
        return;
      }
      const contact = recipient.contact_id ? contacts.get(recipient.contact_id) : undefined;
      if (!contact) {
        await store.skip(recipient.id, 'Contact was deleted');
        result.skipped++;
        return;
      }
      if (contact.opted_out && marketing) {
        await store.skip(recipient.id, 'Contact opted out');
        result.skipped++;
        return;
      }

      const values = resolveTemplateValues(mapping, contact);
      let payload: MessagePayload;
      try {
        const components = buildTemplateSendComponents(summary, values);
        payload = { type: 'template', template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) } };
      } catch (error) {
        await store.markFailed({ recipientId: recipient.id, messageId: null, code: null, message: (error as Error).message });
        result.failed++;
        return;
      }

      const message = await store.recordMessage({
        workspaceId: broadcast.workspace_id,
        contactId: contact.id,
        phoneNumberRowId: phone.id,
        broadcastId: broadcast.id,
        templateId: template.id,
        body: renderTemplatePreview(summary, values),
        content: { template: { name: template.name, language: template.language, category: template.category } },
        clientMessageId: `bc-${recipient.id}`,
      });
      if (message.duplicate && message.wamid && !['queued', 'failed'].includes(message.status)) {
        await store.markSent({ recipientId: recipient.id, messageId: message.id, wamid: message.wamid });
        result.sent++;
        return;
      }

      try {
        const sent = await client.sendMessage(phone.phone_number_id, recipient.wa_id, payload);
        await store.markSent({ recipientId: recipient.id, messageId: message.id, wamid: sent.wamid });
        result.sent++;
        capacity--;
      } catch (error) {
        if (!isWhatsAppApiError(error)) {
          log.error({ err: error, recipientId: recipient.id }, 'Unexpected broadcast send error');
          await store.retryLater(recipient.id, new Date(now().getTime() + 60_000), 'Unexpected error');
          result.retried++;
          return;
        }
        if (error.retryable && recipient.attempts < MAX_ATTEMPTS) {
          await store.retryLater(recipient.id, new Date(now().getTime() + 2 ** recipient.attempts * 30_000), error.friendlyMessage);
          result.retried++;
          return;
        }
        await store.markFailed({ recipientId: recipient.id, messageId: message.id, code: error.code, message: error.friendlyMessage });
        result.failed++;
        if (error.code === STOPPED_MARKETING) await store.markContactOptedOut(contact.id, 'Stopped marketing messages in WhatsApp');
        if (error.code !== null && PAUSE_CODES.has(error.code)) stop = `Paused automatically: ${error.friendlyMessage}`;
      }
    });
  }

  if (stop) return pause(stop);
  result.done = await store.completeIfDone(broadcast.id);
  if (capacity <= 0 && !result.done) result.waiting = 'tier_limit';
  return result;
}
