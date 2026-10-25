-- =============================================================================
-- Talkzi · 0015 · Billing: Stripe event idempotency, local wallet payments
-- (JazzCash / Easypaisa prepaid periods) and prepaid expiry.
-- =============================================================================

-- Provider event ids (e.g. Stripe evt_…) so retried deliveries are processed once.
alter table public.webhook_events add column external_id text;
create unique index webhook_events_source_external_uidx
  on public.webhook_events (source, external_id)
  where external_id is not null;

-- One row per local wallet checkout. Wallets have no recurring billing, so a
-- paid order buys one prepaid month or year.
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('jazzcash', 'easypaisa')),
  reference text not null unique,
  plan public.plan_tier not null check (plan <> 'free'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'pkr',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'pending_verification', 'expired')),
  provider_response jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index billing_payments_workspace_idx on public.billing_payments (workspace_id, created_at desc);

alter table public.billing_payments enable row level security;
-- Admins can read their payment history; every write goes through the service role.
create policy billing_payments_select on public.billing_payments for select to authenticated using (
  workspace_id = (select public.current_workspace_id())
  and (select public.has_workspace_role('admin'::public.workspace_role))
);

-- -----------------------------------------------------------------------------
-- activate_prepaid_plan: marks a wallet order paid and starts (or extends) the
-- prepaid period. Idempotent: replaying a callback for a paid order is a no-op.
-- A renewal of the same active plan extends from the current period end.
-- -----------------------------------------------------------------------------
create or replace function public.activate_prepaid_plan(p_payment_id uuid, p_response jsonb default '{}'::jsonb)
returns public.billing_subscriptions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.billing_payments;
  v_sub public.billing_subscriptions;
  v_start timestamptz := now();
  v_length interval;
begin
  update public.billing_payments
     set status = 'paid', paid_at = now(), provider_response = provider_response || coalesce(p_response, '{}'::jsonb)
   where id = p_payment_id and status in ('pending', 'pending_verification')
  returning * into v_payment;

  if v_payment.id is null then
    select s.* into v_sub
      from public.billing_subscriptions s
      join public.billing_payments p on p.workspace_id = s.workspace_id
     where p.id = p_payment_id;
    return v_sub;
  end if;

  v_length := case v_payment.billing_interval when 'year' then interval '1 year' else interval '1 month' end;

  select * into v_sub from public.billing_subscriptions where workspace_id = v_payment.workspace_id for update;
  if v_sub.id is not null
     and v_sub.provider in ('jazzcash', 'easypaisa', 'manual')
     and v_sub.status = 'active'
     and v_sub.plan = v_payment.plan
     and v_sub.current_period_end > now() then
    v_start := v_sub.current_period_end;
  end if;

  insert into public.billing_subscriptions as s (
    workspace_id, provider, plan, status, billing_interval, currency,
    current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_price_id
  )
  values (
    v_payment.workspace_id, v_payment.provider, v_payment.plan, 'active', v_payment.billing_interval, v_payment.currency,
    case when v_start > now() then v_sub.current_period_start else v_start end, v_start + v_length, true, null, null
  )
  on conflict (workspace_id) do update set
    provider = excluded.provider,
    plan = excluded.plan,
    status = 'active',
    billing_interval = excluded.billing_interval,
    currency = excluded.currency,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = true,
    stripe_subscription_id = null,
    stripe_price_id = null
  returning * into v_sub;

  return v_sub;
end;
$$;

-- Prepaid (wallet / manual) periods that ran out fall back to Free via the
-- billing_subscriptions_sync_plan trigger. Run hourly by the usage-rollup cron.
create or replace function public.expire_prepaid_subscriptions()
returns setof uuid
language sql
security invoker
set search_path = ''
as $$
  update public.billing_subscriptions
     set status = 'canceled'
   where provider in ('jazzcash', 'easypaisa', 'manual')
     and status = 'active'
     and current_period_end is not null
     and current_period_end < now()
  returning workspace_id;
$$;

-- Reconciles the real-time messages_sent counter (plan limit) with the
-- messages table. Only raises counters, so a missed increment is caught but a
-- customer is never billed for less than they sent.
create or replace function public.rollup_usage(p_period date default (date_trunc('month', now()))::date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.usage_counters as u (workspace_id, period, metric, value)
  select m.workspace_id, p_period, 'messages_sent', count(*)
    from public.messages m
   where m.direction = 'outbound'
     and m.broadcast_id is null
     and m.status in ('sent', 'delivered', 'read')
     and m.created_at >= p_period
     and m.created_at < p_period + interval '1 month'
   group by m.workspace_id
  on conflict (workspace_id, period, metric)
  do update set value = excluded.value, updated_at = now()
  where u.value < excluded.value;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.activate_prepaid_plan(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.rollup_usage(date) from public, anon, authenticated;
grant execute on function public.rollup_usage(date) to service_role;
revoke execute on function public.expire_prepaid_subscriptions() from public, anon, authenticated;
grant execute on function public.activate_prepaid_plan(uuid, jsonb) to service_role;
grant execute on function public.expire_prepaid_subscriptions() to service_role;
