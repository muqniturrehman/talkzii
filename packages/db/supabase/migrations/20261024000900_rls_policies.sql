-- =============================================================================
-- Talkzi · 0009 · Row Level Security + updated_at triggers
--
-- Every tenant row carries workspace_id. Policies compare it with
-- public.current_workspace_id() (JWT claim from the auth hook, verified
-- against live membership) and gate writes by minimum role:
--   owner > admin > agent > viewer
-- `(select fn())` wrappers let Postgres evaluate helpers once per statement.
-- A NULL role in the matrix means "no policy" → service role only.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in
    select * from (values
      -- table                         read      insert    update    delete
      ('waba_accounts',                'admin',  'admin',  'admin',  'admin'),
      ('phone_numbers',                'viewer', 'admin',  'admin',  'admin'),
      ('phone_number_quality_events',  'viewer', null,     null,     null),
      ('message_templates',            'viewer', 'admin',  'admin',  'admin'),
      ('contacts',                     'viewer', 'agent',  'agent',  'admin'),
      ('labels',                       'viewer', 'agent',  'admin',  'admin'),
      ('contact_labels',               'viewer', 'agent',  'agent',  'agent'),
      ('conversations',                'viewer', 'agent',  'agent',  'admin'),
      ('conversation_labels',          'viewer', 'agent',  'agent',  'agent'),
      ('messages',                     'viewer', 'agent',  'agent',  'admin'),
      ('canned_replies',               'viewer', 'agent',  'agent',  'admin'),
      ('broadcasts',                   'viewer', 'admin',  'admin',  'admin'),
      ('broadcast_recipients',         'viewer', 'admin',  'admin',  'admin'),
      ('chatbot_flows',                'viewer', 'admin',  'admin',  'admin'),
      ('chatbot_sessions',             'viewer', null,     'agent',  null),
      ('integrations',                 'admin',  'admin',  'admin',  'admin'),
      ('webhooks',                     'admin',  'admin',  'admin',  'admin'),
      ('webhook_deliveries',           'admin',  null,     null,     null),
      ('audit_log',                    'admin',  null,     null,     null),
      ('webhook_events',               'admin',  null,     null,     null),
      ('usage_counters',               'viewer', null,     null,     null),
      ('billing_subscriptions',        'admin',  null,     null,     null),
      ('ai_documents',                 'viewer', 'admin',  'admin',  'admin'),
      ('ai_document_chunks',           'viewer', 'admin',  'admin',  'admin'),
      ('data_deletion_requests',       'admin',  null,     null,     null),
      ('workspace_invitations',        'admin',  'admin',  'admin',  'admin')
    ) as x(tbl, read_role, insert_role, update_role, delete_role)
  loop
    execute format('alter table public.%I enable row level security', t.tbl);

    if t.read_role is not null then
      execute format(
        'create policy %I on public.%I for select to authenticated using ('
        'workspace_id = (select public.current_workspace_id()) '
        'and (select public.has_workspace_role(%L::public.workspace_role)))',
        t.tbl || '_select', t.tbl, t.read_role);
    end if;

    if t.insert_role is not null then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ('
        'workspace_id = (select public.current_workspace_id()) '
        'and (select public.has_workspace_role(%L::public.workspace_role)))',
        t.tbl || '_insert', t.tbl, t.insert_role);
    end if;

    if t.update_role is not null then
      execute format(
        'create policy %I on public.%I for update to authenticated using ('
        'workspace_id = (select public.current_workspace_id()) '
        'and (select public.has_workspace_role(%L::public.workspace_role))) '
        'with check (workspace_id = (select public.current_workspace_id()))',
        t.tbl || '_update', t.tbl, t.update_role);
    end if;

    if t.delete_role is not null then
      execute format(
        'create policy %I on public.%I for delete to authenticated using ('
        'workspace_id = (select public.current_workspace_id()) '
        'and (select public.has_workspace_role(%L::public.workspace_role)))',
        t.tbl || '_delete', t.tbl, t.delete_role);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles: own row + co-members of the active workspace (names/avatars)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.workspace_members wm
    where wm.user_id = profiles.id
      and wm.workspace_id = (select public.current_workspace_id())
  )
);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workspaces: members read; admins update the active workspace; owners delete.
-- Creation goes through public.create_workspace().
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy workspaces_select on public.workspaces for select to authenticated
  using ((select public.is_workspace_member(id)));
