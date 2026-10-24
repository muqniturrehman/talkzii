import {
  estimateCost,
  planLimit,
  templateCategoryToPricing,
  variableMappingSchema,
  type PlanId,
  type VariableMapping,
} from '@talkzi/shared';
import { buildTemplateSendComponents, summarizeTemplate } from '@talkzi/whatsapp/templates';
import { ApiError } from '@/lib/api/errors';
import type { BroadcastQueue } from './queue';
import { resolveTemplateValues } from './variables';

export interface LaunchBroadcastRow {
  id: string;
  status: string;
  template_id: string | null;
  phone_number_id: string | null;
  variable_mapping: unknown;
}

export interface LaunchTemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
}

export interface LaunchPhoneRow {
  id: string;
  quality_rating: string | null;
  status: string | null;
}

export interface LaunchStore {
  getBroadcast(workspaceId: string, id: string): Promise<LaunchBroadcastRow | null>;
  getTemplate(workspaceId: string, id: string): Promise<LaunchTemplateRow | null>;
  /** The given number, or the workspace default when id is null. */
  getPhone(workspaceId: string, id: string | null): Promise<LaunchPhoneRow | null>;
  /** Broadcast recipients already used this billing month. */
  recipientsUsedThisMonth(workspaceId: string): Promise<number>;
  materialize(broadcastId: string, maxRecipients: number | null): Promise<{ total: number; sendable: number; skipped: number }>;
  markScheduled(
    broadcastId: string,
    patch: { scheduledAt: string; phoneNumberId: string; templateName: string; templateLanguage: string; estimatedCost: number },
  ): Promise<void>;
  recordUsage(workspaceId: string, recipients: number): Promise<void>;
}

export interface LaunchDeps {
  store: LaunchStore;
  queue: Pick<BroadcastQueue, 'enqueue'>;
  now?: () => Date;
}

export interface LaunchResult {
  status: 'scheduled';
  scheduledAt: string;
  recipients: { total: number; sendable: number; skipped: number };
  estimatedCost: number;
}

const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

/** Throws VALIDATION_ERROR unless every template variable has a mapping. */
export function assertMappingComplete(template: Pick<LaunchTemplateRow, 'components'>, mapping: VariableMapping) {
  const sample = { name: 'Sample', profile_name: null, wa_id: '923000000000', custom_fields: {} };
  try {
    buildTemplateSendComponents(summarizeTemplate(template.components), resolveTemplateValues(mapping, sample));
  } catch (error) {
    throw ApiError.validation({ formErrors: [(error as Error).message] }, (error as Error).message);
  }
}

/**
 * Launches (or reschedules) a broadcast: validates the approved template,
 * variable mapping and number quality, snapshots the audience within the
 * plan's monthly recipient allowance, then enqueues it for the cron worker.
 */
export async function launchBroadcast(
  deps: LaunchDeps,
  input: { workspace: { id: string; plan: PlanId }; broadcastId: string; scheduledAt?: string },
): Promise<LaunchResult> {
  const now = deps.now?.() ?? new Date();
  const { store } = deps;
  const broadcast = await store.getBroadcast(input.workspace.id, input.broadcastId);
  if (!broadcast) throw ApiError.notFound('Broadcast not found.');
  if (!['draft', 'scheduled'].includes(broadcast.status)) {
    throw ApiError.conflict(`This broadcast is already ${broadcast.status}.`);
  }
  if (!broadcast.template_id) throw ApiError.validation({ fieldErrors: { templateId: ['Choose a template'] } });

  const template = await store.getTemplate(input.workspace.id, broadcast.template_id);
  if (!template) throw ApiError.notFound('Template not found.');
  if (template.status !== 'APPROVED') {
    throw ApiError.conflict(`“${template.name}” is ${template.status.toLowerCase()} — broadcasts need an approved template.`, 'TEMPLATE_NOT_APPROVED');
  }
  const mapping = variableMappingSchema.parse(broadcast.variable_mapping ?? {});
  assertMappingComplete(template, mapping);

  const phone = await store.getPhone(input.workspace.id, broadcast.phone_number_id);
  if (!phone) throw ApiError.conflict('Connect a WhatsApp number first (WhatsApp numbers → Connect).', 'WHATSAPP_ERROR');
  if (phone.quality_rating === 'RED') {
    throw ApiError.conflict('This number’s quality rating is RED. Broadcasting now could get it restricted — wait for it to recover.', 'WHATSAPP_ERROR');
  }

  let scheduledAt = now;
  if (input.scheduledAt) {
    scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < now.getTime() - 60_000) {
      throw ApiError.validation({ fieldErrors: { scheduledAt: ['Pick a time in the future'] } });
    }
    if (scheduledAt.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      throw ApiError.validation({ fieldErrors: { scheduledAt: ['Schedule at most 30 days ahead'] } });
    }
  }

  const limit = planLimit(input.workspace.plan, 'broadcast_recipients_per_month');
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - (await store.recipientsUsedThisMonth(input.workspace.id))) : null;

  let recipients: { total: number; sendable: number; skipped: number };
  try {
    recipients = await store.materialize(broadcast.id, remaining);
  } catch (error) {
    const match = /plan_limit:(\d+):(\d+)/.exec((error as Error).message ?? '');
    if (match) {
      throw new ApiError(
        403,
        'PLAN_LIMIT',
        `This audience has ${Number(match[1]).toLocaleString()} contacts but your plan has ${Number(match[2]).toLocaleString()} broadcast recipients left this month. Narrow the audience or upgrade.`,
        { limit: 'broadcast_recipients_per_month', audience: Number(match[1]), remaining: Number(match[2]) },
      );
    }
    throw error;
  }
  if (recipients.sendable === 0) {
    throw ApiError.conflict('No subscribed contacts match this audience.');
  }

  const estimatedCost = estimateCost(recipients.sendable, templateCategoryToPricing(template.category));
  await store.markScheduled(broadcast.id, {
    scheduledAt: scheduledAt.toISOString(),
    phoneNumberId: phone.id,
    templateName: template.name,
    templateLanguage: template.language,
    estimatedCost,
  });
  await store.recordUsage(input.workspace.id, recipients.sendable);
  await deps.queue.enqueue(broadcast.id, scheduledAt);

  return { status: 'scheduled', scheduledAt: scheduledAt.toISOString(), recipients, estimatedCost };
}
