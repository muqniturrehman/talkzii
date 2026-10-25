import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { contactExport } from '@/lib/compliance/export';

/** Data subject access request: everything held about one contact, as JSON (admin). */
export const GET = createHandler({ role: 'admin' }, async ({ admin, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Contact');
  const data = await contactExport(admin(), workspace.id, id);
  if (!data) throw ApiError.notFound('Contact not found.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'contact.data_exported', targetType: 'contact', targetId: id, req });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="talkzi-contact-${id.slice(0, 8)}.json"`,
      'cache-control': 'no-store',
    },
  });
});
