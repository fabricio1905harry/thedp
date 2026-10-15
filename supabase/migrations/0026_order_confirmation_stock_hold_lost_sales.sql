-- ---------------------------------------------------------------------
-- 0026: Order Request confirmation, Temporary Stock Hold, Lost Sales and
--       Restock Opportunities.
--
-- * order_items.item_status — per-line availability decided by the TDP
--   while confirming an Order Request. Lines can be added, removed,
--   substituted (substitutes_item_id) or re-quantified before the
--   Confirmed Order is generated.
--     UNAVAILABLE — OUT OF STOCK  → variant becomes unavailable in the
--       catalog (source_stock := 0) + LOST SALE recorded.
--     UNAVAILABLE — ORDER ONLY / OTHER REASON → affects this order only.
-- * Temporary Stock Hold (≠ Reserve Order): 24h / 48h / custom /
--   cannot_reserve, counted from when the Confirmed Order is released for
--   payment. expire_unpaid_orders() is run by the cron route.
-- * Restock: when a sync brings source_stock of a variant with LOST
--   history back above zero, its lost sales become RESTOCK OPPORTUNITY
--   (history is never deleted).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- order lines
-- ---------------------------------------------------------------------

alter table order_items drop constraint if exists order_items_item_status_check;
alter table order_items add constraint order_items_item_status_check check (item_status in (
  'requested', 'available', 'unavailable_out_of_stock', 'unavailable_order_only', 'removed'
));

alter table order_items
  add column if not exists unavailable_note text,
  add column if not exists substitutes_item_id uuid references order_items (id) on delete set null,
  add column if not exists added_by_tdp boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- orders: confirmation + temporary stock hold
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists stock_hold_type text
    check (stock_hold_type in ('24h', '48h', 'custom', 'cannot_reserve')),
  add column if not exists stock_hold_until timestamptz,
  add column if not exists payment_released_at timestamptz,
  add column if not exists payment_window_expired_at timestamptz;

-- Confirmed Order → released for payment with the chosen stock hold.
-- Re-callable after expiry/coordination: the TDP reconfirms stock and
-- recalculates values in the app first, then calls this again.
create or replace function release_order_for_payment(
  p_order_id uuid,
  p_hold_type text,
  p_custom_until timestamptz default null
)
returns orders
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if not is_staff() and auth.uid() is not null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_hold_type not in ('24h', '48h', 'custom', 'cannot_reserve') then
    raise exception 'INVALID_HOLD_TYPE: %', p_hold_type;
  end if;
  if p_hold_type = 'custom' and (p_custom_until is null or p_custom_until <= now()) then
    raise exception 'CUSTOM_HOLD_NEEDS_FUTURE_DATE';
  end if;

  update orders set
    confirmed_at = coalesce(confirmed_at, now()),
    stock_hold_type = p_hold_type,
    payment_released_at = case when p_hold_type = 'cannot_reserve' then null else now() end,
    stock_hold_until = case p_hold_type
      when '24h' then now() + interval '24 hours'
      when '48h' then now() + interval '48 hours'
      when 'custom' then p_custom_until
      else null end,
    payment_window_expired_at = null,
    status = case when p_hold_type = 'cannot_reserve'
      then 'payment_coordination_required' else 'confirmed_awaiting_payment' end
  where id = p_order_id
    and status not in ('reserved', 'paid', 'processing', 'shipped', 'delivered', 'canceled')
  returning * into o;

  if o.id is null then
    raise exception 'ORDER_NOT_RELEASABLE';
  end if;
  return o;
end;
$$;

revoke execute on function release_order_for_payment(uuid, text, timestamptz) from public;
grant execute on function release_order_for_payment(uuid, text, timestamptz) to authenticated, service_role;

-- Buyer-facing: is payment open right now?
create or replace function order_payment_open(o orders)
returns boolean
language sql
stable
as $$
  select o.status = 'confirmed_awaiting_payment'
     and o.payment_released_at is not null
     and (o.stock_hold_until is null or o.stock_hold_until > now());
$$;

