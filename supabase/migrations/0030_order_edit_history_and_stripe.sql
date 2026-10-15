-- ---------------------------------------------------------------------
-- 0030: Editing an order without losing the original request, order
--       change history, and Stripe card payments.
--
-- * order_items.original_qty / original_unit_price — frozen when the line
--   is created by the buyer. Lines added by the TDP have no original.
-- * orders.original_subtotal — merchandise total of the buyer's request.
-- * order_events — who changed what and when (qty, price, status,
--   substitutions, freight/duties, payments…).
-- * Reverting an OUT OF STOCK line removes its Lost Sale if it is still
--   untouched ('lost'); contacted/recovered history is never deleted.
-- * payments: one row per Stripe/external reference (webhook idempotency).
-- * bank transfer instructions shown to the buyer (Admin → Pagamentos).
-- ---------------------------------------------------------------------

alter table order_items
  add column if not exists original_qty integer,
  add column if not exists original_unit_price numeric(12, 2);

update order_items
set original_qty = qty,
    original_unit_price = unit_price
where original_qty is null
  and not added_by_tdp;

create or replace function order_items_freeze_original()
returns trigger
language plpgsql
as $$
begin
  if not coalesce(new.added_by_tdp, false) then
    new.original_qty := coalesce(new.original_qty, new.qty);
    new.original_unit_price := coalesce(new.original_unit_price, new.unit_price);
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_freeze_original on order_items;
create trigger order_items_freeze_original
  before insert on order_items
  for each row execute function order_items_freeze_original();

alter table orders add column if not exists original_subtotal numeric(12, 2);

update orders o
set original_subtotal = coalesce(
  (select sum(oi.original_qty * oi.original_unit_price)
   from order_items oi
   where oi.order_id = o.id and oi.original_qty is not null),
  o.subtotal)
where original_subtotal is null;

create or replace function orders_freeze_original()
returns trigger
language plpgsql
as $$
begin
  new.original_subtotal := coalesce(new.original_subtotal, new.subtotal);
  return new;
end;
$$;

drop trigger if exists orders_freeze_original on orders;
create trigger orders_freeze_original
  before insert on orders
  for each row execute function orders_freeze_original();

-- ---------------------------------------------------------------------
-- change history
-- ---------------------------------------------------------------------

create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  event_type text not null,
  summary text not null,
  details jsonb,
  actor_id uuid references customers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, created_at desc);

alter table order_events enable row level security;
drop policy if exists order_events_staff on order_events;
create policy order_events_staff on order_events for all using (is_staff()) with check (is_staff());
grant all on order_events to service_role;

-- ---------------------------------------------------------------------
-- OUT OF STOCK can be undone (mistaken click) while the lost sale is still
-- untouched. Supplier stock set to 0 is NOT restored automatically (the real
-- number is unknown) — the next sync or a manual stock override fixes it.
-- ---------------------------------------------------------------------

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

    update variants set source_stock = 0 where id = new.variant_id;
  elsif tg_op = 'UPDATE'
        and old.item_status = 'unavailable_out_of_stock'
        and new.item_status is distinct from 'unavailable_out_of_stock' then
    delete from lost_sales where order_item_id = new.id and status = 'lost';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- payments: idempotency for webhooks / external references
-- ---------------------------------------------------------------------

create unique index if not exists payments_method_external_ref_uq
  on payments (method_code, external_ref)
  where external_ref is not null;

insert into app_settings (key, value) values
  ('bank_transfer_instructions', '""'::jsonb)
on conflict (key) do nothing;
