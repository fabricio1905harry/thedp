-- ---------------------------------------------------------------------
-- 0072: Reserve for Later Delivery — full flow (stream 4)
--
-- The order keeps its payment status (orders.status 'reserved' → 'paid' …)
-- so nothing else in the payment/Action Center logic changes. The reserve
-- life-cycle is a separate column, reserve_stage:
--
--   RESERVED       deposit confirmed, balance not due yet
--   BALANCE_DUE    inside the reminder window (≤ 14 days before the due
--                  date) or on the due date, balance still unpaid
--   READY_TO_SHIP  balance paid in full (order paid)
--   OVERDUE        due date passed with the balance unpaid
--   EXPIRED        180-day maximum reserve window ended unpaid
--   COMPLETED      shipped / delivered
--
-- Dates (set in Admin → order → "Reserve for Later Delivery"):
--   reserve_desired_delivery_date  what the buyer wants
--   reserve_balance_due_date       when the balance must be paid (defaults to
--                                  desired date − reserve_balance_lead_days)
--   reserve_expires_at             reserved_at + reserve_max_days (180)
--
-- refresh_reserve_stages() + queue_reserve_reminders() run from the hourly
-- cron. Reminders (14 / 8 / 7 days before the due date, overdue, expired)
-- go through queue_notification() (idempotent per order/event).
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists reserve_desired_delivery_date date,
  add column if not exists reserve_balance_due_date date,
  add column if not exists reserve_expires_at timestamptz,
  add column if not exists reserve_stage text
    check (reserve_stage in ('reserved', 'balance_due', 'ready_to_ship', 'overdue', 'expired', 'completed')),
  add column if not exists reserve_stage_at timestamptz;

create index if not exists orders_reserve_due_idx on orders (reserve_balance_due_date)
  where payment_mode = 'reserve';

insert into app_settings (key, value) values
  ('reserve_max_days', '180'::jsonb),
  ('reserve_balance_lead_days', '15'::jsonb),
  ('reserve_expiry_action', '"flag"'::jsonb)      -- 'flag' (Action Center) | 'cancel'
on conflict (key) do nothing;

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('reserve_balance_due', 'Reserve Balance Due', 1, 'high', '/admin/envios-futuros?stage=balance_due', false, 12),
  ('reserve_overdue', 'Reserve Overdue / Expired', 4, 'critical', '/admin/envios-futuros?stage=overdue', false, 46)
on conflict (code) do nothing;

-- reserve_expires_at / stage when the deposit is confirmed (status → reserved)
create or replace function orders_reserve_lifecycle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  max_days integer := coalesce(get_setting_numeric('reserve_max_days'), 180);
begin
  if new.payment_mode <> 'reserve' then
    return new;
  end if;

  if new.status = 'reserved' and new.reserve_stage is null then
    new.reserve_stage := 'reserved';
    new.reserve_stage_at := now();
    new.reserve_expires_at := coalesce(new.reserve_expires_at, coalesce(new.reserved_at, now()) + make_interval(days => max_days));
  elsif new.status in ('paid', 'processing') and new.reserve_stage in ('reserved', 'balance_due', 'overdue') then
    new.reserve_stage := 'ready_to_ship';
    new.reserve_stage_at := now();
  elsif new.status in ('shipped', 'delivered') and new.reserve_stage is distinct from 'completed' and new.reserve_stage is not null then
    new.reserve_stage := 'completed';
    new.reserve_stage_at := now();
  end if;

  -- default balance due date from the desired delivery date
  if new.reserve_balance_due_date is null and new.reserve_desired_delivery_date is not null then
    new.reserve_balance_due_date := new.reserve_desired_delivery_date
      - coalesce(get_setting_numeric('reserve_balance_lead_days'), 15)::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_reserve_lifecycle on orders;
create trigger orders_reserve_lifecycle
  before update of status, reserve_desired_delivery_date, reserve_balance_due_date on orders
  for each row execute function orders_reserve_lifecycle();

-- Orders already reserved before this migration get their stage.
update orders set reserve_stage = 'reserved', reserve_stage_at = now(),
  reserve_expires_at = coalesce(reserve_expires_at, coalesce(reserved_at, now()) + interval '180 days')
where payment_mode = 'reserve' and status = 'reserved' and reserve_stage is null;

-- ---------------------------------------------------------------------
-- Hourly: advance stages, raise/resolve Action Center items, expire.
-- Returns counts for the cron response.
-- ---------------------------------------------------------------------
create or replace function refresh_reserve_stages()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  new_stage text;
  due_n integer := 0;
  overdue_n integer := 0;
  expired_n integer := 0;
  action text := coalesce((select trim(both '"' from value::text) from app_settings where key = 'reserve_expiry_action'), 'flag');
  ref text;
  who text;