-- transactional e-mail queue (sent by a worker once an e-mail provider is
-- configured — nothing sends from the database itself)
create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  locale text not null default 'en',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table email_outbox enable row level security;
drop policy if exists email_outbox_staff on email_outbox;
create policy email_outbox_staff on email_outbox for all using (is_staff()) with check (is_staff());
grant all on email_outbox to service_role;

-- Expire unpaid hold windows: status PAYMENT WINDOW EXPIRED, payment off,
-- stock no longer held, order kept, buyer e-mail queued. The Action
-- Center item is raised by the orders trigger in 0027.
create or replace function expire_unpaid_orders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  with expired as (
    update orders o set
      status = 'payment_window_expired',
      payment_window_expired_at = now(),
      payment_released_at = null
    where o.status = 'confirmed_awaiting_payment'
      and o.stock_hold_until is not null
      and o.stock_hold_until <= now()
      and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'confirmed')
    returning o.id, o.order_number, o.customer_id
  ), mails as (
    insert into email_outbox (to_email, template, locale, payload)
    select c.email, 'payment_window_expired', c.locale,
           jsonb_build_object('order_id', e.id, 'order_number', e.order_number)
    from expired e join customers c on c.id = e.customer_id
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;

revoke execute on function expire_unpaid_orders() from public;
grant execute on function expire_unpaid_orders() to service_role;

-- ---------------------------------------------------------------------
-- Lost sales
-- ---------------------------------------------------------------------

create table if not exists lost_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  order_item_id uuid unique references order_items (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  variant_id uuid references variants (id) on delete set null,
  product_code text,
  product_title text,
  brand text,
  color text,
  size text,
  quantity integer not null,
  unit_price numeric(12, 2) not null default 0,
  potential_value numeric(12, 2) not null default 0,
  currency text not null,
  channel text references sales_channels (code),
  status text not null default 'lost'
    check (status in ('lost', 'restock_opportunity', 'contacted', 'recovered', 'not_recovered')),
  restocked_at timestamptz,
  contacted_at timestamptz,
  closed_at timestamptz,
  recovered_order_id uuid references orders (id) on delete set null,
  recovered_units integer not null default 0,
  recovered_revenue numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lost_sales_variant_idx on lost_sales (variant_id, status);
create index if not exists lost_sales_created_idx on lost_sales (created_at);

alter table lost_sales enable row level security;
drop policy if exists lost_sales_staff on lost_sales;
create policy lost_sales_staff on lost_sales for all using (is_staff()) with check (is_staff());
grant all on lost_sales to service_role;

create or replace function order_items_after_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if new.item_status = 'unavailable_out_of_stock'
     and (tg_op = 'INSERT' or old.item_status is distinct from 'unavailable_out_of_stock') then
    select * into o from orders where id = new.order_id;

    insert into lost_sales (
      order_id, order_item_id, customer_id, product_id, variant_id, product_code, product_title,
      brand, color, size, quantity, unit_price, potential_value, currency, channel
    ) values (
      new.order_id, new.id, o.customer_id, new.product_id, new.variant_id, new.sku, new.product_title,
      new.brand, new.color, new.size, new.qty, new.unit_price, round(new.qty * new.unit_price, 2),
      o.currency, o.channel
    )
    on conflict (order_item_id) do nothing;

    -- confirmed out of stock at the supplier → unavailable in the catalog
    -- too. Written to source_stock (not to the manual override) so the
    -- next sync that reports stock again re-opens it and flags a restock.
    update variants set source_stock = 0 where id = new.variant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_after_status on order_items;
create trigger order_items_after_status
  after insert or update of item_status on order_items
  for each row execute function order_items_after_status();

-- Restock detection on supplier stock coming back.
create or replace function variants_detect_restock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(old.source_stock, 0) <= 0 and coalesce(new.source_stock, 0) > 0 then
    update lost_sales
    set status = 'restock_opportunity', restocked_at = now()
    where variant_id = new.id and status = 'lost';
  end if;
  return new;
end;
$$;

drop trigger if exists variants_detect_restock on variants;
create trigger variants_detect_restock
  after update on variants
  for each row execute function variants_detect_restock();
