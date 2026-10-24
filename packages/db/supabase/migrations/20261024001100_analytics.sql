-- =============================================================================
-- Talkzi · 0011 · Analytics (SECURITY INVOKER → scoped by RLS to the caller's
-- active workspace; days are bucketed in the workspace timezone)
-- =============================================================================

create or replace function public.workspace_timezone()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select w.timezone from public.workspaces w where w.id = public.current_workspace_id()),
    'UTC'
  );
$$;

create or replace function public.analytics_message_volume(p_from timestamptz, p_to timestamptz)
returns table (day date, inbound bigint, outbound bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (m.created_at at time zone public.workspace_timezone())::date as day,
    count(*) filter (where m.direction = 'inbound') as inbound,
    count(*) filter (where m.direction = 'outbound') as outbound
  from public.messages m
  where m.workspace_id = public.current_workspace_id()
    and m.created_at >= p_from
    and m.created_at < p_to
  group by 1
  order by 1;
$$;

-- First-response time per "waiting period": an inbound message that follows an
-- outbound one (or opens the thread) until the next human agent reply.
create or replace function public.analytics_response_times(p_from timestamptz, p_to timestamptz)
returns table (day date, avg_seconds double precision, median_seconds double precision, answered bigint, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with ordered as (
    select
      m.conversation_id,
      m.created_at,
      m.direction,
      m.sender_type,
      lag(m.direction) over (partition by m.conversation_id order by m.created_at) as prev_direction
    from public.messages m
    where m.workspace_id = public.current_workspace_id()
      and m.created_at >= p_from - interval '7 days'
      and m.created_at < p_to + interval '7 days'
      and m.type not in ('reaction', 'system')
  ),
  waits as (
    select o.conversation_id, o.created_at as asked_at
    from ordered o
    where o.direction = 'inbound'
      and (o.prev_direction is null or o.prev_direction = 'outbound')
      and o.created_at >= p_from
      and o.created_at < p_to
  ),
  answered as (
    select
      w.asked_at,
      (
        select min(o.created_at)
        from ordered o
        where o.conversation_id = w.conversation_id
          and o.direction = 'outbound'
          and o.sender_type = 'agent'
          and o.created_at > w.asked_at
      ) as answered_at
    from waits w
  )
  select
    (a.asked_at at time zone public.workspace_timezone())::date as day,
    avg(extract(epoch from (a.answered_at - a.asked_at)))::double precision as avg_seconds,
    (percentile_cont(0.5) within group (order by extract(epoch from (a.answered_at - a.asked_at))))::double precision as median_seconds,
    count(a.answered_at) as answered,
    count(*) as total
  from answered a
  group by 1
  order by 1;
$$;

create or replace function public.analytics_cost_by_category(p_from timestamptz, p_to timestamptz)
returns table (category public.conversation_category, billable bigint, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.pricing_category as category,
    count(*) filter (where m.pricing_billable) as billable,
    count(*) as total
  from public.messages m
  where m.workspace_id = public.current_workspace_id()
    and m.direction = 'outbound'
    and m.pricing_category is not null
    and m.created_at >= p_from
    and m.created_at < p_to
  group by 1
  order by 1;
$$;

create or replace function public.analytics_csat(p_from timestamptz, p_to timestamptz)
returns table (score smallint, responses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.csat_score as score, count(*) as responses
  from public.conversations c
  where c.workspace_id = public.current_workspace_id()
    and c.csat_score is not null
    and coalesce(c.resolved_at, c.updated_at) >= p_from
    and coalesce(c.resolved_at, c.updated_at) < p_to
  group by 1
  order by 1;
$$;

create or replace function public.analytics_overview()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ws uuid := public.current_workspace_id();
  v_tz text := public.workspace_timezone();
  v_day_start timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_result jsonb;
begin
  if v_ws is null then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'open_conversations', (select count(*) from public.conversations c where c.workspace_id = v_ws and c.status = 'open'),
    'unassigned_conversations', (select count(*) from public.conversations c where c.workspace_id = v_ws and c.status = 'open' and c.assigned_to is null),
    'unread_messages', (select coalesce(sum(c.unread_count), 0) from public.conversations c where c.workspace_id = v_ws),
    'messages_today_inbound', (select count(*) from public.messages m where m.workspace_id = v_ws and m.direction = 'inbound' and m.created_at >= v_day_start),
    'messages_today_outbound', (select count(*) from public.messages m where m.workspace_id = v_ws and m.direction = 'outbound' and m.created_at >= v_day_start),
    'contacts_total', (select count(*) from public.contacts c where c.workspace_id = v_ws),
    'contacts_opted_out', (select count(*) from public.contacts c where c.workspace_id = v_ws and c.opted_out),
    'broadcasts_this_month', (select count(*) from public.broadcasts b where b.workspace_id = v_ws and b.status <> 'draft' and b.created_at >= date_trunc('month', now())),
    'delivery_rate_30d', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where m.status in ('delivered', 'read'))::numeric / count(*)::numeric, 4) end
      from public.messages m
      where m.workspace_id = v_ws and m.direction = 'outbound' and m.created_at >= now() - interval '30 days'
        and m.status in ('sent', 'delivered', 'read', 'failed')
    ),
    'read_rate_30d', (
      select case when count(*) = 0 then null
        else round(count(*) filter (where m.status = 'read')::numeric / count(*)::numeric, 4) end
      from public.messages m
      where m.workspace_id = v_ws and m.direction = 'outbound' and m.created_at >= now() - interval '30 days'
        and m.status in ('sent', 'delivered', 'read', 'failed')
    ),
    'avg_first_response_seconds_30d', (
      select case when sum(r.answered) = 0 then null
        else sum(r.avg_seconds * r.answered) / sum(r.answered) end
      from public.analytics_response_times(now() - interval '30 days', now()) r
      where r.answered > 0
    ),
    'csat_avg_30d', (
      select round(avg(c.csat_score)::numeric, 2) from public.conversations c
      where c.workspace_id = v_ws and c.csat_score is not null and c.updated_at >= now() - interval '30 days'
    ),
    'phone_numbers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'display_phone_number', p.display_phone_number,
        'verified_name', p.verified_name,
        'quality_rating', p.quality_rating,
        'messaging_limit_tier', p.messaging_limit_tier,
        'status', p.status
      ) order by p.created_at), '[]'::jsonb)
      from public.phone_numbers p where p.workspace_id = v_ws
    )
  ) into v_result;

  return v_result;
end;
$$;
