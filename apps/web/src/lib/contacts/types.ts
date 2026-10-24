import type { Json } from '@talkzi/db';
import type { LabelItem } from '@/lib/inbox/types';

export interface ContactListItem {
  id: string;
  name: string | null;
  profile_name: string | null;
  wa_id: string;
  email: string | null;
  opted_out: boolean;
  source: string;
  created_at: string;
  last_inbound_at: string | null;
  labels: LabelItem[];
}

export interface ContactPage {
  items: ContactListItem[];
  total: number;
}

export interface ContactDetail extends ContactListItem {
  avatar_url: string | null;
  locale: string | null;
  custom_fields: Json;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  updated_at: string;
  conversations: {
    id: string;
    status: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count: number;
  }[];
  stats: { inbound: number; outbound: number };
}

export interface ImportResult {
  received: number;
  created: number;
  updated: number;
  existing: number;
  skipped_limit: number;
  invalid: { row: number; reason: string }[];
}
