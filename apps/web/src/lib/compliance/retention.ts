import 'server-only';
import { resolveCompliance } from '@talkzi/shared';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { removeFiles } from './deletion';

const BATCH = 2000;
const LOG_RETENTION_DAYS = 30;

/**
 * Daily retention: deletes messages (and their media files) older than each
 * workspace's dataRetentionDays (365 by default; null keeps everything), then
 * clears webhook payloads, delivery logs and finished chatbot sessions older
 * than 30 days. Stops at the deadline and resumes on the next run.
 */
export async function runRetention(admin: TypedSupabaseClient, log: Logger, deadline: number) {
  const totals = { workspaces: 0, messages: 0, files: 0, logs: {} as Record<string, number> };
  for (let from = 0; Date.now() < deadline; from += 500) {
    const { data: workspaces, error } = await admin.from('workspaces').select('id, settings').order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    for (const ws of workspaces ?? []) {
      const days = resolveCompliance(ws.settings).dataRetentionDays;
      if (!days) continue;
      const before = new Date(Date.now() - days * 86_400_000).toISOString();
      let purgedHere = 0;
      while (Date.now() < deadline) {
        const { data: purged, error: purgeError } = await admin.rpc('purge_workspace_messages', { p_workspace_id: ws.id, p_before: before, p_limit: BATCH });
        if (purgeError) {
          log.error({ err: purgeError, workspaceId: ws.id }, 'Retention purge failed');
          break;
        }
        const rows = purged ?? [];
        purgedHere += rows.length;
        const paths = rows.flatMap((r) => (r.storage_path?.startsWith(`${ws.id}/`) ? [r.storage_path] : []));
        if (paths.length) totals.files += await removeFiles(admin, 'media', paths);
        if (rows.length < BATCH) break;
      }
      if (purgedHere > 0) totals.workspaces += 1;
      totals.messages += purgedHere;
    }
    if (!workspaces || workspaces.length < 500) break;
  }
  if (Date.now() < deadline) {
    const { data } = await admin.rpc('purge_platform_logs', { p_before: new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000).toISOString() });
    totals.logs = (data ?? {}) as Record<string, number>;
  }
  return totals;
}
