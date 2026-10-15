-- ---------------------------------------------------------------------
-- 0025: Sales channels, payment-method availability hierarchy and a
--       per-transaction payments ledger.
--
-- Payment availability: channel default → customer exception → order
-- exception; the most specific rule wins (see available_payment_methods).
--
-- Bank Processing Fee: charged PER Bank Transfer payment (a Reserve
-- deposit + a later balance by transfer = two fees). Configured in BRL in
-- app_settings and converted to the order currency at payment creation;
-- the BRL value and the converted amount are snapshotted on the row.
--
-- Revenue/margin: each payment stores its own breakdown (merchandise vs
-- pass-through charges) and the cost of goods it recognises, so history
-- never changes when prices, FX or orders change later.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- order lifecycle statuses used by the payment / confirmation flow
--   order_request → stock_confirmation → (awaiting_buyer_decision) →
--   confirmed_awaiting_payment | payment_coordination_required →
--   (payment_window_expired) → reserved | paid → processing → shipped …
-- 'created' is kept for orders placed before this migration.
-- ---------------------------------------------------------------------

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in (
  'created', 'order_request', 'stock_confirmation', 'awaiting_buyer_decision',
  'confirmed_awaiting_payment', 'payment_coordination_required', 'payment_window_expired',
  'reserved', 'paid', 'processing', 'shipped', 'delivered', 'canceled'
));

-- ---------------------------------------------------------------------
-- settings (key/value, editable in the Admin)
-- ---------------------------------------------------------------------

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null
);

alter table app_settings enable row level security;
drop policy if exists app_settings_staff on app_settings;
create policy app_settings_staff on app_settings for all using (is_staff()) with check (is_staff());
grant all on app_settings to service_role;

insert into app_settings (key, value) values
  ('bank_processing_fee_brl', '135'::jsonb),
  ('reserve_markup_pct', '10'::jsonb),
  ('margin_target_pct', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function get_setting_numeric(p_key text)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric end
  from app_settings where key = p_key;
$$;

-- BRL per 1 unit of `cur` from the latest fx_rates row (1 for BRL).
create or replace function latest_brl_rate(cur text)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select case
    when upper(cur) = 'BRL' then 1::numeric
    else (select rate from fx_rates where base = 'BRL' and quote = upper(cur)
          order by fetched_at desc limit 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------

create table if not exists sales_channels (
  code text primary key,
  name text not null,
  default_currency text not null,
  sort integer not null default 0
);

insert into sales_channels (code, name, default_currency, sort) values
  ('intl_b2b', 'International B2B', 'USD', 1),
  ('intl_b2c', 'International B2C', 'USD', 2),
  ('br_b2b', 'Brazil B2B', 'BRL', 3),
  ('br_b2c', 'Brazil B2C', 'BRL', 4)
on conflict (code) do nothing;

alter table sales_channels enable row level security;
drop policy if exists sales_channels_read on sales_channels;
create policy sales_channels_read on sales_channels for select using (true);
drop policy if exists sales_channels_staff on sales_channels;
create policy sales_channels_staff on sales_channels for all using (is_staff()) with check (is_staff());
grant select on sales_channels to anon, authenticated;
grant all on sales_channels to service_role;

alter table customers add column if not exists channel text references sales_channels (code);
update customers
set channel = case when customer_type = 'business' then 'intl_b2b' else 'intl_b2c' end
where channel is null;

alter table orders add column if not exists channel text references sales_channels (code);
update orders o
set channel = coalesce(c.channel, 'intl_b2c')
from customers c
where c.id = o.customer_id and o.channel is null;

create or replace function orders_default_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.channel is null then
    select channel into new.channel from customers where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_default_channel on orders;
create trigger orders_default_channel
  before insert on orders
  for each row execute function orders_default_channel();

-- ---------------------------------------------------------------------
-- payment methods + availability rules
-- ---------------------------------------------------------------------

create table if not exists payment_methods (
  code text primary key,
  name text not null,
  active boolean not null default true,
  sort integer not null default 0
);

insert into payment_methods (code, name, sort) values
  ('bank_transfer', 'Bank Transfer', 1),
  ('stripe_card', 'Card / Stripe', 2),
  ('pix', 'Pix', 3)
on conflict (code) do nothing;

create table if not exists payment_method_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('channel', 'customer', 'order')),
  channel_code text references sales_channels (code) on delete cascade,
  customer_id uuid references customers (id) on delete cascade,
  order_id uuid references orders (id) on delete cascade,
  method_code text not null references payment_methods (code) on delete cascade,
  enabled boolean not null,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  constraint payment_method_rules_scope_target check (
    (scope = 'channel' and channel_code is not null and customer_id is null and order_id is null) or
    (scope = 'customer' and customer_id is not null and channel_code is null and order_id is null) or
    (scope = 'order' and order_id is not null and channel_code is null and customer_id is null)
  )
);

