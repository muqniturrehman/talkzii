-- =============================================================================
-- Talkzi · 0014 · Broadcast audiences
--
-- broadcast_audience()          resolves an audience JSON to contacts
-- materialize_broadcast_recipients()  snapshots it into broadcast_recipients
--                                (opted-out contacts are stored as 'skipped')
-- Service role only; the API authorises the caller and passes plan limits.
-- =============================================================================

create or replace function public.broadcast_audience(p_workspace_id uuid, p_audience jsonb)
returns table (contact_id uuid, wa_id text, opted_out boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      coalesce(p_audience ->> 'type', 'all') as kind,
      array(select jsonb_array_elements_text(coalesce(p_audience -> 'labelIds', '[]'::jsonb))::uuid) as label_ids,
      array(select jsonb_array_elements_text(coalesce(p_audience -> 'excludeLabelIds', '[]'::jsonb))::uuid) as exclude_ids,
      array(select jsonb_array_elements_text(coalesce(p_audience -> 'contactIds', '[]'::jsonb))::uuid) as contact_ids
  )
  select c.id, c.wa_id, c.opted_out
  from public.contacts c, params p
  where c.workspace_id = p_workspace_id
    and (
      p.kind = 'all'
      or (p.kind = 'labels' and exists (
        select 1 from public.contact_labels cl where cl.contact_id = c.id and cl.label_id = any (p.label_ids)
      ))
      or (p.kind = 'contacts' and c.id = any (p.contact_ids))
    )
    and not exists (
      select 1 from public.contact_labels cl where cl.contact_id = c.id and cl.label_id = any (p.exclude_ids)
    );
$$;

create or replace function public.materialize_broadcast_recipients(p_broadcast_id uuid, p_max_recipients integer default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_broadcast public.broadcasts;
  v_sendable integer;
  v_skipped integer;
begin
  select * into v_broadcast from public.broadcasts where id = p_broadcast_id for update;
  if not found then
    raise exception 'broadcast_not_found';
  end if;
  if v_broadcast.status not in ('draft', 'scheduled') then
    raise exception 'broadcast_not_editable';
  end if;

  drop table if exists _audience;
  create temporary table _audience on commit drop as
  select * from public.broadcast_audience(v_broadcast.workspace_id, v_broadcast.audience);

  select count(*) filter (where not a.opted_out), count(*) filter (where a.opted_out)
    into v_sendable, v_skipped
  from _audience a;

  if p_max_recipients is not null and v_sendable > p_max_recipients then
    raise exception 'plan_limit:%:%', v_sendable, p_max_recipients;
  end if;

  -- Rebuild (re-scheduling a broadcast re-snapshots its audience).
  delete from public.broadcast_recipients where broadcast_id = p_broadcast_id;

  insert into public.broadcast_recipients (workspace_id, broadcast_id, contact_id, wa_id, status, error_message)
  select
    v_broadcast.workspace_id,
    p_broadcast_id,
    a.contact_id,
    a.wa_id,
    case when a.opted_out then 'skipped'::public.recipient_status else 'pending'::public.recipient_status end,
    case when a.opted_out then 'Contact opted out' end
  from _audience a
  on conflict (broadcast_id, wa_id) do nothing;

  update public.broadcasts
  set total_recipients = v_sendable + v_skipped,
      skipped_count = v_skipped,
      sent_count = 0,
      delivered_count = 0,
      read_count = 0,
      failed_count = 0,
      replied_count = 0
  where id = p_broadcast_id;

  return jsonb_build_object('total', v_sendable + v_skipped, 'sendable', v_sendable, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.broadcast_audience(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.materialize_broadcast_recipients(uuid, integer) from public, anon, authenticated;
grant execute on function public.broadcast_audience(uuid, jsonb) to service_role;
grant execute on function public.materialize_broadcast_recipients(uuid, integer) to service_role;
