-- =============================================================================
-- Talkzi · 0010 · Realtime broadcast-from-database + Storage buckets
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Realtime: every write to inbox tables is broadcast on the PRIVATE channel
-- `workspace:<workspace_id>` (Supabase "Broadcast from Database").
-- Event names: <table>.<op>, e.g. messages.insert, conversations.update.
-- Best-effort: a Realtime failure never blocks the write.
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if v_row ->> 'workspace_id' is null then
    return null;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', lower(tg_op), 'record', v_row),
      tg_table_name || '.' || lower(tg_op),
      'workspace:' || (v_row ->> 'workspace_id'),
      true
    );
  exception when others then
    null;
  end;

  return null;
end;
$$;

create trigger messages_broadcast
  after insert or update on public.messages
  for each row execute function public.broadcast_workspace_change();

create trigger conversations_broadcast
  after insert or update on public.conversations
  for each row execute function public.broadcast_workspace_change();

create trigger internal_notes_broadcast
  after insert or update or delete on public.internal_notes
  for each row execute function public.broadcast_workspace_change();

create trigger broadcasts_broadcast
  after update on public.broadcasts
  for each row execute function public.broadcast_workspace_change();

create trigger phone_numbers_broadcast
  after update on public.phone_numbers
  for each row execute function public.broadcast_workspace_change();

create trigger message_templates_broadcast
  after update on public.message_templates
  for each row execute function public.broadcast_workspace_change();

-- Authorization for private channels: members of the active workspace can
-- receive broadcasts and publish presence on their workspace topic only.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy talkzi_workspace_receive on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension in ('broadcast', 'presence')
        and (select realtime.topic()) = 'workspace:' || (select public.current_workspace_id())::text
      )
    $p$;

    execute $p$
      create policy talkzi_workspace_send on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension in ('broadcast', 'presence')
        and (select realtime.topic()) = 'workspace:' || (select public.current_workspace_id())::text
      )
    $p$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets. Object paths always start with the workspace id:
--   media/<workspace_id>/<conversation_id>/<file>
--   branding/<workspace_id>/logo.png
--   ai-documents/<workspace_id>/<document_id>/<file>
--   imports/<workspace_id>/<file>.csv
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values
      ('media', 'media', false, 104857600),
      ('branding', 'branding', true, 5242880),
      ('ai-documents', 'ai-documents', false, 20971520),
      ('imports', 'imports', false, 20971520)
    on conflict (id) do nothing;
  end if;

  if to_regclass('storage.objects') is not null then
    execute $p$
      create policy talkzi_storage_read on storage.objects
      for select to authenticated
      using (
        bucket_id in ('media', 'branding', 'ai-documents', 'imports')
        and (storage.foldername(name))[1] = (select public.current_workspace_id())::text
      )
    $p$;

    execute $p$
      create policy talkzi_storage_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('media', 'branding', 'ai-documents', 'imports')
        and (storage.foldername(name))[1] = (select public.current_workspace_id())::text
        and (select public.has_workspace_role('agent'))
      )
    $p$;

    execute $p$
      create policy talkzi_storage_update on storage.objects
      for update to authenticated
      using (
        bucket_id in ('media', 'branding', 'ai-documents', 'imports')
        and (storage.foldername(name))[1] = (select public.current_workspace_id())::text
        and (select public.has_workspace_role('agent'))
      )
    $p$;

    execute $p$
      create policy talkzi_storage_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('media', 'branding', 'ai-documents', 'imports')
        and (storage.foldername(name))[1] = (select public.current_workspace_id())::text
        and (select public.has_workspace_role('admin'))
      )
    $p$;
  end if;
end
$$;
