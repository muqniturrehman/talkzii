import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

/** The 50 most recent deliveries for an endpoint (delivery log). */
export const GET = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Webhook');
  return unwrap(
    await supabase
      .from('webhook_deliveries')
      .select('id, event, status, attempts, response_status, duration_ms, error, next_attempt_at, created_at, updated_at')
      .eq('webhook_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  );
});
