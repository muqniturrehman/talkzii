export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../types';
export { Constants } from '../types';

import type { Enums, Tables } from '../types';

// Convenience row aliases used across the app.
export type Profile = Tables<'profiles'>;
export type Workspace = Tables<'workspaces'>;
export type WorkspaceMember = Tables<'workspace_members'>;
export type WorkspaceInvitation = Tables<'workspace_invitations'>;
export type WabaAccount = Tables<'waba_accounts'>;
export type PhoneNumber = Tables<'phone_numbers'>;
export type MessageTemplate = Tables<'message_templates'>;
export type Contact = Tables<'contacts'>;
export type Label = Tables<'labels'>;
export type Conversation = Tables<'conversations'>;
export type Message = Tables<'messages'>;
export type InternalNote = Tables<'internal_notes'>;
export type CannedReply = Tables<'canned_replies'>;
export type Broadcast = Tables<'broadcasts'>;
export type BroadcastRecipient = Tables<'broadcast_recipients'>;
export type ChatbotFlow = Tables<'chatbot_flows'>;
export type ChatbotSession = Tables<'chatbot_sessions'>;
export type Integration = Tables<'integrations'>;
export type Webhook = Tables<'webhooks'>;
export type WebhookDelivery = Tables<'webhook_deliveries'>;
export type ApiKey = Tables<'api_keys'>;
export type AuditLogEntry = Tables<'audit_log'>;
export type WebhookEvent = Tables<'webhook_events'>;
export type UsageCounter = Tables<'usage_counters'>;
export type BillingSubscription = Tables<'billing_subscriptions'>;
export type AiDocument = Tables<'ai_documents'>;

export type WorkspaceRole = Enums<'workspace_role'>;
export type PlanTier = Enums<'plan_tier'>;
export type ConversationStatus = Enums<'conversation_status'>;
export type ConversationCategory = Enums<'conversation_category'>;
export type MessageDirection = Enums<'message_direction'>;
export type MessageType = Enums<'message_type'>;
export type MessageStatus = Enums<'message_status'>;
export type SenderType = Enums<'sender_type'>;
export type BroadcastStatus = Enums<'broadcast_status'>;
export type RecipientStatus = Enums<'recipient_status'>;

