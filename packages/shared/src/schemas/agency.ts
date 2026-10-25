import { z } from 'zod';

/** Hostname a client points at Talkzi, e.g. app.youragency.com (no scheme, path or port). */
export const customDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{4,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/, 'Enter a domain like app.youragency.com');

export const updateCustomDomainSchema = z.object({ domain: customDomainSchema.nullable() });

export const createClientWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Enter the client’s name').max(80),
  timezone: z.string().trim().min(1).max(64).optional(),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
});
export type CreateClientWorkspaceInput = z.infer<typeof createClientWorkspaceSchema>;
