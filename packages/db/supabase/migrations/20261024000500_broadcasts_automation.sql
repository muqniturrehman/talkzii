-- =============================================================================
-- Talkzi · 0005 · Broadcasts and chatbot automation
-- =============================================================================

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone_number_id uuid references public.phone_numbers (id) on delete set null,
  template_id uuid references public.message_templates (id) on delete set null,
  template_name text,
  template_language text,
  -- { "header": [VariableSource], "body": [VariableSource], "buttons": { "0": [VariableSource] } }
  -- VariableSource = { "source": "contact.name" | "contact.phone" | "custom_field" | "static", "key"?, "value"?, "fallback"? }
  variable_mapping jsonb not null default '{}'::jsonb,
  -- { "type": "all" | "labels" | "contacts", "labelIds": [], "contactIds": [], "excludeLabelIds": [] }
  audience jsonb not null default '{"type":"all"}'::jsonb,
  status public.broadcast_status not null default 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  paused_reason text,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  replied_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  estimated_cost numeric(12, 4),
  -- Lease used by the Postgres-backed queue fallback (claim_due_broadcasts).
  locked_until timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index broadcasts_workspace_created_idx on public.broadcasts (workspace_id, created_at desc);
create index broadcasts_due_idx on public.broadcasts (status, scheduled_at) where status in ('scheduled', 'sending');

create table public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  wa_id text not null,
  variables jsonb not null default '{}'::jsonb,
  status public.recipient_status not null default 'pending',
  wamid text,
  message_id uuid references public.messages (id) on delete set null,
  error_code integer,
  error_message text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, wa_id)
);

create index broadcast_recipients_broadcast_status_idx on public.broadcast_recipients (broadcast_id, status);
create unique index broadcast_recipients_wamid_idx on public.broadcast_recipients (wamid) where wamid is not null;
create index broadcast_recipients_contact_idx on public.broadcast_recipients (contact_id, sent_at desc);

alter table public.messages
  add constraint messages_broadcast_id_fkey
  foreign key (broadcast_id) references public.broadcasts (id) on delete set null;

-- Keep broadcast counters exact and O(1) as recipient statuses advance.
create or replace function public.broadcast_recipient_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d_sent integer;
  d_delivered integer;
  d_read integer;
  d_failed integer;
  d_skipped integer;
  d_replied integer;
begin
  -- "reached" semantics: sent ⊇ delivered ⊇ read (failed/skipped tracked separately)
  d_sent      := (new.status in ('sent', 'delivered', 'read'))::int - (old.status in ('sent', 'delivered', 'read'))::int;
  d_delivered := (new.status in ('delivered', 'read'))::int - (old.status in ('delivered', 'read'))::int;
  d_read      := (new.status = 'read')::int - (old.status = 'read')::int;
  d_failed    := (new.status = 'failed')::int - (old.status = 'failed')::int;
  d_skipped   := (new.status = 'skipped')::int - (old.status = 'skipped')::int;
  d_replied   := (new.replied_at is not null)::int - (old.replied_at is not null)::int;

  if d_sent <> 0 or d_delivered <> 0 or d_read <> 0 or d_failed <> 0 or d_skipped <> 0 or d_replied <> 0 then
    update public.broadcasts b set
      sent_count = greatest(b.sent_count + d_sent, 0),
      delivered_count = greatest(b.delivered_count + d_delivered, 0),
      read_count = greatest(b.read_count + d_read, 0),
      failed_count = greatest(b.failed_count + d_failed, 0),
      skipped_count = greatest(b.skipped_count + d_skipped, 0),
      replied_count = greatest(b.replied_count + d_replied, 0)
    where b.id = new.broadcast_id;
  end if;

  return new;
end;
$$;

create trigger broadcast_recipients_counters
  after update of status, replied_at on public.broadcast_recipients
  for each row execute function public.broadcast_recipient_counters();

create table public.chatbot_flows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status public.chatbot_status not null default 'draft',
  -- { "type": "keyword" | "any_message" | "first_message", "keywords": [], "match": "exact" | "contains" }
  trigger jsonb not null default '{"type":"keyword","keywords":[],"match":"exact"}'::jsonb,
  -- React Flow document: { "nodes": [...], "edges": [...] }
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  phone_number_id uuid references public.phone_numbers (id) on delete set null,
  priority integer not null default 0,
  version integer not null default 1,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chatbot_flows_workspace_status_idx on public.chatbot_flows (workspace_id, status, priority desc);

create table public.chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  flow_id uuid not null references public.chatbot_flows (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  current_node_id text,
  variables jsonb not null default '{}'::jsonb,
  status public.chatbot_session_status not null default 'active',
  step_count integer not null default 0,
  last_interaction_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index chatbot_sessions_one_live_idx
  on public.chatbot_sessions (conversation_id) where status in ('active', 'waiting');
create index chatbot_sessions_flow_idx on public.chatbot_sessions (flow_id);
