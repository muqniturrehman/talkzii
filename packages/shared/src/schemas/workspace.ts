import { z } from 'zod';
import { hexColorSchema } from './common';

/** Agency white-label branding stored in workspaces.branding (jsonb). */
export const brandingSchema = z.object({
  brandName: z.string().trim().min(1).max(60).optional(),
  logoUrl: z.url().optional(),
  faviconUrl: z.url().optional(),
  primaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  supportEmail: z.email().optional(),
  hidePoweredBy: z.boolean().optional(),
});
export type Branding = z.infer<typeof brandingSchema>;

/** Compliance settings stored under workspaces.settings.compliance. */
export const complianceSettingsSchema = z.object({
  optOutKeywords: z.array(z.string().trim().min(1).max(40)).max(30),
  optInKeywords: z.array(z.string().trim().min(1).max(40)).max(30),
  optOutReply: z.string().trim().max(1024),
  optInReply: z.string().trim().max(1024),
  dataRetentionDays: z.number().int().min(30).max(3650).nullable(),
});
export type ComplianceSettings = z.infer<typeof complianceSettingsSchema>;

export const DEFAULT_COMPLIANCE: ComplianceSettings = {
  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPT OUT', 'BAND KARO', 'بند کرو'],
  optInKeywords: ['START', 'SUBSCRIBE', 'UNSTOP'],
  optOutReply:
    'You have been unsubscribed and will no longer receive marketing messages from us. Reply START to subscribe again.',
  optInReply: 'Welcome back! You are subscribed to updates again.',
  dataRetentionDays: 365,
};

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  autoSuggest: z.boolean(),
  tone: z.enum(['friendly', 'professional', 'concise']),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: true, autoSuggest: false, tone: 'friendly' };

export interface WorkspaceSettings {
  compliance?: Partial<ComplianceSettings>;
  ai?: Partial<AiSettings>;
}

/** Partial update of one or more workspace settings sections (merged server-side). */
export const updateWorkspaceSettingsSchema = z
  .object({
    ai: aiSettingsSchema.partial().optional(),
    compliance: complianceSettingsSchema.partial().optional(),
  })
  .refine((v) => Boolean(v.ai ?? v.compliance), { message: 'Nothing to update' });
export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>;

export function resolveCompliance(settings: unknown): ComplianceSettings {
  const raw = (settings as WorkspaceSettings | null)?.compliance ?? {};
  return { ...DEFAULT_COMPLIANCE, ...raw };
}

export function resolveAiSettings(settings: unknown): AiSettings {
  const raw = (settings as WorkspaceSettings | null)?.ai ?? {};
  return { ...DEFAULT_AI_SETTINGS, ...raw };
}

export function parseBranding(value: unknown): Branding {
  const parsed = brandingSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}
