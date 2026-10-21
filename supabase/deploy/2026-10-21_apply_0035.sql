-- 0035: Pricing engine from the "Tabela de preço - TDP EXP" spreadsheet.
--
--   custo total  = custo da peça (original_price) + custos fixos por peça
--                  + custo extra do produto (extra_cost_brl)
--   PV R$        = custo total / (1 - (margem + comissão + ICMS + PIS/COFINS + taxa cartão))
--                  × (1 + ajuste % do produto)
--   PV USD/EUR   = PV R$ / câmbio, arredondado PARA CIMA até o próximo valor terminado em 9
--   Retail       = PV USD/EUR × (1 + frete internacional % + impostos locais %) × markup varejo
--
-- Rules live in pricing_rules (one row, edited in Admin → Precificação).
-- Prices are recalculated automatically when a product is inserted or its
-- cost changes (n8n / ingest only needs to send the piece cost), when the
-- rules change and, in automatic FX mode, when a new exchange rate arrives.
-- Safe to re-run.

create table if not exists pricing_rules (
  id smallint primary key default 1 check (id = 1),
  fixed_costs jsonb not null default '[
    {"label": "Etiqueta de composição", "amount": 0},
    {"label": "Etiqueta da marca", "amount": 0.85},
    {"label": "Lacre", "amount": 0.3},
    {"label": "Tag", "amount": 1.8},
    {"label": "Saco plástico", "amount": 0.5},
    {"label": "Mão de obra etiquetas", "amount": 20},
    {"label": "Frete inbound", "amount": 0},
    {"label": "Alça de sustentação", "amount": 0.1}
  ]'::jsonb,
  margin_pct numeric(6, 2) not null default 50,
  commission_pct numeric(6, 2) not null default 10,
  icms_pct numeric(6, 2) not null default 0,
  pis_cofins_pct numeric(6, 2) not null default 0,
  card_fee_pct numeric(6, 2) not null default 0,
  fx_mode text not null default 'manual' check (fx_mode in ('manual', 'auto')),
  usd_rate numeric(10, 4) not null default 5.14,
  eur_rate numeric(10, 4) not null default 6.04,
  rounding text not null default 'up_to_9' check (rounding in ('up_to_9', 'up_to_integer', 'none')),
  intl_freight_pct numeric(6, 2) not null default 15,
  local_taxes_pct numeric(6, 2) not null default 25,
  retail_markup numeric(6, 2) not null default 2.5,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null
);
insert into pricing_rules (id) values (1) on conflict (id) do nothing;

alter table pricing_rules enable row level security;
drop policy if exists pricing_rules_staff on pricing_rules;
create policy pricing_rules_staff on pricing_rules for all using (is_staff()) with check (is_staff());
grant all on pricing_rules to service_role;

-- per-product adjustments (bulk-editable in the Admin)
alter table products
  add column if not exists extra_cost_brl numeric(12, 2) not null default 0,
  add column if not exists margin_pct_override numeric(6, 2),
  add column if not exists commission_pct_override numeric(6, 2),
  add column if not exists price_adjust_pct numeric(6, 2) not null default 0,
  add column if not exists retail_usd numeric(12, 2),
  add column if not exists retail_eur numeric(12, 2),
  add column if not exists priced_at timestamptz;

create or replace function price_round(x numeric, mode text)
returns numeric
language sql
immutable
as $$
  select case
    when x is null then null
    when x <= 0 then 0
    when mode = 'up_to_9' then ceil(x / 10) * 10 - 1
    when mode = 'up_to_integer' then ceil(x)
    else round(x, 2)
  end;
$$;

create or replace function tdp_compute_price(
  p_cost numeric,
  p_extra numeric,
  p_margin numeric,
  p_commission numeric,
  p_adjust numeric
)
returns table (price_brl numeric, price_usd numeric, price_eur numeric, retail_usd numeric, retail_eur numeric)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  r pricing_rules;
  fixed numeric;
  pct numeric;
  brl numeric;
  usd_rate numeric;
  eur_rate numeric;
  usd numeric;
  eur numeric;
  retail_factor numeric;
begin
  select * into r from pricing_rules where id = 1;
  if r is null or p_cost is null or p_cost <= 0 then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  select coalesce(sum(nullif(e ->> 'amount', '')::numeric), 0) into fixed
  from jsonb_array_elements(r.fixed_costs) e;

  pct := (coalesce(p_margin, r.margin_pct) + coalesce(p_commission, r.commission_pct)
          + r.icms_pct + r.pis_cofins_pct + r.card_fee_pct) / 100;
  pct := least(greatest(pct, 0), 0.95);

  brl := (p_cost + fixed + coalesce(p_extra, 0)) / (1 - pct) * (1 + coalesce(p_adjust, 0) / 100);

  if r.fx_mode = 'auto' then
    select f.rate into usd_rate from fx_rates f where f.base = 'BRL' and f.quote = 'USD' order by f.fetched_at desc limit 1;
    select f.rate into eur_rate from fx_rates f where f.base = 'BRL' and f.quote = 'EUR' order by f.fetched_at desc limit 1;
  end if;
  usd_rate := coalesce(nullif(usd_rate, 0), r.usd_rate);
  eur_rate := coalesce(nullif(eur_rate, 0), r.eur_rate);

  usd := case when usd_rate > 0 then price_round(brl / usd_rate, r.rounding) end;
  eur := case when eur_rate > 0 then price_round(brl / eur_rate, r.rounding) end;
  retail_factor := (1 + (r.intl_freight_pct + r.local_taxes_pct) / 100) * r.retail_markup;

  return query select
    round(brl, 2),
    usd,
    eur,
    round(usd * retail_factor, 2),
    round(eur * retail_factor, 2);
end;
$$;

create or replace function compute_product_prices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
begin
  select * into c from tdp_compute_price(
    new.original_price, new.extra_cost_brl, new.margin_pct_override,
    new.commission_pct_override, new.price_adjust_pct
  );
  new.price_brl := c.price_brl;
  new.price_usd := c.price_usd;
  new.price_eur := c.price_eur;
  new.retail_usd := c.retail_usd;
  new.retail_eur := c.retail_eur;
  new.priced_at := now();
  return new;
end;
$$;

drop trigger if exists products_compute_prices on products;
create trigger products_compute_prices
  before insert or update of original_price, extra_cost_brl, margin_pct_override,
    commission_pct_override, price_adjust_pct, price_brl
  on products
  for each row execute function compute_product_prices();

-- recalculates every product (touching price_brl re-fires the trigger above)
create or replace function recompute_all_product_prices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  update products set price_brl = price_brl;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function recompute_all_product_prices() from public;
grant execute on function recompute_all_product_prices() to authenticated, service_role;

create or replace function pricing_rules_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform recompute_all_product_prices();
  return null;
end;
$$;

drop trigger if exists pricing_rules_recompute on pricing_rules;
create trigger pricing_rules_recompute
  after update on pricing_rules
  for each row execute function pricing_rules_changed();

-- new exchange rate: only matters in automatic FX mode
create or replace function recompute_products_fx()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from pricing_rules where id = 1 and fx_mode = 'auto') then
    perform recompute_all_product_prices();
  end if;
  return new;
end;
$$;

-- apply the new rule to the existing catalogue
select recompute_all_product_prices();
