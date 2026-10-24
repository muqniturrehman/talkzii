-- =============================================================================
-- Talkzi · 0013 · Bulk contact import
--
-- One set-based call per CSV batch: inserts new contacts (capped by the plan
-- capacity the API computed), optionally merges into existing ones, creates
-- labels named in the file and links labels. Service role only — the API
-- authorises the caller and enforces plan limits first.
-- =============================================================================

create or replace function public.import_contacts(
  p_workspace_id uuid,
  p_rows jsonb,
  p_update_existing boolean default false,
  p_label_ids uuid[] default '{}',
  p_created_by uuid default null,
  p_capacity integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created integer := 0;
  v_updated integer := 0;
  v_existing integer := 0;
  v_skipped_limit integer := 0;
  v_total integer := 0;
begin
  drop table if exists _incoming;
  drop table if exists _existing;

  create temporary table _incoming on commit drop as
  select distinct on (r.wa_id)
    r.wa_id,
    nullif(btrim(r.name), '') as name,
    nullif(lower(btrim(r.email)), '') as email,
    coalesce(r.custom_fields, '{}'::jsonb) as custom_fields,
    coalesce(r.labels, '{}'::text[]) as labels,
    r.row_number
  from jsonb_to_recordset(p_rows) as r(wa_id text, name text, email text, custom_fields jsonb, labels text[], row_number integer)
  where r.wa_id ~ '^[0-9]{6,15}$'
  order by r.wa_id, r.row_number;

  select count(*) into v_total from _incoming;

  -- Snapshot which numbers already exist before inserting anything.
  create temporary table _existing on commit drop as
  select i.wa_id
  from _incoming i
  join public.contacts c on c.workspace_id = p_workspace_id and c.wa_id = i.wa_id;

  select count(*) into v_existing from _existing;

  -- New contacts, in file order, up to the remaining plan capacity.
  with candidates as (
    select i.*
    from _incoming i
    where not exists (select 1 from _existing e where e.wa_id = i.wa_id)
    order by i.row_number
    limit case when p_capacity is null then null else greatest(p_capacity, 0) end
  ), inserted as (
    insert into public.contacts (workspace_id, wa_id, name, email, custom_fields, source, created_by)
    select p_workspace_id, wa_id, name, email, custom_fields, 'import', p_created_by from candidates
    on conflict (workspace_id, wa_id) do nothing
    returning 1
  )
  select count(*) into v_created from inserted;

  v_skipped_limit := greatest(v_total - v_existing - v_created, 0);

  if p_update_existing then
    with updated as (
      update public.contacts c
      set name = coalesce(i.name, c.name),
          email = coalesce(i.email, c.email),
          custom_fields = c.custom_fields || i.custom_fields
      from _incoming i
      join _existing e on e.wa_id = i.wa_id
      where c.workspace_id = p_workspace_id
        and c.wa_id = i.wa_id
      returning 1
    )
    select count(*) into v_updated from updated;
  end if;

  -- Labels named in the file (created on the fly) …
  insert into public.labels (workspace_id, name)
  select distinct p_workspace_id, left(btrim(l.name), 50)
  from _incoming i, unnest(i.labels) as l(name)
  where btrim(l.name) <> ''
  on conflict (workspace_id, name) do nothing;

  insert into public.contact_labels (contact_id, label_id, workspace_id)
  select c.id, lb.id, p_workspace_id
  from _incoming i
  cross join lateral unnest(i.labels) as l(name)
  join public.contacts c on c.workspace_id = p_workspace_id and c.wa_id = i.wa_id
  join public.labels lb on lb.workspace_id = p_workspace_id and lb.name = left(btrim(l.name), 50)
  on conflict do nothing;

  -- … and labels chosen in the import wizard, for every contact in the batch.
  insert into public.contact_labels (contact_id, label_id, workspace_id)
  select c.id, lb.id, p_workspace_id
  from _incoming i
  join public.contacts c on c.workspace_id = p_workspace_id and c.wa_id = i.wa_id
  join public.labels lb on lb.workspace_id = p_workspace_id and lb.id = any (p_label_ids)
  on conflict do nothing;

  return jsonb_build_object(
    'received', v_total,
    'created', v_created,
    'updated', v_updated,
    'existing', v_existing,
    'skipped_limit', v_skipped_limit
  );
end;
$$;

revoke execute on function public.import_contacts(uuid, jsonb, boolean, uuid[], uuid, integer) from public, anon, authenticated;
grant execute on function public.import_contacts(uuid, jsonb, boolean, uuid[], uuid, integer) to service_role;
