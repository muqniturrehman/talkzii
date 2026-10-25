-- =============================================================================
-- Talkzi · 0016 · Agency: client workspaces (sub-accounts) that inherit the
-- agency's plan and branding, and plan propagation.
-- =============================================================================

create index workspaces_custom_domain_verified_idx
  on public.workspaces (custom_domain)
  where custom_domain is not null and custom_domain_verified_at is not null;

-- -----------------------------------------------------------------------------
-- create_client_workspace: called by the API (service role) after it has
-- checked that the caller is an owner/admin of the agency and that the
-- agency's plan includes sub-accounts. The caller becomes the client's owner.
-- -----------------------------------------------------------------------------
create or replace function public.create_client_workspace(
  p_parent_id uuid,
  p_user_id uuid,
  p_name text,
  p_timezone text default null,
  p_default_country_code text default null
)
returns public.workspaces
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent public.workspaces;
  v_slug text;
  v_ws public.workspaces;
begin
  select * into v_parent from public.workspaces where id = p_parent_id;
  if v_parent.id is null then
    raise exception 'parent_not_found' using errcode = 'P0002';
  end if;
  if v_parent.parent_workspace_id is not null then
    raise exception 'nested_client_workspace' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_parent_id and m.user_id = p_user_id and m.role in ('owner', 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_slug := public.slugify(p_name);
  if exists (select 1 from public.workspaces w where w.slug = v_slug) then
    v_slug := left(v_slug, 55) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end if;

  insert into public.workspaces (name, slug, timezone, default_country_code, owner_id, parent_workspace_id, plan)
  values (
    p_name,
    v_slug,
    coalesce(nullif(p_timezone, ''), v_parent.timezone),
    coalesce(nullif(p_default_country_code, ''), v_parent.default_country_code),
    p_user_id,
    v_parent.id,
    v_parent.plan
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user_id, 'owner');
  return v_ws;
end;
$$;

revoke execute on function public.create_client_workspace(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_client_workspace(uuid, uuid, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Client workspaces always carry their agency's plan (they are billed through
-- the agency). If the agency is deleted, its clients fall back to Free.
-- -----------------------------------------------------------------------------
create or replace function public.propagate_agency_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.workspaces set plan = 'free' where parent_workspace_id = old.id;
    return old;
  end if;
  update public.workspaces set plan = new.plan where parent_workspace_id = new.id and plan is distinct from new.plan;
  return new;
end;
$$;

create trigger workspaces_propagate_plan
  after update of plan on public.workspaces
  for each row
  when (old.plan is distinct from new.plan)
  execute function public.propagate_agency_plan();

-- BEFORE delete: the FK's ON DELETE SET NULL would otherwise orphan the
-- clients before an AFTER trigger could find them.
create trigger workspaces_downgrade_clients
  before delete on public.workspaces
  for each row
  execute function public.propagate_agency_plan();

-- -----------------------------------------------------------------------------
-- Column privileges: workspace admins edit presentation and settings only.
-- plan, parent_workspace_id, owner_id, slug and custom-domain fields are
-- server-managed (billing, agency and domain verification flows) — RLS alone
-- would otherwise let an admin PATCH their own plan through PostgREST.
-- -----------------------------------------------------------------------------
revoke update on public.workspaces from authenticated;
grant update (name, logo_url, timezone, default_country_code, branding, settings) on public.workspaces to authenticated;
