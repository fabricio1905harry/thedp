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
