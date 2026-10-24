import 'server-only';
import type { Json } from '@talkzi/db';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/request';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface AuditEntry {
  workspaceId: string | null;
  actorId?: string | null;
  actorType?: 'user' | 'api_key' | 'system' | 'webhook';
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

/** Writes to audit_log with the service role. Never throws. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient()
      .from('audit_log')
      .insert({
        workspace_id: entry.workspaceId,
        actor_id: entry.actorId ?? null,
        actor_type: entry.actorType ?? 'user',
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Json,
        ip_address: entry.req ? getClientIp(entry.req) : null,
        user_agent: entry.req?.headers.get('user-agent')?.slice(0, 300) ?? null,
      });
    if (error) throw error;
  } catch (err) {
    logger.warn({ err, action: entry.action }, 'Failed to write audit log');
  }
}
