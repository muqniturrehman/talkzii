import { createHandler } from '@/lib/api/handler';

export const POST = createHandler({ auth: 'public' }, async ({ supabase }) => {
  await supabase.auth.signOut();
  return { ok: true };
});
