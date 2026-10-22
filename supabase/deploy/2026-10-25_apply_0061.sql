-- ---------------------------------------------------------------------
-- 0061: Minimum order rules + Volume Pricing (both OFF at launch).
--
-- * order_minimum_rules — per operation (sales channel), category, brand or
--   product; type = minimum AMOUNT or minimum UNITS; each rule has its own
--   active switch (launch default: no rule exists / everything OFF).
-- * volume_pricing_tiers — quantity range → % discount, per operation and
--   optionally per category. Applied only when app_settings.volume_pricing
--   .enabled = true (OFF at launch).
-- * Action Center: new type volume_price_below_margin
--   (VOLUME PRICE BELOW TARGET MARGIN), raised by the Admin screen.
-- Rerun-safe.
-- ---------------------------------------------------------------------

create table if not exists order_minimum_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- operation = sales channel code; null = every operation
  operation text references sales_channels (code) on delete cascade,
  scope text not null check (scope in ('operation', 'category', 'brand', 'product')),
  -- category / brand name, or product id (uuid as text); null when scope = 'operation'
  scope_value text,
  min_type text not null check (min_type in ('amount', 'units')),
  min_value numeric(12, 2) not null check (min_value > 0),
  -- currency of a minimum AMOUNT (converted with the latest FX for other cart currencies)
  currency text not null default 'USD' check (currency in ('BRL', 'USD', 'EUR')),
  active boolean not null default false,
  -- optional display names of the scope for the buyer message: {"en": "Dresses", "es": "Vestidos", "pt": "Vestidos"}
  labels jsonb not null default '{}'::jsonb,
  -- optional custom message per language; {missing} is replaced by the missing amount/units
  message jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  constraint order_minimum_rules_scope_value check (scope = 'operation' or scope_value is not null)
);

alter table order_minimum_rules enable row level security;
drop policy if exists order_minimum_rules_staff on order_minimum_rules;
create policy order_minimum_rules_staff on order_minimum_rules for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on order_minimum_rules to authenticated;
grant all on order_minimum_rules to service_role;

create table if not exists volume_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  operation text references sales_channels (code) on delete cascade, -- null = every operation
  category text,                                                      -- null = whole cart
  min_qty integer not null check (min_qty >= 1),
  max_qty integer check (max_qty is null or max_qty >= min_qty),      -- null = no upper limit
  discount_pct numeric(5, 2) not null check (discount_pct > 0 and discount_pct <= 90),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null
);

create index if not exists volume_pricing_tiers_scope_idx on volume_pricing_tiers (operation, category);

alter table volume_pricing_tiers enable row level security;
drop policy if exists volume_pricing_tiers_staff on volume_pricing_tiers;
create policy volume_pricing_tiers_staff on volume_pricing_tiers for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on volume_pricing_tiers to authenticated;
grant all on volume_pricing_tiers to service_role;

-- master switch: OFF at launch
insert into app_settings (key, value) values ('volume_pricing', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('volume_price_below_margin', 'VOLUME PRICE BELOW TARGET MARGIN', 5, 'normal', '/admin/volume-pricing', false, 54)
on conflict (code) do nothing;
