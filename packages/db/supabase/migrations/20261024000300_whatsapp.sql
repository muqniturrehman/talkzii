-- =============================================================================
-- Talkzi · 0003 · WhatsApp Business accounts, phone numbers, templates
-- =============================================================================

create table public.waba_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- A WABA can only be connected to one Talkzi workspace at a time.
  waba_id text not null unique,
  business_id text,
  name text,
  currency text,
  timezone_id text,
  message_template_namespace text,
  account_review_status text,
  business_verification_status text,
  -- Business Integration System User token from Embedded Signup, encrypted
  -- with AES-256-GCM (ENCRYPTION_KEY). Rows are only readable by owners/admins.
  access_token_encrypted text,
  token_expires_at timestamptz,
  token_scopes text[] not null default '{}',
  webhook_subscribed boolean not null default false,
  status public.waba_status not null default 'pending',
  connected_by uuid references public.profiles (id) on delete set null,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index waba_accounts_workspace_id_idx on public.waba_accounts (workspace_id);

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  waba_account_id uuid not null references public.waba_accounts (id) on delete cascade,
  phone_number_id text not null unique,
  display_phone_number text not null,
  verified_name text,
  -- Meta pass-through values (kept as text so new values never break webhooks)
  quality_rating text not null default 'UNKNOWN',      -- GREEN | YELLOW | RED | UNKNOWN
  messaging_limit_tier text,                           -- TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  throughput_level text,                               -- STANDARD | HIGH | NOT_APPLICABLE
  code_verification_status text,                       -- VERIFIED | NOT_VERIFIED | EXPIRED
  name_status text,                                    -- APPROVED | PENDING_REVIEW | DECLINED | ...
  requested_display_name text,
  status text not null default 'PENDING',              -- CONNECTED | PENDING | FLAGGED | RESTRICTED | ...
  is_registered boolean not null default false,
  is_default boolean not null default false,
  platform_type text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index phone_numbers_workspace_id_idx on public.phone_numbers (workspace_id);
create index phone_numbers_waba_account_id_idx on public.phone_numbers (waba_account_id);
create unique index phone_numbers_one_default_idx on public.phone_numbers (workspace_id) where is_default;

create table public.phone_number_quality_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  phone_number_id uuid not null references public.phone_numbers (id) on delete cascade,
  event text not null,                                 -- FLAGGED | UNFLAGGED | UPGRADE | DOWNGRADE | ONBOARDING
  quality_rating text,
  messaging_limit_tier text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index phone_number_quality_events_phone_idx
  on public.phone_number_quality_events (phone_number_id, created_at desc);
create index phone_number_quality_events_workspace_idx
  on public.phone_number_quality_events (workspace_id, created_at desc);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  waba_account_id uuid references public.waba_accounts (id) on delete cascade,
  meta_template_id text,
  name text not null check (char_length(name) between 1 and 512 and name ~ '^[a-z0-9_]+$'),
  language text not null,
  category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  -- DRAFT (local only) | PENDING | APPROVED | REJECTED | PAUSED | DISABLED | IN_APPEAL | ...
  status text not null default 'DRAFT',
  components jsonb not null default '[]'::jsonb,
  parameter_format text not null default 'POSITIONAL' check (parameter_format in ('POSITIONAL', 'NAMED')),
  rejected_reason text,
  quality_score text,
  submitted_at timestamptz,
  approved_at timestamptz,
  last_synced_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, waba_account_id, name, language)
);

create index message_templates_workspace_status_idx on public.message_templates (workspace_id, status);
create unique index message_templates_meta_template_id_idx
  on public.message_templates (meta_template_id) where meta_template_id is not null;
