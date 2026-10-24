import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { loadAnalytics } from '@/lib/analytics/service';

/** Dashboard data for the last 7 / 30 / 90 days (RLS-scoped to the active workspace). */
export const GET = createHandler(
  { role: 'viewer', query: z.object({ range: z.enum(['7', '30', '90']).default('30') }) },
  async ({ supabase, workspace, query }) => loadAnalytics(supabase, workspace, Number(query.range)),
);