create policy workspaces_update on public.workspaces for update to authenticated
  using (id = (select public.current_workspace_id()) and (select public.has_workspace_role('admin')))
  with check (id = (select public.current_workspace_id()));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (id = (select public.current_workspace_id()) and (select public.has_workspace_role('owner')));

-- ---------------------------------------------------------------------------
-- workspace_members: see your own memberships (workspace switcher) and the
-- members of the active workspace; admins manage; anyone can leave.
-- ---------------------------------------------------------------------------
alter table public.workspace_members enable row level security;

create policy workspace_members_select on public.workspace_members for select to authenticated using (
  user_id = (select auth.uid())
  or workspace_id = (select public.current_workspace_id())
);
create policy workspace_members_insert on public.workspace_members for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id()) and (select public.has_workspace_role('admin'))
);
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.has_workspace_role('admin')))
  with check (workspace_id = (select public.current_workspace_id()));
create policy workspace_members_delete on public.workspace_members for delete to authenticated using (
  user_id = (select auth.uid())
  or (workspace_id = (select public.current_workspace_id()) and (select public.has_workspace_role('admin')))
);

-- ---------------------------------------------------------------------------
-- internal_notes: authors (or admins) edit/delete their own notes.
-- ---------------------------------------------------------------------------
alter table public.internal_notes enable row level security;

create policy internal_notes_select on public.internal_notes for select to authenticated
  using (workspace_id = (select public.current_workspace_id()));
create policy internal_notes_insert on public.internal_notes for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and author_id = (select auth.uid())
  and (select public.has_workspace_role('agent'))
);
create policy internal_notes_update on public.internal_notes for update to authenticated
  using (
    workspace_id = (select public.current_workspace_id())
    and (author_id = (select auth.uid()) or (select public.has_workspace_role('admin')))
  )
  with check (workspace_id = (select public.current_workspace_id()));
create policy internal_notes_delete on public.internal_notes for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (author_id = (select auth.uid()) or (select public.has_workspace_role('admin')))
);

-- ---------------------------------------------------------------------------
-- api_keys: admins manage workspace keys; every member manages personal tokens.
-- ---------------------------------------------------------------------------
alter table public.api_keys enable row level security;

create policy api_keys_select on public.api_keys for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (user_id = (select auth.uid()) or (select public.has_workspace_role('admin')))
);
create policy api_keys_insert on public.api_keys for insert to authenticated with check (
  workspace_id = (select public.current_workspace_id())
  and (
    (user_id = (select auth.uid()) and (select public.has_workspace_role('viewer')))
    or (user_id is null and (select public.has_workspace_role('admin')))
  )
);
create policy api_keys_update on public.api_keys for update to authenticated
  using (
    workspace_id = (select public.current_workspace_id())
    and (user_id = (select auth.uid()) or (select public.has_workspace_role('admin')))
  )
  with check (workspace_id = (select public.current_workspace_id()));
create policy api_keys_delete on public.api_keys for delete to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (user_id = (select auth.uid()) or (select public.has_workspace_role('admin')))
);

-- ---------------------------------------------------------------------------
-- updated_at triggers for every table that has the column
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join pg_tables pt on pt.schemaname = c.table_schema and pt.tablename = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t.table_name);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Safety net: fail the migration if any public table is missing RLS.
-- ---------------------------------------------------------------------------
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is not enabled on: %', missing;
  end if;
end
$$;
