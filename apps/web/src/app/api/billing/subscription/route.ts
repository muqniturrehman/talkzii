import { createHandler } from '@/lib/api/handler';
import { loadSubscription } from '@/lib/billing/subscription';

/** Current plan and subscription state (the billing page polls this after checkout). */
export const GET = createHandler({ role: 'admin' }, async ({ admin, workspace }) => {
  const db = admin();
  const { data } = await db.from('workspaces').select('plan').eq('id', workspace.id).single();
  return loadSubscription(db, workspace.id, data?.plan ?? workspace.plan);
});
