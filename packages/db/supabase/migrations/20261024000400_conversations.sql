-- =============================================================================
-- Talkzi · 0004 · Contacts, conversations, messages, notes, canned replies
-- =============================================================================

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- WhatsApp ID: international number, digits only (e.g. 923001234567)
  wa_id text not null check (wa_id ~ '^[0-9]{6,15}$'),
  phone text generated always as ('+' || wa_id) stored,
  name text,
  profile_name text,
  email text,
  avatar_url text,
  locale text,
  custom_fields jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('whatsapp', 'import', 'api', 'manual', 'integration')),
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  opt_out_reason text,
  last_seen_at timestamptz,
  last_inbound_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, wa_id)
);

create index contacts_workspace_created_idx on public.contacts (workspace_id, created_at desc);
create index contacts_name_trgm_idx on public.contacts using gin (name extensions.gin_trgm_ops);
create index contacts_wa_id_trgm_idx on public.contacts using gin (wa_id extensions.gin_trgm_ops);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  color text not null default '#8B5CF6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.contact_labels (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, label_id)
);

create index contact_labels_label_id_idx on public.contact_labels (label_id);
create index contact_labels_workspace_id_idx on public.contact_labels (workspace_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone_number_id uuid not null references public.phone_numbers (id) on delete cascade,
  status public.conversation_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction public.message_direction,
  last_inbound_at timestamptz,
  -- End of the 24h customer-service window (24h after the last inbound message).
  -- Free-form messages are only allowed while now() < expires_at.
  expires_at timestamptz,
  -- Pricing category of the current Meta conversation / last billable message.
  category public.conversation_category,
  meta_conversation_id text,
  meta_conversation_expires_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  first_response_at timestamptz,
  awaiting_reply_since timestamptz,
  bot_paused boolean not null default false,
  csat_score smallint check (csat_score between 1 and 5),
  csat_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, contact_id, phone_number_id)
);

create index conversations_inbox_idx
  on public.conversations (workspace_id, status, last_message_at desc nulls last);
create index conversations_assigned_to_idx on public.conversations (workspace_id, assigned_to);
create index conversations_contact_id_idx on public.conversations (contact_id);

create table public.conversation_labels (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);

create index conversation_labels_label_id_idx on public.conversation_labels (label_id);
create index conversation_labels_workspace_id_idx on public.conversation_labels (workspace_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone_number_id uuid references public.phone_numbers (id) on delete set null,
  -- WhatsApp message id. Unique → webhook deliveries are idempotent.
  wamid text unique,
  direction public.message_direction not null,
  type public.message_type not null default 'text',
  status public.message_status not null default 'queued',
  sender_type public.sender_type not null default 'contact',
  sender_id uuid references public.profiles (id) on delete set null,
  body text,
  content jsonb not null default '{}'::jsonb,
  media jsonb,
  reply_to_wamid text,
  client_message_id text,
  template_id uuid references public.message_templates (id) on delete set null,
  broadcast_id uuid,
  error_code integer,
  error_message text,
  pricing_category public.conversation_category,
  pricing_billable boolean,
  pricing_model text,
  pricing_type text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_workspace_created_idx on public.messages (workspace_id, created_at desc);
create unique index messages_client_message_id_idx
  on public.messages (workspace_id, client_message_id) where client_message_id is not null;

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (conversation_id is not null or contact_id is not null)
);

create index internal_notes_conversation_idx on public.internal_notes (conversation_id, created_at);
create index internal_notes_contact_idx on public.internal_notes (contact_id, created_at);

create table public.canned_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9_-]{1,32}$'),
  title text not null,
  body text not null check (char_length(body) between 1 and 4096),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, shortcut)
);
