-- =============================================================================
-- Minimal emulation of the Supabase platform objects our migrations depend on.
-- Used ONLY for local validation with PGlite (tests + offline type generation).
-- Never run this against a real Supabase project.
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin nologin noinherit;

create schema if not exists extensions;

-- auth ------------------------------------------------------------------------
create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_user::text)
$$;

grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant execute on all functions in schema auth to anon, authenticated, service_role, supabase_auth_admin;

-- realtime ----------------------------------------------------------------------
create schema realtime;

create table realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  extension text not null default 'broadcast',
  event text,
  payload jsonb,
  private boolean not null default true,
  inserted_at timestamptz not null default now()
);

alter table realtime.messages enable row level security;

create function realtime.topic() returns text
language sql stable as $$
  select current_setting('realtime.topic', true)
$$;

create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language sql as $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
$$;

grant usage on schema realtime to authenticated, service_role;
grant select, insert on realtime.messages to authenticated, service_role;

-- storage -----------------------------------------------------------------------
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema storage to authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

-- publication used by Postgres Changes ------------------------------------------
create publication supabase_realtime;

-- Supabase default privileges ---------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