create unique index if not exists payment_method_rules_channel_uq
  on payment_method_rules (channel_code, method_code) where scope = 'channel';
create unique index if not exists payment_method_rules_customer_uq
  on payment_method_rules (customer_id, method_code) where scope = 'customer';
create unique index if not exists payment_method_rules_order_uq
  on payment_method_rules (order_id, method_code) where scope = 'order';

-- Initial channel defaults (editable in Admin → Payments):
-- Bank Transfer everywhere; Stripe off for International B2B (example
-- from the spec), on elsewhere; Pix only on Brazil channels.
insert into payment_method_rules (scope, channel_code, method_code, enabled)
select 'channel', ch.code, pm.code,
  case
    when pm.code = 'bank_transfer' then true
    when pm.code = 'stripe_card' then ch.code <> 'intl_b2b'
    when pm.code = 'pix' then ch.code like 'br_%'
    else false
  end
from sales_channels ch cross join payment_methods pm
on conflict do nothing;

alter table payment_methods enable row level security;
alter table payment_method_rules enable row level security;
drop policy if exists payment_methods_read on payment_methods;
create policy payment_methods_read on payment_methods for select using (true);
drop policy if exists payment_methods_staff on payment_methods;
create policy payment_methods_staff on payment_methods for all using (is_staff()) with check (is_staff());
drop policy if exists payment_method_rules_staff on payment_method_rules;
create policy payment_method_rules_staff on payment_method_rules for all using (is_staff()) with check (is_staff());
grant select on payment_methods to anon, authenticated;
grant all on payment_methods, payment_method_rules to service_role;

-- Effective availability for an order: the most specific rule wins.
-- A method with no rule at any level is unavailable.
create or replace function available_payment_methods(p_order_id uuid)
returns table (method_code text, method_name text, enabled boolean, decided_by text)
language sql
stable
security definer set search_path = public
as $$
  with o as (
    select o.id, o.customer_id, coalesce(o.channel, c.channel) as channel
    from orders o left join customers c on c.id = o.customer_id
    where o.id = p_order_id
      and (o.customer_id = auth.uid() or is_staff() or auth.uid() is null)
  )
  select pm.code, pm.name,
    coalesce(r_order.enabled, r_cust.enabled, r_chan.enabled, false) and pm.active,
    case
      when r_order.enabled is not null then 'order'
      when r_cust.enabled is not null then 'customer'
      when r_chan.enabled is not null then 'channel'
      else 'none'
    end
  from o
  cross join payment_methods pm
  left join payment_method_rules r_order
    on r_order.scope = 'order' and r_order.order_id = o.id and r_order.method_code = pm.code
  left join payment_method_rules r_cust
    on r_cust.scope = 'customer' and r_cust.customer_id = o.customer_id and r_cust.method_code = pm.code
  left join payment_method_rules r_chan
    on r_chan.scope = 'channel' and r_chan.channel_code = o.channel and r_chan.method_code = pm.code
  order by pm.sort;
$$;

revoke execute on function available_payment_methods(uuid) from public;
grant execute on function available_payment_methods(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- cost snapshot on order lines (needed for margin by transaction)
-- ---------------------------------------------------------------------

alter table order_items
  add column if not exists unit_cost_brl numeric(12, 2),
  add column if not exists product_id uuid references products (id) on delete set null,
  add column if not exists product_title text,
  add column if not exists brand text,
  add column if not exists sku text,
  add column if not exists color text,
  add column if not exists size text;

create or replace function snapshot_order_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select
    coalesce(new.product_id, p.id),
    coalesce(new.product_title, p.title),
    coalesce(new.brand, p.brand, c.supplier_name),
    coalesce(new.sku, v.sku),
    coalesce(new.color, v.color),
    coalesce(new.size, v.size),
    coalesce(new.unit_cost_brl, p.original_price)
  into new.product_id, new.product_title, new.brand, new.sku, new.color, new.size, new.unit_cost_brl
  from variants v
  join products p on p.id = v.product_id
  left join connectors c on c.id = p.connector_id
  where v.id = new.variant_id;
  return new;
end;
$$;

drop trigger if exists order_items_snapshot on order_items;
create trigger order_items_snapshot
  before insert or update of variant_id on order_items
  for each row execute function snapshot_order_item();

update order_items set variant_id = variant_id where unit_cost_brl is null;

-- ---------------------------------------------------------------------
-- payments ledger (one row per transaction)
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists payment_mode text not null default 'standard'
    check (payment_mode in ('standard', 'reserve')),
  add column if not exists reserve_amount numeric(12, 2),
  add column if not exists reserve_pct_of_sale numeric(7, 4),
  add column if not exists reserved_at timestamptz;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  method_code text not null references payment_methods (code),
  kind text not null default 'full' check (kind in ('full', 'reserve_deposit', 'balance', 'other')),
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'confirmed', 'rejected', 'refunded', 'chargeback', 'canceled')),
  currency text not null,

  -- breakdown, all in `currency`. amount is always the sum (trigger).
  merchandise_amount numeric(12, 2) not null default 0,
  freight_amount numeric(12, 2) not null default 0,
  insurance_amount numeric(12, 2) not null default 0,
  fuel_surcharge_amount numeric(12, 2) not null default 0,
  demand_surcharge_amount numeric(12, 2) not null default 0,
  export_declaration_amount numeric(12, 2) not null default 0,
  other_dhl_amount numeric(12, 2) not null default 0,
  duties_taxes_amount numeric(12, 2) not null default 0,
  bank_fee_amount numeric(12, 2) not null default 0,
  other_charges_amount numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,

  bank_fee_brl numeric(12, 2),            -- Admin config at creation
  received_amount numeric(12, 2),         -- what actually landed (Payment Difference when ≠ amount)
  fx_rate_brl numeric(14, 6),             -- BRL per 1 `currency` at confirmation (dashboard only)
  cogs_recognized_brl numeric(12, 2) not null default 0, -- product cost recognised by THIS payment

  external_ref text,
  proof_url text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_confirmed_at_idx on payments (confirmed_at) where status = 'confirmed';

