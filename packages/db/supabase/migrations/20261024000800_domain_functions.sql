-- =============================================================================
-- Talkzi · 0008 · Domain functions (atomic, idempotent building blocks)
-- Service-role only unless stated otherwise.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- record_inbound_message
-- One round-trip for an inbound WhatsApp message:
--   upsert contact → upsert conversation → insert message (dedupe by wamid)
--   → bump unread_count → extend 24h window → reopen resolved/snoozed threads
--   → attribute broadcast replies (72h).
-- Returns { status: created | duplicate | unknown_phone_number, ... }
-- ---------------------------------------------------------------------------
create or replace function public.record_inbound_message(
  p_phone_number_id text,
  p_wa_id text,
  p_wamid text,
  p_type public.message_type,
  p_timestamp timestamptz,
  p_profile_name text default null,
  p_body text default null,
  p_content jsonb default '{}'::jsonb,
  p_media jsonb default null,
  p_reply_to_wamid text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone public.phone_numbers;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_preview text;
  v_counts_unread boolean := p_type not in ('reaction', 'system');
  v_opens_window boolean := p_type <> 'system';
  v_ts timestamptz := coalesce(p_timestamp, now());
begin
  select * into v_phone from public.phone_numbers where phone_number_id = p_phone_number_id;
  if not found then
    return jsonb_build_object('status', 'unknown_phone_number');
  end if;

  select m.id, m.conversation_id into v_message_id, v_conversation_id
  from public.messages m where m.wamid = p_wamid;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'message_id', v_message_id,
      'conversation_id', v_conversation_id,
      'workspace_id', v_phone.workspace_id
    );
  end if;

  insert into public.contacts (workspace_id, wa_id, profile_name, source, last_seen_at, last_inbound_at)
  values (v_phone.workspace_id, p_wa_id, p_profile_name, 'whatsapp', v_ts, v_ts)
  on conflict (workspace_id, wa_id) do update set
    profile_name = coalesce(excluded.profile_name, public.contacts.profile_name),
    last_seen_at = greatest(public.contacts.last_seen_at, excluded.last_seen_at),
    last_inbound_at = greatest(public.contacts.last_inbound_at, excluded.last_inbound_at)
  returning id into v_contact_id;

  v_preview := left(coalesce(nullif(p_body, ''), '[' || p_type::text || ']'), 280);

  insert into public.conversations (workspace_id, contact_id, phone_number_id, status)
  values (v_phone.workspace_id, v_contact_id, v_phone.id, 'open')
  on conflict (workspace_id, contact_id, phone_number_id) do update set updated_at = now()
  returning id into v_conversation_id;

  insert into public.messages (
    workspace_id, conversation_id, contact_id, phone_number_id, wamid, direction, type, status,
    sender_type, body, content, media, reply_to_wamid, created_at
  )
  values (
    v_phone.workspace_id, v_conversation_id, v_contact_id, v_phone.id, p_wamid, 'inbound', p_type, 'received',
    'contact', p_body, coalesce(p_content, '{}'::jsonb), p_media, p_reply_to_wamid, v_ts
  )
  on conflict (wamid) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    -- Lost a race with a concurrent delivery of the same webhook.
    return jsonb_build_object(
      'status', 'duplicate',
      'conversation_id', v_conversation_id,
      'workspace_id', v_phone.workspace_id
    );
  end if;

  update public.conversations c set
    unread_count = c.unread_count + (case when v_counts_unread then 1 else 0 end),
    last_message_preview = case when c.last_message_at is null or v_ts >= c.last_message_at then v_preview else c.last_message_preview end,
    last_message_direction = case when c.last_message_at is null or v_ts >= c.last_message_at then 'inbound'::public.message_direction else c.last_message_direction end,
    last_message_at = greatest(c.last_message_at, v_ts),
    last_inbound_at = greatest(c.last_inbound_at, v_ts),
    expires_at = case when v_opens_window then greatest(c.expires_at, v_ts + interval '24 hours') else c.expires_at end,
    awaiting_reply_since = case when v_counts_unread then coalesce(c.awaiting_reply_since, v_ts) else c.awaiting_reply_since end,
    status = case when c.status in ('resolved', 'snoozed') and v_counts_unread then 'open'::public.conversation_status else c.status end,
    snoozed_until = case when c.status = 'snoozed' and v_counts_unread then null else c.snoozed_until end,
    resolved_at = case when c.status = 'resolved' and v_counts_unread then null else c.resolved_at end
  where c.id = v_conversation_id;

  -- Broadcast ROI: the first reply within 72h of a broadcast counts as a reply.
  if v_counts_unread then
    update public.broadcast_recipients r
      set replied_at = v_ts, updated_at = now()
    where r.workspace_id = v_phone.workspace_id
      and r.contact_id = v_contact_id
      and r.replied_at is null
      and r.sent_at is not null
      and r.sent_at > v_ts - interval '72 hours'
      and r.sent_at <= v_ts;
  end if;

  return jsonb_build_object(
    'status', 'created',
    'message_id', v_message_id,
    'conversation_id', v_conversation_id,
    'contact_id', v_contact_id,
    'workspace_id', v_phone.workspace_id,
    'phone_number_id', v_phone.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_outbound_message
-- Inserts an outbound message (usually status 'queued' before the Cloud API
-- call), ensuring a conversation exists, and updates conversation preview and
-- first-response metrics. Returns the inserted message row as jsonb.
-- ---------------------------------------------------------------------------
create or replace function public.record_outbound_message(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_phone_number_id uuid,
  p_type public.message_type,
  p_sender_type public.sender_type,
  p_body text default null,
  p_content jsonb default '{}'::jsonb,
  p_media jsonb default null,
  p_status public.message_status default 'queued',
  p_wamid text default null,
  p_sender_id uuid default null,
  p_template_id uuid default null,
  p_broadcast_id uuid default null,
  p_client_message_id text default null,
  p_reply_to_wamid text default null,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  v_message public.messages;
  v_preview text := left(coalesce(nullif(p_body, ''), '[' || p_type::text || ']'), 280);
begin
  if v_conversation_id is null then
    insert into public.conversations (workspace_id, contact_id, phone_number_id, status)
    values (p_workspace_id, p_contact_id, p_phone_number_id, 'open')
    on conflict (workspace_id, contact_id, phone_number_id) do update set updated_at = now()
    returning id into v_conversation_id;
  end if;

  if p_client_message_id is not null then
    select * into v_message from public.messages
    where workspace_id = p_workspace_id and client_message_id = p_client_message_id;
    if found then
      return to_jsonb(v_message) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  insert into public.messages (
    workspace_id, conversation_id, contact_id, phone_number_id, wamid, direction, type, status,
    sender_type, sender_id, body, content, media, template_id, broadcast_id, client_message_id,
    reply_to_wamid, sent_at
  )
  values (
    p_workspace_id, v_conversation_id, p_contact_id, p_phone_number_id, p_wamid, 'outbound', p_type, p_status,
    p_sender_type, p_sender_id, p_body, coalesce(p_content, '{}'::jsonb), p_media, p_template_id, p_broadcast_id,
    p_client_message_id, p_reply_to_wamid, case when p_status = 'sent' then now() end
  )
  returning * into v_message;

  update public.conversations c set
    last_message_at = now(),
    last_message_preview = v_preview,
    last_message_direction = 'outbound',
    first_response_at = case
      when p_sender_type = 'agent' and c.first_response_at is null and c.awaiting_reply_since is not null then now()
      else c.first_response_at end,
    awaiting_reply_since = case when p_sender_type in ('agent', 'bot') then null else c.awaiting_reply_since end,
    unread_count = case when p_sender_type = 'agent' then 0 else c.unread_count end
  where c.id = v_conversation_id;

  return to_jsonb(v_message) || jsonb_build_object('duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_message_status
-- Applies a WhatsApp status webhook to messages and broadcast_recipients.
-- Forward-only (sent → delivered → read), so out-of-order and duplicate
-- webhooks are harmless. Pricing info is stored whenever present.
-- ---------------------------------------------------------------------------
create or replace function public.apply_message_status(
  p_wamid text,
  p_status public.message_status,
  p_timestamp timestamptz,
  p_error_code integer default null,
  p_error_message text default null,
  p_pricing_category public.conversation_category default null,
  p_pricing_billable boolean default null,
  p_pricing_model text default null,
  p_pricing_type text default null,
  p_meta_conversation_id text default null,
  p_meta_conversation_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.messages;
  v_ts timestamptz := coalesce(p_timestamp, now());
  v_message_updated boolean := false;
  v_recipient_status public.recipient_status;
  v_recipients integer := 0;
  v_broadcast_id uuid;
begin
  select * into v_msg from public.messages where wamid = p_wamid for update;

  if found then
    if public.message_status_rank(p_status) > public.message_status_rank(v_msg.status) then
      update public.messages m set
        status = p_status,
        sent_at = case when p_status in ('sent', 'delivered', 'read') then coalesce(m.sent_at, v_ts) else m.sent_at end,
        delivered_at = case when p_status in ('delivered', 'read') then coalesce(m.delivered_at, v_ts) else m.delivered_at end,
        read_at = case when p_status = 'read' then coalesce(m.read_at, v_ts) else m.read_at end,
        failed_at = case when p_status = 'failed' then coalesce(m.failed_at, v_ts) else m.failed_at end,
        error_code = case when p_status = 'failed' then p_error_code else m.error_code end,
        error_message = case when p_status = 'failed' then p_error_message else m.error_message end
      where m.id = v_msg.id;
      v_message_updated := true;
    end if;

    if p_pricing_category is not null or p_pricing_billable is not null or p_pricing_model is not null then
      update public.messages m set
        pricing_category = coalesce(p_pricing_category, m.pricing_category),
        pricing_billable = coalesce(p_pricing_billable, m.pricing_billable),
        pricing_model = coalesce(p_pricing_model, m.pricing_model),
        pricing_type = coalesce(p_pricing_type, m.pricing_type)
      where m.id = v_msg.id;
    end if;

    if p_pricing_category is not null or p_meta_conversation_id is not null then
      update public.conversations c set
        category = coalesce(p_pricing_category, c.category),
        meta_conversation_id = coalesce(p_meta_conversation_id, c.meta_conversation_id),
        meta_conversation_expires_at = coalesce(p_meta_conversation_expires_at, c.meta_conversation_expires_at)
      where c.id = v_msg.conversation_id;
    end if;
  end if;

  if p_status in ('sent', 'delivered', 'read', 'failed') then
    v_recipient_status := p_status::text::public.recipient_status;

    update public.broadcast_recipients r set
      status = v_recipient_status,
      sent_at = case when v_recipient_status in ('sent', 'delivered', 'read') then coalesce(r.sent_at, v_ts) else r.sent_at end,
      delivered_at = case when v_recipient_status in ('delivered', 'read') then coalesce(r.delivered_at, v_ts) else r.delivered_at end,
      read_at = case when v_recipient_status = 'read' then coalesce(r.read_at, v_ts) else r.read_at end,
      failed_at = case when v_recipient_status = 'failed' then coalesce(r.failed_at, v_ts) else r.failed_at end,
      error_code = case when v_recipient_status = 'failed' then p_error_code else r.error_code end,
      error_message = case when v_recipient_status = 'failed' then p_error_message else r.error_message end,
      updated_at = now()
    where r.wamid = p_wamid
      and r.status <> 'skipped'
      and public.recipient_status_rank(v_recipient_status) > public.recipient_status_rank(r.status)
    returning r.broadcast_id into v_broadcast_id;

    get diagnostics v_recipients = row_count;
  end if;

  return jsonb_build_object(
    'found', v_msg.id is not null,
    'message_id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'workspace_id', v_msg.workspace_id,
    'message_updated', v_message_updated,
    'recipients_updated', v_recipients,
    'broadcast_id', v_broadcast_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Broadcast engine primitives
-- ---------------------------------------------------------------------------

-- Atomically claims up to p_limit pending recipients (FOR UPDATE SKIP LOCKED)
-- so concurrent cron ticks never double-send.
create or replace function public.claim_broadcast_recipients(p_broadcast_id uuid, p_limit integer)
returns setof public.broadcast_recipients
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Recover rows stuck in 'sending' (e.g. a function that timed out mid-tick).
  update public.broadcast_recipients
    set status = 'pending', updated_at = now()
  where broadcast_id = p_broadcast_id
    and status = 'sending'
    and last_attempt_at < now() - interval '10 minutes';

  return query
  update public.broadcast_recipients r
    set status = 'sending',
        attempts = r.attempts + 1,
        last_attempt_at = now(),
        updated_at = now()
  where r.id in (
    select x.id
    from public.broadcast_recipients x
    where x.broadcast_id = p_broadcast_id
      and x.status = 'pending'
      and (x.next_attempt_at is null or x.next_attempt_at <= now())
    order by x.created_at, x.id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning r.*;
end;
$$;

-- Postgres-backed queue fallback (used when REDIS_URL/BullMQ is not configured):
-- leases due broadcasts for p_lock_seconds.
create or replace function public.claim_due_broadcasts(p_limit integer default 5, p_lock_seconds integer default 55)
returns setof public.broadcasts
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.broadcasts b
    set locked_until = now() + make_interval(secs => p_lock_seconds),
        status = case when b.status = 'scheduled' then 'sending'::public.broadcast_status else b.status end,
        started_at = coalesce(b.started_at, now())
  where b.id in (
    select x.id
    from public.broadcasts x
    where x.status in ('scheduled', 'sending')
      and (x.scheduled_at is null or x.scheduled_at <= now())
      and (x.locked_until is null or x.locked_until < now())
    order by x.scheduled_at nulls first, x.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning b.*;
end;
$$;

create or replace function public.complete_broadcast_if_done(p_broadcast_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.broadcast_recipients
    where broadcast_id = p_broadcast_id and status in ('pending', 'sending')
  ) then
    return false;
  end if;

  update public.broadcasts
    set status = 'completed', completed_at = coalesce(completed_at, now()), locked_until = null
  where id = p_broadcast_id and status in ('sending', 'scheduled');

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usage metering
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(
  p_workspace_id uuid,
  p_metric text,
  p_amount bigint default 1,
  p_period date default (date_trunc('month', now()))::date
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.usage_counters (workspace_id, period, metric, value)
  values (p_workspace_id, p_period, p_metric, p_amount)
  on conflict (workspace_id, period, metric)
  do update set value = public.usage_counters.value + excluded.value, updated_at = now();
$$;

-- ---------------------------------------------------------------------------
-- RAG: semantic search over the caller's workspace knowledge base.
-- SECURITY INVOKER → RLS applies (callable by authenticated users).
-- ---------------------------------------------------------------------------
create or replace function public.match_document_chunks(
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5,
  p_min_similarity double precision default 0.2
)
returns table (id uuid, document_id uuid, content text, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.id, c.document_id, c.content, 1 - (c.embedding <=> p_query_embedding) as similarity
  from public.ai_document_chunks c
  where c.workspace_id = public.current_workspace_id()
    and c.embedding is not null
    and 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

-- Lock service-only functions down (Supabase grants EXECUTE on public
-- functions to anon/authenticated by default).
revoke execute on function public.record_inbound_message(text, text, text, public.message_type, timestamptz, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.record_outbound_message(uuid, uuid, uuid, public.message_type, public.sender_type, text, jsonb, jsonb, public.message_status, text, uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.apply_message_status(text, public.message_status, timestamptz, integer, text, public.conversation_category, boolean, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_broadcast_recipients(uuid, integer) from public, anon, authenticated;
revoke execute on function public.claim_due_broadcasts(integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_broadcast_if_done(uuid) from public, anon, authenticated;
revoke execute on function public.increment_usage(uuid, text, bigint, date) from public, anon, authenticated;

grant execute on function public.record_inbound_message(text, text, text, public.message_type, timestamptz, text, text, jsonb, jsonb, text) to service_role;
grant execute on function public.record_outbound_message(uuid, uuid, uuid, public.message_type, public.sender_type, text, jsonb, jsonb, public.message_status, text, uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.apply_message_status(text, public.message_status, timestamptz, integer, text, public.conversation_category, boolean, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_broadcast_recipients(uuid, integer) to service_role;
grant execute on function public.claim_due_broadcasts(integer, integer) to service_role;
grant execute on function public.complete_broadcast_if_done(uuid) to service_role;
grant execute on function public.increment_usage(uuid, text, bigint, date) to service_role;
