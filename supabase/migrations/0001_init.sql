-- thedress — initial schema (PRD section 5)
-- Apply with mcp__plugin_supabase_supabase__apply_migration once the
-- Supabase project exists (blocked — see task #2).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- customers / addresses
-- ---------------------------------------------------------------------

create table customers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  locale text not null default 'pt',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role text not null default 'customer' check (role in ('customer', 'operator', 'admin')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  country text not null,
  state text,
  city text,
  line1 text not null,
  line2 text,
  postal_code text,
  phone text,
  created_at timestamptz not null default now()
);

-- AUTH-01: a new auth.users row always gets a matching pending customer row.
create function handle_new_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.customers (id, email, name, locale)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'pt')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_customer();

-- AUTH-05: notify the customer's row when an operator flips status to
-- approved so an edge function / webhook can send the email.
create function set_approved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at = now();
  end if;
  return new;
end;
$$;

create trigger customers_set_approved_at
  before update on customers
  for each row execute function set_approved_at();

-- ---------------------------------------------------------------------
-- catalog
-- ---------------------------------------------------------------------

create table products (
  id uuid primary key default gen_random_uuid(),
  source_id text,
  source_url text,
  slug text unique not null,
  title text not null,
  title_en text,
  title_es text,
  description text,
  category text,
  hs_code text,
  base_price numeric(12, 2) not null default 0,
  markup numeric(6, 4) not null default 0,
  final_price numeric(12, 2) not null default 0,
  currency text not null default 'BRL',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  weight_g integer,
  dims_cm jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  color text,
  size_br text,
  size_us text,
  size_eu text,
  sku text unique not null,
  stock integer not null default 0,
  price_delta numeric(12, 2) not null default 0
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  storage_path text not null,
  hash text not null,
  position integer not null default 0
);

create index product_images_hash_idx on product_images (hash);

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  status text not null default 'created'
    check (status in ('created', 'paid', 'processing', 'shipped', 'delivered', 'canceled')),
  currency text not null default 'USD',
  subtotal numeric(12, 2) not null,
  shipping_cost numeric(12, 2) not null default 0,
  duties_estimate numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  incoterm text check (incoterm in ('DDP', 'DDU')),
  quote_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  variant_id uuid not null references variants (id),
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  dhl_tracking text,
  label_url text,
  status text,
  updated_at timestamptz not null default now()
);

create table dhl_quote_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  payload jsonb not null,
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------------
-- automation / ops
-- ---------------------------------------------------------------------

create table connectors (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  status text not null default 'not_built' check (status in ('active', 'pending', 'not_built')),
  included_in_contract boolean not null default true
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid references connectors (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created integer not null default 0,
  updated integer not null default 0,
  failed integer not null default 0,
  error_log jsonb
);

create table api_usage (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text,
  calls integer not null default 0,
  month date not null,
  estimated_cost numeric(12, 2) not null default 0
);

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null,
  quote text not null,
  rate numeric(14, 6) not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- helper: is the current user staff (operator/admin)?
-- ---------------------------------------------------------------------

create function is_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from customers
    where id = auth.uid() and role in ('operator', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------

alter table customers enable row level security;
alter table addresses enable row level security;
alter table products enable row level security;
alter table variants enable row level security;
alter table product_images enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table shipments enable row level security;
alter table dhl_quote_cache enable row level security;
alter table connectors enable row level security;
alter table sync_runs enable row level security;
alter table api_usage enable row level security;
alter table fx_rates enable row level security;

-- customers: self read/update; staff read/update all
create policy customers_select_self on customers
  for select using (id = auth.uid() or is_staff());
create policy customers_update_self on customers
  for update using (id = auth.uid()) with check (id = auth.uid() and role = 'customer');
create policy customers_staff_manage on customers
  for update using (is_staff());

-- addresses: owner only, staff read
create policy addresses_owner on addresses
  for all using (customer_id = auth.uid() or is_staff())
  with check (customer_id = auth.uid());

-- products/variants/product_images: no direct price exposure to anon —
-- public reads go through the products_public view below. Staff manage
-- the base tables directly.
create policy products_staff_all on products for all using (is_staff());
create policy variants_staff_all on variants for all using (is_staff());
create policy product_images_staff_all on product_images for all using (is_staff());

-- orders/order_items: owner + staff
create policy orders_owner on orders
  for select using (customer_id = auth.uid() or is_staff());
create policy orders_staff_write on orders
  for insert with check (is_staff() or customer_id = auth.uid());
create policy orders_staff_update on orders
  for update using (is_staff());

create policy order_items_owner on order_items
  for select using (
    exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff()))
  );

create policy shipments_owner on shipments
  for select using (
    exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or is_staff()))
  );
create policy shipments_staff_write on shipments for all using (is_staff());

-- internal/ops tables: staff only
create policy dhl_cache_staff on dhl_quote_cache for all using (is_staff());
create policy connectors_staff on connectors for all using (is_staff());
create policy sync_runs_staff on sync_runs for all using (is_staff());
create policy api_usage_staff on api_usage for all using (is_staff());
create policy fx_rates_read_all on fx_rates for select using (true);
create policy fx_rates_staff_write on fx_rates for insert with check (is_staff());

-- ---------------------------------------------------------------------
-- public catalog view (AUTH-02: no price, no auth required)
-- ---------------------------------------------------------------------

create view products_public
  with (security_invoker = true)
  as
  select id, slug, title, title_en, title_es, category, status, created_at
  from products
  where status = 'published';

grant select on products_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- priced catalog function (AUTH-04: price only for approved customers)
-- ---------------------------------------------------------------------

create function get_priced_product(product_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  final_price numeric,
  currency text
)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.slug, p.title, p.final_price, p.currency
  from products p
  where p.slug = product_slug
    and p.status = 'published'
    and exists (
      select 1 from customers c
      where c.id = auth.uid() and c.status = 'approved'
    );
$$;

grant execute on function get_priced_product(text) to authenticated;

-- seed connectors (CAT-06/07: multi-supplier, 5 included in contract)
insert into connectors (supplier_name, status, included_in_contract) values
  ('fornecedor_1', 'pending', true),
  ('fornecedor_2', 'pending', true),
  ('fornecedor_3', 'pending', true),
  ('fornecedor_4', 'pending', true),
  ('fornecedor_5', 'pending', true);
