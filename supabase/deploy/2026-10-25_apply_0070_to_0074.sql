-- The Dressing Project — migrations 0070–0074 (post-payment operations: notifications, abandoned carts, Reserve flow, DHL shipments, invoices).
-- Paste into Supabase SQL Editor → Run. Requires 0024–0038. Safe to re-run.

begin;
-- ---------------------------------------------------------------------
-- 0070: Notifications engine (post-payment operations, stream 4)
--
-- * notification_templates — approved texts per event × channel × locale
--   (the client wants approved texts, NOT AI-translated at send time).
--   Seeds are NOT inserted here: Admin → Notificações creates the default
--   drafts (approved = false) on demand and the TDP approves each one.
-- * notification_log — one row per message (e-mail, WhatsApp, SMS).
--   E-mail rows link to email_outbox (the actual queue, sent by
--   src/lib/email.ts); WhatsApp/SMS rows are queued here and handled by the
--   messaging adapter (mock unless provider env vars exist).
-- * queue_notification() — single entry point used by triggers, crons and
--   server actions.
-- * Triggers on orders / payments → events: order_request_received,
--   stock_confirmed, reserve_confirmed, payment_received.
--   (shipment events: migration 0073; reserve reminders: 0072; abandoned
--   cart: 0071.)
-- * queue_payment_window_reminders() — reminder before the stock hold
--   window ends (hourly cron).
-- ---------------------------------------------------------------------

