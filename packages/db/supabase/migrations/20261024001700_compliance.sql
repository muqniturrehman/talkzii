-- =============================================================================
-- Talkzi · 0017 · Compliance: message retention, platform log hygiene and
-- Meta data-deletion lookups.
-- =============================================================================

-- Meta's data deletion / deauthorize callbacks identify the person by their
-- app-scoped Facebook user id, captured at Embedded Signup.
create index waba_accounts_fb_user_idx on public.waba_accounts ((metadata ->> 'fb_user_id'))
  where metadata ? 'fb_user_id';

-- -----------------------------------------------------------------------------
-- purge_workspace_messages: deletes up to p_limit messages older than
-- p_before for one workspace and returns the Storage paths of their media so
-- the caller can remove the files too. Run repeatedly until it returns fewer
-- rows than the limit.
-- -----------------------------------------------------------------------------
create or replace function public.purge_workspace_messages(p_workspace_id uuid, p_before timestamptz, p_limit integer default 5000)
returns table (deleted_id uuid, storage_path text)
language sql
security invoker
set search_path = ''
as $$
  with doomed as (
    select m.id
      from public.messages m
     where m.workspace_id = p_workspace_id
       and m.created_at < p_before
     order by m.created_at
     limit greatest(p_limit, 1)
  )
  delete from public.messages m
   using doomed d
   where m.id = d.id
  returning m.id, nullif(m.media ->> 'storagePath', '');
$$;

-- Webhook payloads, delivery logs and finished chatbot sessions older than
-- p_before. Failed inbound events are kept for investigation.
create or replace function public.purge_platform_logs(p_before timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_events integer;
  v_deliveries integer;
  v_sessions integer;
begin
  delete from public.webhook_events where created_at < p_before and status in ('processed', 'ignored');
  get diagnostics v_events = row_count;
  delete from public.webhook_deliveries where created_at < p_before and status in ('success', 'failed');
  get diagnostics v_deliveries = row_count;
  delete from public.chatbot_sessions where updated_at < p_before and status not in ('active', 'waiting');
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('webhook_events', v_events, 'webhook_deliveries', v_deliveries, 'chatbot_sessions', v_sessions);
end;
$$;

revoke execute on function public.purge_workspace_messages(uuid, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.purge_platform_logs(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_workspace_messages(uuid, timestamptz, integer) to service_role;
grant execute on function public.purge_platform_logs(timestamptz) to service_role;
