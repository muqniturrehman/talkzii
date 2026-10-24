-- =============================================================================
-- Talkzi · 0002 · Multi-tenancy: profiles, workspaces, members, invitations
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  active_workspace_id uuid,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  logo_url text,
  timezone text not null default 'Asia/Karachi',
  default_country_code text not null default '92' check (default_country_code ~ '^[0-9]{1,4}$'),
  plan public.plan_tier not null default 'free',
  owner_id uuid references public.profiles (id) on delete set null,
  -- Agency white-label: client workspaces point at their agency workspace.
  parent_workspace_id uuid references public.workspaces (id) on delete set null,
  custom_domain text unique check (custom_domain is null or custom_domain = lower(custom_domain)),
  custom_domain_verified_at timestamptz,
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_parent_workspace_id_idx on public.workspaces (parent_workspace_id);

alter table public.profiles
  add constraint profiles_active_workspace_id_fkey
  foreign key (active_workspace_id) references public.workspaces (id) on delete set null;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'agent',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.workspace_role not null default 'agent' check (role <> 'owner'),
  invited_by uuid references public.profiles (id) on delete set null,
  -- SHA-256 of the signed invitation token; re-sending rotates it.
  token_hash text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index workspace_invitations_pending_idx
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Tenancy helpers used by RLS policies.
--
-- The active workspace comes from the `workspace_id` JWT claim (set by the
-- custom access token hook below) and falls back to profiles.active_workspace_id
-- when the hook is not configured. Membership is always re-checked live, so a
-- removed member loses access immediately even with an unexpired token.
-- SECURITY DEFINER avoids recursive RLS evaluation on workspace_members.
-- ---------------------------------------------------------------------------
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Prefer the JWT claim; fall back to the profile's active workspace when the
  -- claim is missing or points at a workspace the user no longer belongs to.
  select wm.workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
    and wm.workspace_id in (
      nullif(auth.jwt() ->> 'workspace_id', '')::uuid,
      (select p.active_workspace_id from public.profiles p where p.id = auth.uid())
    )
  order by (wm.workspace_id = nullif(auth.jwt() ->> 'workspace_id', '')::uuid) desc nulls last
  limit 1;
$$;

create or replace function public.current_workspace_role()
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select wm.role
  from public.workspace_members wm
  where wm.user_id = auth.uid()
    and wm.workspace_id = public.current_workspace_id()
  limit 1;
$$;

create or replace function public.has_workspace_role(required public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.role_rank(public.current_workspace_role()) >= public.role_rank(required), false);
$$;

-- Everything the API layer needs about the caller's active workspace, in one
-- round-trip and consistent with what RLS sees.
create or replace function public.current_workspace_context()
returns table (
  workspace_id uuid,
  role public.workspace_role,
  plan public.plan_tier,
  name text,
  slug text,
  parent_workspace_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, wm.role, w.plan, w.name, w.slug, w.parent_workspace_id
  from public.workspaces w
  join public.workspace_members wm on wm.workspace_id = w.id and wm.user_id = auth.uid()
  where w.id = public.current_workspace_id();
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile bootstrap from auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Supabase Auth hook: adds workspace_id + workspace_role claims to every JWT.
-- Enable in Dashboard → Authentication → Hooks → Custom Access Token.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_active uuid;
  v_workspace_id uuid;
  v_role public.workspace_role;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  select p.active_workspace_id into v_active from public.profiles p where p.id = v_user_id;

  select wm.workspace_id, wm.role
    into v_workspace_id, v_role
  from public.workspace_members wm
  where wm.user_id = v_user_id
  order by (wm.workspace_id = v_active) desc nulls last, wm.created_at asc
  limit 1;

  if v_workspace_id is not null then
    v_claims := jsonb_set(v_claims, '{workspace_id}', to_jsonb(v_workspace_id::text));
    v_claims := jsonb_set(v_claims, '{workspace_role}', to_jsonb(v_role::text));
  else
    v_claims := v_claims - 'workspace_id' - 'workspace_role';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Workspace lifecycle RPCs (called with the user's JWT)
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(
  p_name text,
  p_slug text default null,
  p_timezone text default 'Asia/Karachi',
  p_default_country_code text default '92'
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_ws public.workspaces;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_slug := public.slugify(coalesce(nullif(p_slug, ''), p_name));
  if exists (select 1 from public.workspaces w where w.slug = v_slug) then
    v_slug := left(v_slug, 55) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end if;

  insert into public.workspaces (name, slug, timezone, default_country_code, owner_id)
  values (
    p_name,
    v_slug,
    coalesce(nullif(p_timezone, ''), 'Asia/Karachi'),
    coalesce(nullif(p_default_country_code, ''), '92'),
    v_user
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws.id, v_user, 'owner');

  update public.profiles set active_workspace_id = v_ws.id where id = v_user;

  return v_ws;
end;
$$;

create or replace function public.switch_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  update public.profiles set active_workspace_id = p_workspace_id where id = auth.uid();
end;
$$;

create or replace function public.accept_workspace_invitation(p_invitation_id uuid, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();

  select * into v_inv from public.workspace_invitations where id = p_invitation_id for update;
  if not found or v_inv.token_hash <> p_token_hash then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_accepted' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_inv.workspace_id, auth.uid(), v_inv.role, v_inv.invited_by)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role
    where public.role_rank(public.workspace_members.role) < public.role_rank(excluded.role);

  update public.workspace_invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where id = v_inv.id;

  update public.profiles set active_workspace_id = v_inv.workspace_id where id = auth.uid();

  return v_inv.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guard rails on membership changes:
--   * a workspace always keeps at least one owner
--   * only owners can grant or revoke the owner role
-- Cascaded deletes (workspace or user removal) are allowed through.
-- ---------------------------------------------------------------------------
create or replace function public.guard_workspace_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.workspace_role;
  v_touches_owner boolean;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_touches_owner := coalesce(tg_op <> 'DELETE' and new.role = 'owner', false)
                  or coalesce(tg_op <> 'INSERT' and old.role = 'owner', false);

  -- auth.uid() is null for service-role / internal calls, which are trusted.
  if v_touches_owner and auth.uid() is not null then
    -- Bootstrap: the first member of a brand-new workspace (create_workspace).
    if tg_op = 'INSERT' and not exists (
      select 1 from public.workspace_members m where m.workspace_id = new.workspace_id
    ) then
      return new;
    end if;

    select role into v_actor_role
    from public.workspace_members
    where workspace_id = coalesce(new.workspace_id, old.workspace_id) and user_id = auth.uid();

    if v_actor_role is distinct from 'owner' then
      raise exception 'only_owners_can_manage_owners' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = old.workspace_id and m.role = 'owner' and m.id <> old.id
    ) then
      raise exception 'cannot_remove_last_owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger workspace_members_guard
  before insert or update or delete on public.workspace_members
  for each row execute function public.guard_workspace_members();
