-- =============================================================================
-- Talkzi · 0001 · Extensions, enums and generic helpers
-- Target: Supabase Postgres 15+ (also validated against PGlite in CI tests)
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums (domain states owned by Talkzi; Meta pass-through values stay text)
-- ---------------------------------------------------------------------------
create type public.workspace_role as enum ('owner', 'admin', 'agent', 'viewer');
create type public.plan_tier as enum ('free', 'pro', 'agency');
create type public.waba_status as enum ('pending', 'connected', 'disconnected', 'error');
create type public.conversation_status as enum ('open', 'pending', 'snoozed', 'resolved');
create type public.conversation_category as enum ('marketing', 'utility', 'authentication', 'service');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_type as enum (
  'text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts',
  'interactive', 'button', 'template', 'reaction', 'order', 'system', 'unsupported'
);
create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'received', 'deleted');
create type public.sender_type as enum ('contact', 'agent', 'bot', 'broadcast', 'api', 'system');
create type public.broadcast_status as enum ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed');
create type public.recipient_status as enum ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped');
create type public.chatbot_status as enum ('draft', 'active', 'inactive');
create type public.chatbot_session_status as enum ('active', 'waiting', 'completed', 'handed_off', 'expired', 'failed');
create type public.integration_status as enum ('connected', 'disconnected', 'error');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid');
create type public.delivery_status as enum ('pending', 'success', 'failed');
create type public.document_status as enum ('pending', 'processing', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from left(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), 60)), ''),
    'workspace'
  );
$$;

create or replace function public.role_rank(r public.workspace_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'owner' then 4
    when 'admin' then 3
    when 'agent' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

-- Forward-only ordering for WhatsApp delivery statuses. "failed" may override
-- queued/sent but never delivered/read (late failure webhooks are ignored).
create or replace function public.message_status_rank(s public.message_status)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'queued' then 0
    when 'sent' then 1
    when 'failed' then 2
    when 'delivered' then 3
    when 'read' then 4
    when 'deleted' then 5
    when 'received' then 0
    else 0
  end;
$$;

create or replace function public.recipient_status_rank(s public.recipient_status)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'pending' then 0
    when 'sending' then 1
    when 'sent' then 2
    when 'failed' then 3
    when 'delivered' then 4
    when 'read' then 5
    when 'skipped' then 6
    else 0
  end;
$$;