create or replace function payments_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  fee_brl numeric;
  rate numeric;
  cost numeric;
begin
  -- Bank Processing Fee: one per Bank Transfer payment, BRL config
  -- converted to the payment currency. Snapshotted on insert only.
  if tg_op = 'INSERT' and new.method_code = 'bank_transfer' and new.bank_fee_brl is null then
    fee_brl := coalesce(get_setting_numeric('bank_processing_fee_brl'), 0);
    rate := latest_brl_rate(new.currency);
    if fee_brl > 0 and (rate is null or rate <= 0) then
      raise exception 'FX_RATE_MISSING: cannot convert the Bank Processing Fee to %', new.currency;
    end if;
    new.bank_fee_brl := fee_brl;
    new.bank_fee_amount := case when fee_brl > 0 then round(fee_brl / rate, 2) else 0 end;
  end if;

  new.amount := new.merchandise_amount + new.freight_amount + new.insurance_amount
    + new.fuel_surcharge_amount + new.demand_surcharge_amount + new.export_declaration_amount
    + new.other_dhl_amount + new.duties_taxes_amount + new.bank_fee_amount + new.other_charges_amount;

  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.fx_rate_brl := coalesce(new.fx_rate_brl, latest_brl_rate(new.currency));
    new.received_amount := coalesce(new.received_amount, new.amount);

    -- Margin: the FIRST confirmed payment that carries merchandise
    -- recognises 100% of the order's product cost; later payments (e.g.
    -- Reserve balance) recognise revenue only.
    if new.merchandise_amount > 0 and not exists (
      select 1 from payments p
      where p.order_id = new.order_id and p.status = 'confirmed'
        and p.cogs_recognized_brl > 0 and p.id <> new.id
    ) then
      select coalesce(sum(oi.qty * coalesce(oi.unit_cost_brl, 0)), 0) into cost
      from order_items oi
      where oi.order_id = new.order_id
        and coalesce(oi.item_status, 'available') not in ('unavailable_out_of_stock', 'unavailable_order_only', 'removed');
      new.cogs_recognized_brl := cost;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- order_items.item_status drives Order Request confirmation (checked
-- constraint + lost-sales trigger live in 0026).
alter table order_items add column if not exists item_status text not null default 'requested';

drop trigger if exists payments_before_write on payments;
create trigger payments_before_write
  before insert or update on payments
  for each row execute function payments_before_write();

-- Reserve: goods are only reserved once the deposit is CONFIRMED.
create or replace function payments_after_confirm()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  paid numeric;
  due numeric;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return new;
  end if;

  if new.kind = 'reserve_deposit' then
    update orders set reserved_at = coalesce(reserved_at, new.confirmed_at), status = 'reserved'
    where id = new.order_id and status not in ('paid', 'processing', 'shipped', 'delivered');
  else
    select coalesce(sum(merchandise_amount), 0) into paid
    from payments where order_id = new.order_id and status = 'confirmed';
    select subtotal into due from orders where id = new.order_id;
    if paid >= coalesce(due, 0) then
      update orders set status = 'paid'
      where id = new.order_id and status not in ('paid', 'processing', 'shipped', 'delivered');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_after_confirm on payments;
create trigger payments_after_confirm
  after insert or update of status on payments
  for each row execute function payments_after_confirm();

alter table payments enable row level security;
drop policy if exists payments_owner_read on payments;
create policy payments_owner_read on payments for select using (
  is_staff() or exists (select 1 from orders o where o.id = payments.order_id and o.customer_id = auth.uid())
);
drop policy if exists payments_staff_write on payments;
create policy payments_staff_write on payments for all using (is_staff()) with check (is_staff());
grant select on payments to authenticated;
grant all on payments to service_role;
