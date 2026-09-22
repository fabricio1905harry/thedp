-- ---------------------------------------------------------------------
-- Orders, Order Items, Shipments & Addresses RLS & Schema Polish
-- ---------------------------------------------------------------------

alter table orders add column if not exists shipping_address jsonb;
alter table orders add column if not exists order_number text;
alter table shipments add column if not exists invoice_url text;

-- RLS Enable & Policies
alter table orders enable row level security;
alter table order_items enable row level security;
alter table shipments enable row level security;

-- Customers can view their own orders
drop policy if exists orders_customer_read on orders;
create policy orders_customer_read on orders
  for select using (auth.uid() = customer_id);

drop policy if exists orders_customer_insert on orders;
create policy orders_customer_insert on orders
  for insert with check (auth.uid() = customer_id);

-- Customers can view their own order items
drop policy if exists order_items_customer_read on order_items;
create policy order_items_customer_read on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.uid()
    )
  );

-- Customers can view their own shipments
drop policy if exists shipments_customer_read on shipments;
create policy shipments_customer_read on shipments
  for select using (
    exists (
      select 1 from orders o
      where o.id = shipments.order_id
        and o.customer_id = auth.uid()
    )
  );

-- Grant privileges for service_role and authenticated users
grant all on orders to service_role, authenticated;
grant all on order_items to service_role, authenticated;
grant all on shipments to service_role, authenticated;
