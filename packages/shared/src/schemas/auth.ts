import { z } from 'zod';
import { WORKSPACE_ROLES } from '../roles';
import { emailSchema, passwordSchema, safeNextPathSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
  next: safeNextPathSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  next: safeNextPathSchema.optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const magicLinkSchema = z.object({
  email: emailSchema,
  next: safeNextPathSchema.optional(),
});
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export const oauthSchema = z.object({
  provider: z.enum(['google']),
  next: safeNextPathSchema.optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(120),
  timezone: z.string().min(1).max(64),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/, 'Digits only, e.g. 92'),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  logoUrl: z.url().nullable().optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const switchWorkspaceSchema = z.object({ workspaceId: z.uuid() });

export const inviteRoleSchema = z.enum(['admin', 'agent', 'viewer']);

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: inviteRoleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(4096) });

export const updateMemberRoleSchema = z.object({ role: z.enum(WORKSPACE_ROLES) });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80),
  avatarUrl: z.url().nullable().optional(),
  locale: z.enum(['en', 'ur']).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