create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  locale text not null check (locale in ('en', 'es', 'pt')),
  subject text not null default '',
  body text not null default '',
  approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references customers (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  unique (event, channel, locale)
);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  locale text not null default 'en',
  to_address text,
  customer_id uuid references customers (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  subject text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider text,                 -- resend | mock | twilio …
  provider_ref text,
  error text,
  is_test boolean not null default false,
  email_outbox_id uuid references email_outbox (id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_log_created_idx on notification_log (created_at desc);
create index if not exists notification_log_order_idx on notification_log (order_id);
create index if not exists notification_log_outbox_idx on notification_log (email_outbox_id);
create index if not exists notification_log_queue_idx on notification_log (channel, status) where status = 'queued';
create unique index if not exists notification_log_dedupe_uq on notification_log (dedupe_key) where dedupe_key is not null;

alter table notification_templates enable row level security;
alter table notification_log enable row level security;
drop policy if exists notification_templates_staff on notification_templates;
create policy notification_templates_staff on notification_templates for all using (is_staff()) with check (is_staff());
drop policy if exists notification_log_staff on notification_log;
create policy notification_log_staff on notification_log for all using (is_staff()) with check (is_staff());
grant all on notification_templates, notification_log to service_role;
grant select, insert, update, delete on notification_templates, notification_log to authenticated;

insert into app_settings (key, value) values
  ('notifications_require_approval', 'true'::jsonb),
  ('payment_window_reminder_hours', '6'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- queue_notification: e-mail → email_outbox (+ log row linked to it);
-- WhatsApp / SMS → log row 'queued' when the customer has a phone and a
-- template exists for that channel. p_dedupe makes reminders idempotent.
-- ---------------------------------------------------------------------

create or replace function queue_notification(
  p_event text,
  p_customer_id uuid,
  p_order_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c customers;
  loc text;
  payload jsonb;
  outbox_id uuid;
  ch text;
begin
  select * into c from customers where id = p_customer_id;
  if c.id is null or coalesce(c.email, '') = '' then
    return;
  end if;
  loc := case when c.locale in ('es', 'pt') then c.locale else 'en' end;
  payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'buyer_name', coalesce(nullif(c.name, ''), nullif(c.company_name, ''), ''),
    'customer_id', c.id
  );
  if p_order_id is not null then
    payload := payload || jsonb_build_object('order_id', p_order_id)
      || coalesce((select jsonb_build_object('order_number', o.order_number) from orders o where o.id = p_order_id), '{}'::jsonb);
  end if;

  if p_dedupe is not null and exists (select 1 from notification_log where dedupe_key = p_dedupe) then
    return;
  end if;

  insert into email_outbox (to_email, template, locale, payload)
  values (c.email, p_event, loc, payload)
  returning id into outbox_id;

  insert into notification_log (event, channel, locale, to_address, customer_id, order_id, payload, email_outbox_id, dedupe_key)
  values (p_event, 'email', loc, c.email, c.id, p_order_id, payload, outbox_id, p_dedupe)
  on conflict do nothing;

  if coalesce(c.phone, '') <> '' then
    foreach ch in array array['whatsapp', 'sms'] loop
      if exists (select 1 from notification_templates t where t.event = p_event and t.channel = ch and t.locale in (loc, 'en')) then
        insert into notification_log (event, channel, locale, to_address, customer_id, order_id, payload, dedupe_key)
        values (p_event, ch, loc, c.phone, c.id, p_order_id, payload,
                case when p_dedupe is null then null else p_dedupe || ':' || ch end)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function queue_notification(text, uuid, uuid, jsonb, text) from public;
grant execute on function queue_notification(text, uuid, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------
-- order status → events
-- ---------------------------------------------------------------------

create or replace function orders_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  base := jsonb_build_object(
    'currency', new.currency,
    'total', new.total,
    'stock_hold_until', new.stock_hold_until,
    'reserve_amount', new.reserve_amount
  );

  if tg_op = 'INSERT' and new.status in ('order_request', 'created') then
    perform queue_notification('order_request_received', new.customer_id, new.id, base);
  elsif new.status = 'confirmed_awaiting_payment' then
    perform queue_notification('stock_confirmed', new.customer_id, new.id, base);
  elsif new.status = 'reserved' then
    perform queue_notification('reserve_confirmed', new.customer_id, new.id, base);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_notify on orders;
create trigger orders_notify
  after insert or update of status on orders
  for each row execute function orders_notify();

-- Confirmed payment → "payment received" (the Reserve deposit is announced
-- as reserve_confirmed by the order status trigger instead).
create or replace function payments_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return null;
  end if;
  if new.kind = 'reserve_deposit' then
    return null;
  end if;
  select * into o from orders where id = new.order_id;
  if o.id is null then
    return null;
  end if;
  perform queue_notification('payment_received', o.customer_id, o.id,
    jsonb_build_object('amount', new.amount, 'currency', new.currency, 'kind', new.kind),
    'payment_received:' || new.id);
  return null;
end;
$$;

drop trigger if exists payments_notify on payments;
create trigger payments_notify
  after insert or update of status on payments
  for each row execute function payments_notify();

-- ---------------------------------------------------------------------
-- Reminder: the stock hold window ends soon (hourly cron).
-- ---------------------------------------------------------------------

create or replace function queue_payment_window_reminders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  hrs numeric := coalesce(get_setting_numeric('payment_window_reminder_hours'), 6);
  r record;
  n integer := 0;
begin
  if hrs <= 0 then
    return 0;
  end if;
  for r in
    select o.id, o.customer_id, o.stock_hold_until, o.currency, o.total
    from orders o
    where o.status = 'confirmed_awaiting_payment'
      and o.payment_released_at is not null
      and o.stock_hold_until is not null
      and o.stock_hold_until > now()
      and o.stock_hold_until <= now() + make_interval(secs => hrs * 3600)
      and not exists (select 1 from payments p where p.order_id = o.id and p.status in ('confirmed', 'pending_verification'))
  loop
    perform queue_notification('payment_window_expiring', r.customer_id, r.id,
      jsonb_build_object('stock_hold_until', r.stock_hold_until, 'currency', r.currency, 'total', r.total),
      'payment_window_expiring:' || r.id || ':' || extract(epoch from r.stock_hold_until)::bigint);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function queue_payment_window_reminders() from public;
grant execute on function queue_payment_window_reminders() to service_role;

-- ---------------------------------------------------------------------
-- 0071: Abandoned carts (stream 4)
--
-- * carts / cart_items — the cart of a logged-in buyer, synced from the
--   client cart (localStorage) by a debounced server action. snapshot keeps
--   the full client item so a recovery link can restore it exactly.
-- * An Order Request (orders insert) closes the active cart ("ordered");
--   an emptied cart closes it ("emptied"). Both stop the reminder sequence.
-- * Settings (app_settings): abandoned_cart_enabled, abandoned_cart_hours_1
--   (default 2), abandoned_cart_hours_2 (default 24).
-- * Action Center type 'abandoned_carts' (summary item raised by the cron).
-- ---------------------------------------------------------------------

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ordered', 'emptied')),
  currency text,
  item_count integer not null default 0,
  total_value numeric(14, 2) not null default 0,
  cycle integer not null default 1,                 -- bumped when a closed cart is reopened
  last_activity_at timestamptz not null default now(),
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  recovery_token uuid not null default gen_random_uuid(),
  recovery_clicked_at timestamptz,
  order_id uuid references orders (id) on delete set null,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists carts_customer_uq on carts (customer_id);
create unique index if not exists carts_token_uq on carts (recovery_token);
create index if not exists carts_status_activity_idx on carts (status, last_activity_at);

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  variant_id uuid,
  product_slug text,
  title text,
  color text,
  size text,
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cart_items_cart_idx on cart_items (cart_id);

alter table carts enable row level security;
alter table cart_items enable row level security;
drop policy if exists carts_owner_read on carts;
create policy carts_owner_read on carts for select using (customer_id = auth.uid() or is_staff());
drop policy if exists carts_staff_write on carts;
create policy carts_staff_write on carts for all using (is_staff()) with check (is_staff());
drop policy if exists cart_items_owner_read on cart_items;
create policy cart_items_owner_read on cart_items for select using (
  is_staff() or exists (select 1 from carts c where c.id = cart_items.cart_id and c.customer_id = auth.uid())
);
drop policy if exists cart_items_staff_write on cart_items;
create policy cart_items_staff_write on cart_items for all using (is_staff()) with check (is_staff());
grant select on carts, cart_items to authenticated;
grant all on carts, cart_items to service_role;

insert into app_settings (key, value) values
  ('abandoned_cart_enabled', 'true'::jsonb),
  ('abandoned_cart_hours_1', '2'::jsonb),
  ('abandoned_cart_hours_2', '24'::jsonb)
on conflict (key) do nothing;

-- Action Center: summary card for recoverable revenue.
insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('abandoned_carts', 'Abandoned Carts', 3, 'normal', '/admin/carrinhos', false, 31)
on conflict (code) do nothing;

-- An Order Request closes the buyer's active cart (stops the sequence).
create or replace function carts_close_on_order()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update carts
  set status = 'ordered', order_id = new.id, ordered_at = now(), updated_at = now()
  where customer_id = new.customer_id and status = 'active';
  return null;
end;
$$;

drop trigger if exists orders_close_cart on orders;
create trigger orders_close_cart
  after insert on orders
  for each row execute function carts_close_on_order();

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

-- ---------------------------------------------------------------------
-- 0073: Shipping (DHL) workflow (stream 4)
--
-- * shipments (extends the 0001 table): CREATED → PICKUP_REQUESTED →
--   IN_TRANSIT → DELIVERED | EXCEPTION. A shipment can only be created for
--   an order paid in full (status paid/processing/shipped/delivered).
-- * is_mock marks shipments produced by the mock adapter (no DHL
--   credentials): the Admin shows "MOCK" and the buyer never sees a
--   fabricated tracking code as real (see src/lib/dhl-adapter.ts).
-- * shipment_events — tracking timeline (buyer can read their own).
-- * shipment_documents — commercial invoice / packing list / label files in
--   the private storage bucket 'shipment-docs' (staff only; buyers get a
--   signed URL through an authenticated route, never a public link).
-- * order_prep_items — "Product preparation" checklist (labels / tags /
--   bagging per order line).
-- * Triggers: order status follows the shipment (shipped / delivered),
--   buyer notifications (shipment_created, in_transit, delivered) and
--   Action Center items (dhl_shipping_actions, dhl_errors).
-- ---------------------------------------------------------------------

alter table shipments
  add column if not exists carrier text not null default 'DHL',
  add column if not exists is_mock boolean not null default false,
  add column if not exists tracking_url text,
  add column if not exists shipment_reference text,
  add column if not exists pickup_requested_at timestamptz,
  add column if not exists pickup_date date,
  add column if not exists pickup_reference text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists packages jsonb,
  add column if not exists total_weight_kg numeric(10, 3),
  add column if not exists provider_payload jsonb,
  add column if not exists last_error text,
  add column if not exists created_by uuid references customers (id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

update shipments set status = 'CREATED' where status is null or upper(status) not in ('CREATED', 'PICKUP_REQUESTED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION');
update shipments set status = upper(status) where status <> upper(status);
alter table shipments alter column status set default 'CREATED';
alter table shipments alter column status set not null;
alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('CREATED', 'PICKUP_REQUESTED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION'));

create index if not exists shipments_order_idx on shipments (order_id);
create index if not exists shipments_status_idx on shipments (status);

create table if not exists shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  status text not null,
  description text,
  location text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('dhl', 'mock', 'manual', 'system')),
  raw jsonb,
  created_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shipment_events_shipment_idx on shipment_events (shipment_id, occurred_at);

create table if not exists shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('commercial_invoice', 'packing_list', 'label', 'other')),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  visible_to_buyer boolean not null default false,
  uploaded_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shipment_documents_shipment_idx on shipment_documents (shipment_id);

create table if not exists order_prep_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  task text not null check (task in ('labels', 'tags', 'bagging')),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references customers (id) on delete set null,
  unique (order_item_id, task)
);
create index if not exists order_prep_items_order_idx on order_prep_items (order_id);

alter table shipment_events enable row level security;
alter table shipment_documents enable row level security;
alter table order_prep_items enable row level security;
alter table shipments enable row level security;

drop policy if exists shipments_staff_write on shipments;
create policy shipments_staff_write on shipments for all using (is_staff()) with check (is_staff());
drop policy if exists shipment_events_staff on shipment_events;
create policy shipment_events_staff on shipment_events for all using (is_staff()) with check (is_staff());
drop policy if exists shipment_events_owner_read on shipment_events;
create policy shipment_events_owner_read on shipment_events for select using (
  exists (
    select 1 from shipments s join orders o on o.id = s.order_id
    where s.id = shipment_events.shipment_id and o.customer_id = auth.uid()
  )
);
drop policy if exists shipment_documents_staff on shipment_documents;
create policy shipment_documents_staff on shipment_documents for all using (is_staff()) with check (is_staff());
drop policy if exists shipment_documents_owner_read on shipment_documents;
create policy shipment_documents_owner_read on shipment_documents for select using (
  visible_to_buyer and exists (select 1 from orders o where o.id = shipment_documents.order_id and o.customer_id = auth.uid())
);
drop policy if exists order_prep_items_staff on order_prep_items;
create policy order_prep_items_staff on order_prep_items for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on shipments, shipment_events, shipment_documents, order_prep_items to authenticated;
grant all on shipments, shipment_events, shipment_documents, order_prep_items to service_role;

-- Private bucket + staff-only object policies (Supabase only; skipped on plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('shipment-docs', 'shipment-docs', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists shipment_docs_staff_all on storage.objects';
    execute $p$create policy shipment_docs_staff_all on storage.objects for all to authenticated
      using (bucket_id = 'shipment-docs' and public.is_staff())
      with check (bucket_id = 'shipment-docs' and public.is_staff())$p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Gate: no shipment before full payment.
-- ---------------------------------------------------------------------
create or replace function shipments_require_full_payment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  st text;
begin
  select status into st from orders where id = new.order_id;
  if st is null or st not in ('paid', 'processing', 'shipped', 'delivered') then
    raise exception 'SHIPMENT_REQUIRES_FULL_PAYMENT: o pedido precisa estar pago integralmente';
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_require_full_payment on shipments;
create trigger shipments_require_full_payment
  before insert on shipments
  for each row execute function shipments_require_full_payment();

-- ---------------------------------------------------------------------
-- Lifecycle: timestamps, order status, notifications, Action Center.
-- ---------------------------------------------------------------------
create or replace function shipments_lifecycle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
  ref text;
  who text;
  href text;
  payload jsonb;
begin
  select * into o from orders where id = new.order_id;
  ref := coalesce(o.order_number, left(o.id::text, 8));
  href := '/admin/pedidos/' || o.id;
  select coalesce(nullif(company_name, ''), nullif(name, ''), email) into who from customers where id = o.customer_id;
  payload := jsonb_build_object(
    'tracking_number', new.dhl_tracking,
    'tracking_url', new.tracking_url,
    'carrier', new.carrier,
    'is_mock', new.is_mock
  );

  if tg_op = 'INSERT' then
    update orders set status = 'processing' where id = o.id and status = 'paid';
    insert into shipment_events (shipment_id, status, description, source)
    values (new.id, 'CREATED', 'Shipment created', case when new.is_mock then 'mock' else 'system' end);
    perform raise_action('dhl_shipping_actions', 'dhl_pickup:' || new.id,
      'Shipment created — request DHL pickup', 'order', o.id, ref, who, null, null, 1, href);
    -- never e-mail the buyer a MOCK tracking code
    if not new.is_mock then
      perform queue_notification('shipment_created', o.customer_id, o.id, payload, 'shipment_created:' || new.id);
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into shipment_events (shipment_id, status, description, source)
  values (new.id, new.status, 'Status → ' || new.status, case when new.is_mock then 'mock' else 'system' end);

  if new.status = 'PICKUP_REQUESTED' then
    perform resolve_action('dhl_pickup:' || new.id);
  end if;

  if new.status = 'IN_TRANSIT' then
    perform resolve_action('dhl_pickup:' || new.id);
    update orders set status = 'shipped' where id = o.id and status in ('paid', 'processing');
    if not new.is_mock then
      perform queue_notification('in_transit', o.customer_id, o.id, payload, 'in_transit:' || new.id);
    end if;
  elsif new.status = 'DELIVERED' then
    perform resolve_action('dhl_pickup:' || new.id);
    update orders set status = 'delivered' where id = o.id and status in ('paid', 'processing', 'shipped');
    if not new.is_mock then
      perform queue_notification('delivered', o.customer_id, o.id, payload, 'delivered:' || new.id);
    end if;
  end if;

  if new.status = 'EXCEPTION' then
    perform raise_action('dhl_errors', 'dhl_exception:' || new.id,
      'DHL EXCEPTION on shipment ' || coalesce(new.dhl_tracking, '—') || coalesce(' — ' || new.last_error, ''),
      'order', o.id, ref, who, null, null, 1, href);
  else
    perform resolve_action('dhl_exception:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists shipments_lifecycle on shipments;
create trigger shipments_lifecycle
  after insert or update of status on shipments
  for each row execute function shipments_lifecycle();

create or replace function shipments_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'IN_TRANSIT' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  if new.status = 'DELIVERED' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  if new.status = 'PICKUP_REQUESTED' and new.pickup_requested_at is null then
    new.pickup_requested_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_touch on shipments;
create trigger shipments_touch
  before insert or update on shipments
  for each row execute function shipments_touch();

-- ---------------------------------------------------------------------
-- 0074: Commercial invoice PDF (stream 4)
--
-- * invoice_counters — one numbering sequence per year (INV-2026-0001…),
--   allocated atomically by next_invoice_number().
-- * invoices — one issued invoice per order (the PDF is stored in the
--   private bucket 'shipment-docs' under invoices/<year>/<number>.pdf and
--   served through an authenticated route; buyers only see their own).
-- * app_settings 'invoice_template' — company data, bank details, notes
--   (Admin → Configurações da invoice). The client's template is pending:
--   the PDF layout reads everything from this row.
-- ---------------------------------------------------------------------

create table if not exists invoice_counters (
  year integer primary key,
  last_number integer not null default 0
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  year integer not null,
  seq integer not null,
  number text not null unique,
  status text not null default 'issued' check (status in ('issued', 'void')),
  currency text not null,
  total numeric(14, 2) not null default 0,
  storage_path text,
  data jsonb not null default '{}'::jsonb,   -- snapshot used to render the PDF
  issued_at timestamptz not null default now(),
  issued_by uuid references customers (id) on delete set null,
  unique (year, seq)
);
create unique index if not exists invoices_order_active_uq on invoices (order_id) where status = 'issued';

alter table invoice_counters enable row level security;
alter table invoices enable row level security;
drop policy if exists invoice_counters_staff on invoice_counters;
create policy invoice_counters_staff on invoice_counters for all using (is_staff()) with check (is_staff());
drop policy if exists invoices_staff on invoices;
create policy invoices_staff on invoices for all using (is_staff()) with check (is_staff());
drop policy if exists invoices_owner_read on invoices;
create policy invoices_owner_read on invoices for select using (
  status = 'issued' and exists (select 1 from orders o where o.id = invoices.order_id and o.customer_id = auth.uid())
);
grant select, insert, update on invoices to authenticated;
grant all on invoice_counters, invoices to service_role;

create or replace function next_invoice_number(p_year integer default null)
returns table (invoice_year integer, invoice_seq integer)
language plpgsql
security definer set search_path = public
as $$
declare
  y integer := coalesce(p_year, extract(year from now())::integer);
  n integer;
begin
  insert into invoice_counters (year, last_number) values (y, 1)
  on conflict (year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into n;
  return query select y, n;
end;
$$;

revoke execute on function next_invoice_number(integer) from public;
grant execute on function next_invoice_number(integer) to service_role;

insert into app_settings (key, value) values
  ('invoice_template', jsonb_build_object(
    'number_prefix', 'INV',
    'company_name', 'The Dressing Project',
    'company_address', '',
    'company_tax_id', '',
    'company_email', '',
    'company_phone', '',
    'bank_details', '',
    'notes', '',
    'footer', '',
    'origin_country', 'Brazil'
  ))
on conflict (key) do nothing;


commit;
