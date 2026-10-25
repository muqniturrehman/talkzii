import { updateCustomDomainSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { domainStatus } from '@/lib/custom-domain';
import { isPlatformHost } from '@/lib/hosts';

/**
 * Sets (or clears) the agency's custom domain. Changing it resets
 * verification; columns are written with the service role because members
 * can't edit domain fields directly.
 */
export const PUT = createHandler({ role: 'admin', feature: 'custom_domain', body: updateCustomDomainSchema }, async ({ admin, body, workspace, user, req }) => {
  if (workspace.parentWorkspaceId) throw ApiError.conflict('Custom domains are managed by the agency workspace.');
  if (body.domain && isPlatformHost(body.domain)) {
    throw ApiError.validation({ fieldErrors: { domain: ['Use a domain you own, not a Talkzi or preview address.'] } });
  }
  const { error } = await admin()
    .from('workspaces')
    .update({ custom_domain: body.domain, custom_domain_verified_at: null })
    .eq('id', workspace.id);
  if (error?.code === '23505') throw ApiError.conflict('That domain is already connected to another workspace.');
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not save the domain.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: body.domain ? 'workspace.domain_set' : 'workspace.domain_removed', metadata: { domain: body.domain }, req });
  return domainStatus(workspace.id, body.domain, null);
});
