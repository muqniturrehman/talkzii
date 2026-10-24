import { updateProfileSchema } from '@talkzi/shared';
import { createHandler, unwrap } from '@/lib/api/handler';

export const GET = createHandler({ auth: 'user' }, async ({ supabase, user }) => {
  return unwrap(await supabase.from('profiles').select('*').eq('id', user.id).single());
});

export const PATCH = createHandler({ auth: 'user', body: updateProfileSchema }, async ({ body, supabase, user }) => {
  const profile = unwrap(
    await supabase
      .from('profiles')
      .update({
        full_name: body.fullName,
        ...(body.avatarUrl !== undefined ? { avatar_url: body.avatarUrl } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
      })
      .eq('id', user.id)
      .select('*')
      .single(),
  );
  await supabase.auth.updateUser({ data: { full_name: body.fullName } });
  return profile;
});
