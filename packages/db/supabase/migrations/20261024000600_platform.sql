-- =============================================================================
-- Talkzi · 0006 · Platform: integrations, webhooks, API keys, audit, billing
-- =============================================================================

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in (
    'zapier', 'n8n', 'shopify', 'woocommerce', 'google_sheets', 'stripe', 'jazzcash', 'easypaisa', 'custom'
  )),
  name text not null,
  status public.integration_status not null default 'disconnected',
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  -- HMAC secret used to verify incoming webhooks from this provider (encrypted).
  incoming_secret_encrypted text,
  last_event_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integrations_workspace_idx on public.integrations (workspace_id, provider);

-- Outbound webhook endpoints (events are HMAC-SHA256 signed).
create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  description text,
  events text[] not null default '{}',
  secret_encrypted text not null,
  active boolean not null default true,
  failure_count integer not null default 0,
  last_delivery_at timestamptz,
  last_status integer,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webhooks_workspace_idx on public.webhooks (workspace_id) where active;

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz default now(),
  response_status integer,
  response_body text,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);

-- API keys: only a SHA-256 hash is stored; the plaintext is shown once.
-- user_id set → personal access token; null → workspace key.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index api_keys_workspace_idx on public.api_keys (workspace_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'api_key', 'system', 'webhook')),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_workspace_created_idx on public.audit_log (workspace_id, created_at desc);

-- Every raw inbound webhook payload (Meta, Stripe, Shopify, ...) for replay/debugging.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  event_type text,
  payload jsonb not null,
  signature_valid boolean not null default false,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'ignored')),
  error text,
  attempts integer not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index webhook_events_retry_idx on public.webhook_events (created_at) where status in ('received', 'failed');
create index webhook_events_source_idx on public.webhook_events (source, created_at desc);
create index webhook_events_workspace_idx on public.webhook_events (workspace_id, created_at desc);

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period date not null,
  metric text not null,
  value bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (workspace_id, period, metric)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'jazzcash', 'easypaisa', 'manual')),
  plan public.plan_tier not null default 'free',
  status public.subscription_status not null default 'active',
  billing_interval text check (billing_interval in ('month', 'year')),
  currency text not null default 'usd',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- workspaces.plan mirrors the effective subscription plan.
create or replace function public.sync_workspace_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workspaces
    set plan = case when new.status in ('active', 'trialing', 'past_due') then new.plan else 'free'::public.plan_tier end
    where id = new.workspace_id;
  return new;
end;
$$;

create trigger billing_subscriptions_sync_plan
  after insert or update of plan, status on public.billing_subscriptions
  for each row execute function public.sync_workspace_plan();

-- GDPR / Meta data deletion requests (callback + manual).
create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  source text not null check (source in ('meta_callback', 'user_request', 'contact_request')),
  confirmation_code text not null unique,
  meta_user_id text,
  email text,
  contact_id uuid,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  details jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index data_deletion_requests_workspace_idx on public.data_deletion_requests (workspace_id, requested_at desc);
