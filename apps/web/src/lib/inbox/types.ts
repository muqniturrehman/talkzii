import type { Json } from '@talkzi/db';

/** DTOs shared by the inbox API routes and the inbox UI. */

export type ConversationStatus = 'open' | 'pending' | 'snoozed' | 'resolved';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';

export interface LabelItem {
  id: string;
  name: string;
  color: string;
}

export interface InboxContact {
  id: string;
  name: string | null;
  profile_name: string | null;
  wa_id: string;
  avatar_url: string | null;
  opted_out: boolean;
}

export interface ConversationListItem {
  id: string;
  status: ConversationStatus;
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  expires_at: string | null;
  snoozed_until: string | null;
  bot_paused: boolean;
  awaiting_reply_since: string | null;
  phone_number_id: string;
  created_at: string;
  contact: InboxContact;
  labels: LabelItem[];
}

export interface ConversationDetail extends ConversationListItem {
  category: string | null;
  csat_score: number | null;
  first_response_at: string | null;
  resolved_at: string | null;
  contact: InboxContact & {
    email: string | null;
    phone: string | null;
    locale: string | null;
    custom_fields: Json;
    created_at: string;
    opted_out_at: string | null;
    contact_labels: LabelItem[];
  };
  phone_number: { id: string; display_phone_number: string; verified_name: string | null } | null;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  status: MessageStatus;
  body: string | null;
  content: Json;
  media: Json | null;
  sender_type: string;
  sender_id: string | null;
  wamid: string | null;
  reply_to_wamid: string | null;
  template_id: string | null;
  client_message_id: string | null;
  error_code: number | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export interface NoteItem {
  id: string;
  conversation_id: string | null;
  body: string;
  mentions: string[];
  author_id: string | null;
  author: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  created_at: string;
}

export interface CannedReplyItem {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export interface MemberItem {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface InboxCounts {
  open: number;
  pending: number;
  snoozed: number;
  resolved: number;
  mine: number;
  unassigned: number;
  unread: number;
}

export interface ConversationPage {
  items: ConversationListItem[];
  nextCursor: string | null;
}

export interface MessagePage {
  items: MessageItem[];
  hasMore: boolean;
}

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  components: Json;
}
