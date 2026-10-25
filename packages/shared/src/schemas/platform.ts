import { z } from 'zod';
import type { WorkspaceRole } from '../roles';
import { emailSchema } from './common';

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const API_SCOPES = ['messages:write', 'contacts:read', 'contacts:write', 'templates:read', 'conversations:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_META: Record<ApiScope, { label: string; minRole: WorkspaceRole }> = {
  'messages:write': { label: 'Send messages', minRole: 'agent' },
  'contacts:read': { label: 'Read contacts', minRole: 'viewer' },
  'contacts:write': { label: 'Create and update contacts', minRole: 'agent' },
  'templates:read': { label: 'Read templates', minRole: 'viewer' },
  'conversations:read': { label: 'Read conversations', minRole: 'viewer' },
};

export const API_KEY_PREFIX = 'tk_live_';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Pick at least one scope'),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().default(null),
  /** Personal tokens act as the creating user (limited by their role). */
  personal: z.boolean().default(false),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// ---------------------------------------------------------------------------
// Outbound webhooks
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  'message.received',
  'message.status',
  'conversation.created',
  'conversation.resolved',
  'contact.created',
  'broadcast.completed',
  'template.status',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_META: Record<WebhookEvent, string> = {
  'message.received': 'A customer sent a message',
  'message.status': 'An outbound message was sent, delivered, read or failed',
  'conversation.created': 'A new conversation started',
  'conversation.resolved': 'A conversation was marked resolved',
  'contact.created': 'A contact was created',
  'broadcast.completed': 'A broadcast finished sending',
  'template.status': 'A template was approved, rejected or paused',
};

const webhookUrl = z
  .string()
  .trim()
  .url('Enter a full URL')
  .max(2000)
  .refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), 'Use an https:// URL');

export const createWebhookSchema = z.object({
  url: webhookUrl,
  description: z.string().trim().max(200).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pick at least one event'),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z
  .object({
    url: webhookUrl.optional(),
    description: z.string().trim().max(200).nullable().optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ---------------------------------------------------------------------------
// Public REST API (v1)
// ---------------------------------------------------------------------------

const phoneInput = z.string().trim().min(5, 'Enter a phone number with country code').max(32);

export const publicSendMessageSchema = z.discriminatedUnion('type', [
  z.object({
    to: phoneInput,
    type: z.literal('text'),
    text: z.string().trim().min(1).max(4096),
    phoneNumberId: z.uuid().optional(),
  }),
  z.object({
    to: phoneInput,
    type: z.literal('template'),
    template: z.object({
      name: z.string().trim().min(1).max(512),
      language: z.string().trim().min(2).max(10).default('en'),
      /** Body variables {{1}}, {{2}}… in order. */
      variables: z.array(z.string().max(1024)).max(20).default([]),
      header: z.array(z.string().max(60)).max(1).optional(),
      /** URL suffix per dynamic URL button index ("0", "1"). */
      buttons: z.record(z.string(), z.string().max(2000)).optional(),
      headerMediaUrl: z.string().url().optional(),
    }),
    phoneNumberId: z.uuid().optional(),
  }),
]);
export type PublicSendMessageInput = z.infer<typeof publicSendMessageSchema>;

export const publicContactUpsertSchema = z.object({
  phone: phoneInput,
  name: z.string().trim().max(120).optional(),
  email: emailSchema.optional(),
  /** Label names; missing labels are created. */
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  customFields: z.record(z.string().min(1).max(50), z.union([z.string().max(1000), z.number(), z.boolean()])).optional(),
  optedOut: z.boolean().optional(),
});
export type PublicContactUpsertInput = z.infer<typeof publicContactUpsertSchema>;

export const publicListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Opaque cursor from the previous page's next_cursor. */
  cursor: z.string().max(200).optional(),
  q: z.string().trim().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Integrations (incoming webhooks from Zapier, n8n, Shopify, WooCommerce…)
// ---------------------------------------------------------------------------

export const INTEGRATION_PROVIDERS = ['zapier', 'n8n', 'google_sheets', 'shopify', 'woocommerce', 'stripe', 'custom'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

/** Providers that sign their own webhooks (verified with their secret) and map events to templates. */
export const SIGNED_INTEGRATION_PROVIDERS = ['shopify', 'woocommerce', 'stripe'] as const;
export type SignedIntegrationProvider = (typeof SIGNED_INTEGRATION_PROVIDERS)[number];

export function isSignedProvider(provider: string): provider is SignedIntegrationProvider {
  return (SIGNED_INTEGRATION_PROVIDERS as readonly string[]).includes(provider);
}

/** "Send this approved template when this store / payment event happens." */
export const orderNotificationSchema = z.object({
  topic: z.string().trim().min(1).max(80),
  templateName: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(10).default('en'),
  /** Dot paths into the event payload for {{1}}, {{2}}… e.g. "customer.first_name". */
  variables: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  /** Dot path to the customer's phone in the payload. */
  phonePath: z.string().trim().min(1).max(120),
});
export type OrderNotification = z.infer<typeof orderNotificationSchema>;

export const createIntegrationSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  name: z.string().trim().min(1).max(80),
  /** Shopify / WooCommerce / Stripe webhook signing secret; can also be added later. */
  signingSecret: z.string().trim().min(8).max(500).optional(),
  notifications: z.array(orderNotificationSchema).max(10).default([]),
});
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

/** Envelope for the generic incoming webhook (Zapier, n8n, Google Sheets, custom); the rest is validated per action. */
export const incomingActionSchema = z.looseObject({ action: z.enum(['send_message', 'upsert_contact']) });
