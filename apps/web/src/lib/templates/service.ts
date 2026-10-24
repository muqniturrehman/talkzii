import 'server-only';
import { isWhatsAppApiError, type TemplateCategory, type TemplateComponentDefinition, type TemplateInfo } from '@talkzi/whatsapp';
import type { Json, Tables } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import type { Logger } from '@/lib/logger';
import { getWabaContext } from '@/lib/meta/whatsapp';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

export const TEMPLATE_COLUMNS =
  'id, workspace_id, waba_account_id, meta_template_id, name, language, category, status, components, rejected_reason, quality_score, submitted_at, approved_at, last_synced_at, created_at, updated_at';

export type TemplateRow = Pick<
  Tables<'message_templates'>,
  | 'id'
  | 'workspace_id'
  | 'waba_account_id'
  | 'meta_template_id'
  | 'name'
  | 'language'
  | 'category'
  | 'status'
  | 'components'
  | 'rejected_reason'
  | 'quality_score'
  | 'submitted_at'
  | 'approved_at'
  | 'last_synced_at'
  | 'created_at'
  | 'updated_at'
>;

/** The workspace's default (first connected) WABA, or the one requested. */
export async function resolveWabaId(db: TypedSupabaseClient, workspaceId: string, wabaAccountId?: string | null): Promise<string> {
  let query = db.from('waba_accounts').select('id').eq('workspace_id', workspaceId).neq('status', 'disconnected');
  if (wabaAccountId) query = query.eq('id', wabaAccountId);
  const { data } = await query.order('created_at').limit(1);
  const id = data?.[0]?.id;
  if (!id) throw ApiError.conflict('Connect a WhatsApp Business Account first (WhatsApp numbers → Connect).', 'WHATSAPP_ERROR');
  return id;
}

function friendlyTemplateError(error: unknown): ApiError {
  if (isWhatsAppApiError(error)) {
    const message =
      error.subcode === 2388024
        ? 'A template with this name and language already exists on your WhatsApp account. Pick another name.'
        : error.friendlyMessage;
    return new ApiError(502, 'WHATSAPP_ERROR', message, { code: error.code, subcode: error.subcode });
  }
  return error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Template submission failed.');
}

/**
 * Sends a draft (or a rejected/paused template) to Meta for review. New
 * templates are created; templates Meta already knows are edited in place.
 */
export async function submitTemplate(db: TypedSupabaseClient, row: TemplateRow): Promise<TemplateRow> {
  const wabaAccountId = await resolveWabaId(db, row.workspace_id, row.waba_account_id);
  const ctx = await getWabaContext(db, row.workspace_id, wabaAccountId);
  const components = row.components as unknown as TemplateComponentDefinition[];
  const now = new Date().toISOString();

  let patch: Partial<TemplateRow>;
  try {
    if (row.meta_template_id) {
      await ctx.client.editTemplate(row.meta_template_id, { components, category: row.category as TemplateCategory });
      patch = { status: 'PENDING', rejected_reason: null };
    } else {
      const created = await ctx.client.createTemplate(ctx.waba.waba_id, {
        name: row.name,
        language: row.language,
        category: row.category as TemplateCategory,
        components,
        allow_category_change: true,
      });
      patch = {
        meta_template_id: created.id,
        status: created.status ?? 'PENDING',
        category: created.category ?? row.category,
        rejected_reason: null,
        ...(created.status === 'APPROVED' ? { approved_at: now } : {}),
      };
    }
  } catch (error) {
    throw friendlyTemplateError(error);
  }

  const { data, error } = await db
    .from('message_templates')
    .update({ ...patch, waba_account_id: wabaAccountId, submitted_at: now, last_synced_at: now })
    .eq('id', row.id)
    .eq('workspace_id', row.workspace_id)
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  return data;
}

function rowFromMeta(workspaceId: string, wabaAccountId: string, t: TemplateInfo, now: string) {
  return {
    workspace_id: workspaceId,
    waba_account_id: wabaAccountId,
    meta_template_id: t.id,
    name: t.name,
    language: t.language,
    category: ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(String(t.category)) ? String(t.category) : 'UTILITY',
    status: String(t.status),
    components: (t.components ?? []) as unknown as Json,
    parameter_format: t.parameter_format ?? 'POSITIONAL',
    rejected_reason: t.status === 'REJECTED' ? (t.rejected_reason ?? 'UNKNOWN') : null,
    quality_score: t.quality_score?.score ?? null,
    last_synced_at: now,
    ...(t.status === 'APPROVED' ? { approved_at: now } : {}),
  };
}

/** Pulls every template from each connected WABA and upserts local rows. */
export async function syncWorkspaceTemplates(db: TypedSupabaseClient, workspaceId: string, log?: Logger) {
  const { data: wabas } = await db.from('waba_accounts').select('id').eq('workspace_id', workspaceId).neq('status', 'disconnected');
  let synced = 0;
  for (const waba of wabas ?? []) {
    const ctx = await getWabaContext(db, workspaceId, waba.id);
    if (ctx.mock) {
      // Demo accounts: approve anything waiting for review.
      const { data } = await db
        .from('message_templates')
        .update({ status: 'APPROVED', approved_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
        .eq('waba_account_id', waba.id)
        .eq('status', 'PENDING')
        .select('id');
      synced += data?.length ?? 0;
      continue;
    }
    let templates: TemplateInfo[];
    try {
      templates = await ctx.client.listAllTemplates(ctx.waba.waba_id);
    } catch (error) {
      log?.warn({ err: error, wabaAccountId: waba.id }, 'Template sync failed');
      throw friendlyTemplateError(error);
    }
    const now = new Date().toISOString();
    const rows = templates.filter((t) => /^[a-z0-9_]+$/.test(t.name)).map((t) => rowFromMeta(workspaceId, waba.id, t, now));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db
        .from('message_templates')
        .upsert(rows.slice(i, i + 200), { onConflict: 'workspace_id,waba_account_id,name,language' });
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not store templates: ${error.message}`);
    }
    synced += rows.length;
  }
  return { synced };
}

/** Cron: re-check templates still under review (webhooks are the fast path). */
export async function refreshPendingTemplates(db: TypedSupabaseClient, log: Logger, limit = 50) {
  const { data: pending } = await db
    .from('message_templates')
    .select(TEMPLATE_COLUMNS)
    .in('status', ['PENDING', 'IN_APPEAL'])
    .not('meta_template_id', 'is', null)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  let updated = 0;
  for (const row of pending ?? []) {
    if (!row.waba_account_id || !row.meta_template_id) continue;
    try {
      const ctx = await getWabaContext(db, row.workspace_id, row.waba_account_id);
      const info = await ctx.client.getTemplateStatus(row.meta_template_id);
      const now = new Date().toISOString();
      await db
        .from('message_templates')
        .update({
          status: String(info.status),
          rejected_reason: info.status === 'REJECTED' ? (info.rejected_reason ?? 'UNKNOWN') : null,
          quality_score: info.quality_score?.score ?? row.quality_score,
          last_synced_at: now,
          ...(info.status === 'APPROVED' && !row.approved_at ? { approved_at: now } : {}),
        })
        .eq('id', row.id);
      if (String(info.status) !== row.status) updated++;
    } catch (error) {
      log.warn({ err: error, templateId: row.id }, 'Template status refresh failed');
      await db.from('message_templates').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id);
    }
  }
  return { checked: pending?.length ?? 0, updated };
}