begin
  for r in
    select o.*, c.email as c_email,
           coalesce(nullif(c.company_name, ''), nullif(c.name, ''), c.email) as c_who
    from orders o left join customers c on c.id = o.customer_id
    where o.payment_mode = 'reserve' and o.status = 'reserved'
  loop
    ref := coalesce(r.order_number, left(r.id::text, 8));
    who := r.c_who;
    new_stage := r.reserve_stage;

    if r.reserve_expires_at is not null and r.reserve_expires_at <= now() then
      new_stage := 'expired';
    elsif r.reserve_balance_due_date is not null then
      if current_date > r.reserve_balance_due_date then
        new_stage := 'overdue';
      elsif current_date >= r.reserve_balance_due_date - 14 then
        new_stage := 'balance_due';
      else
        new_stage := 'reserved';
      end if;
    end if;

    if new_stage is distinct from r.reserve_stage then
      update orders set reserve_stage = new_stage, reserve_stage_at = now() where id = r.id;
    end if;

    -- Action Center
    if new_stage = 'balance_due' then
      due_n := due_n + 1;
      perform raise_action('reserve_balance_due', 'reserve_balance_due:' || r.id,
        'Reserve balance due on ' || to_char(r.reserve_balance_due_date, 'DD/MM/YYYY'),
        'order', r.id, ref, who, r.total - coalesce(r.reserve_amount, 0), r.currency, 1, '/admin/pedidos/' || r.id);
    else
      perform resolve_action('reserve_balance_due:' || r.id);
    end if;

    if new_stage = 'overdue' then
      overdue_n := overdue_n + 1;
      perform resolve_action('reserve_balance_due:' || r.id);
      perform raise_action('reserve_overdue', 'reserve_overdue:' || r.id,
        'RESERVE OVERDUE since ' || to_char(r.reserve_balance_due_date, 'DD/MM/YYYY') || ' — contact the buyer',
        'order', r.id, ref, who, r.total - coalesce(r.reserve_amount, 0), r.currency, 1, '/admin/pedidos/' || r.id);
      perform queue_notification('reserve_overdue', r.customer_id, r.id,
        jsonb_build_object('due_date', r.reserve_balance_due_date, 'currency', r.currency),
        'reserve_overdue:' || r.id);
    elsif new_stage = 'expired' then
      expired_n := expired_n + 1;
      perform raise_action('reserve_overdue', 'reserve_overdue:' || r.id,
        'RESERVE EXPIRED (max ' || coalesce(get_setting_numeric('reserve_max_days'), 180)::integer || ' days) — decide refund / extension',
        'order', r.id, ref, who, r.total - coalesce(r.reserve_amount, 0), r.currency, 1, '/admin/pedidos/' || r.id, 'critical');
      perform queue_notification('reserve_expired', r.customer_id, r.id,
        jsonb_build_object('currency', r.currency), 'reserve_expired:' || r.id);
      if action = 'cancel' then
        -- cancelling an order with confirmed payment raises the refund/credit decision (0027 feeder)
        update orders set status = 'canceled' where id = r.id and status = 'reserved';
      end if;
    else
      perform resolve_action('reserve_overdue:' || r.id);
    end if;
  end loop;

  -- close items of orders that are no longer open reserves
  update action_items set status = 'resolved', resolution = 'auto', resolved_at = now(), updated_at = now()
  where status = 'open' and action_type in ('reserve_balance_due', 'reserve_overdue') and reference_type = 'order'
    and not exists (select 1 from orders o where o.id = action_items.reference_id and o.payment_mode = 'reserve' and o.status = 'reserved');

  return jsonb_build_object('balance_due', due_n, 'overdue', overdue_n, 'expired', expired_n);
end;
$$;

-- Reminders 14 / 8 / 7 days before the balance due date.
create or replace function queue_reserve_reminders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  d integer;
  n integer := 0;
begin
  for r in
    select o.id, o.customer_id, o.currency, o.total, o.reserve_amount, o.reserve_balance_due_date,
           (o.reserve_balance_due_date - current_date) as days_left
    from orders o
    where o.payment_mode = 'reserve' and o.status = 'reserved'
      and o.reserve_balance_due_date is not null
      and (o.reserve_balance_due_date - current_date) in (14, 8, 7)
  loop
    d := r.days_left;
    perform queue_notification('reserve_reminder_' || d, r.customer_id, r.id,
      jsonb_build_object('days', d, 'due_date', r.reserve_balance_due_date, 'currency', r.currency,
        'balance', r.total - coalesce(r.reserve_amount, 0)),
      'reserve_reminder_' || d || ':' || r.id || ':' || r.reserve_balance_due_date);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function refresh_reserve_stages() from public;
revoke execute on function queue_reserve_reminders() from public;
grant execute on function refresh_reserve_stages() to service_role;
grant execute on function queue_reserve_reminders() to service_role;
