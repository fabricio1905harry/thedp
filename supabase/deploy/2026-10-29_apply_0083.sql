-- ---------------------------------------------------------------------
-- 0083: homologation report 24/10 — pricing (C2, P20) and margin panel
--
-- * products.manual_price_usd / manual_price_eur — fixed sale price per
--   currency: it does not move with the exchange rate or the cost.
-- * pricing_rules.recalc_on_cost_change (default OFF, PDF p. 48): a supplier
--   cost change no longer rewrites the sale price; the margin alert fires
--   instead. Rule / FX / margin / adjust changes and the explicit
--   "recalculate" actions still recompute (they set tdp.force_recalc).
-- * category_pricing — margin per category (product override wins, then the
--   category, then the global rule). One margin target for everything: the
--   desired margin IS the alert target (the old margin_target_pct setting is
--   retired).
-- * margin alert per currency (USD / EUR) using the margin definition of the
--   pricing formula; tdp_product_margin() also feeds the product margin panel.
-- * Payment Cost 6% + Sales Commission 4% (PDF) instead of 0% + 10% (same
--   total) — only while the old defaults are untouched.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

alter table products
  add column if not exists manual_price_usd numeric(12, 2),
  add column if not exists manual_price_eur numeric(12, 2);

alter table pricing_rules
  add column if not exists recalc_on_cost_change boolean not null default false;

update pricing_rules set card_fee_pct = 6, commission_pct = 4
 where id = 1 and card_fee_pct = 0 and commission_pct = 10;

create table if not exists category_pricing (
  category text primary key,
  margin_pct numeric(6, 2) check (margin_pct is null or (margin_pct >= 0 and margin_pct < 95)),
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null
);
alter table category_pricing enable row level security;
drop policy if exists category_pricing_staff on category_pricing;
create policy category_pricing_staff on category_pricing for all using (is_staff()) with check (is_staff());
grant all on category_pricing to authenticated, service_role;

-- ------------------------------------------------------------ pricing trigger
create or replace function compute_product_prices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  c record;
  r pricing_rules;
  cat_margin numeric;
  factor numeric;
begin
  select * into r from pricing_rules where id = 1;

  -- PDF p. 48: a cost change alone does not reprice (unless the rule says so or a recalculation was requested)
  if tg_op = 'UPDATE'
     and old.price_usd is not null
     and new.original_price is distinct from old.original_price
     and new.extra_cost_brl is not distinct from old.extra_cost_brl
     and new.margin_pct_override is not distinct from old.margin_pct_override
     and new.commission_pct_override is not distinct from old.commission_pct_override
     and new.price_adjust_pct is not distinct from old.price_adjust_pct
     and new.category is not distinct from old.category
     and new.manual_price_usd is not distinct from old.manual_price_usd
     and new.manual_price_eur is not distinct from old.manual_price_eur
     and coalesce(r.recalc_on_cost_change, false) = false
     and coalesce(current_setting('tdp.force_recalc', true), '') <> 'on' then
    return new;
  end if;

  select cp.margin_pct into cat_margin from category_pricing cp where cp.category = new.category;

  select * into c from tdp_compute_price(
    new.original_price, new.extra_cost_brl, coalesce(new.margin_pct_override, cat_margin),
    new.commission_pct_override, new.price_adjust_pct
  );
  new.price_brl := c.price_brl;
  new.price_usd := c.price_usd;
  new.price_eur := c.price_eur;
  new.retail_usd := c.retail_usd;
  new.retail_eur := c.retail_eur;

  -- fixed price per currency: does not move with FX or cost
  factor := (1 + (r.intl_freight_pct + r.local_taxes_pct) / 100) * r.retail_markup;
  if new.manual_price_usd is not null and new.manual_price_usd > 0 then
    new.price_usd := new.manual_price_usd;
    new.retail_usd := round(new.manual_price_usd * factor, 2);
  end if;
  if new.manual_price_eur is not null and new.manual_price_eur > 0 then
    new.price_eur := new.manual_price_eur;
    new.retail_eur := round(new.manual_price_eur * factor, 2);
  end if;
  new.priced_at := now();
  return new;
end;
$$;

drop trigger if exists products_compute_prices on products;
create trigger products_compute_prices
  before insert or update of original_price, extra_cost_brl, margin_pct_override,
    commission_pct_override, price_adjust_pct, price_brl, category, manual_price_usd, manual_price_eur
  on products
  for each row execute function compute_product_prices();

create or replace function recompute_all_product_prices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('tdp.force_recalc', 'on', true);
  update products set price_brl = price_brl where true;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function recompute_all_product_prices() from public;
grant execute on function recompute_all_product_prices() to authenticated, service_role;

-- explicit recalculation of some products (bulk "adjust cost" / "recalculate selected")
create or replace function recompute_product_prices(p_ids uuid[])
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  if not is_staff() and current_user not in ('postgres', 'service_role') then
    raise exception 'FORBIDDEN';
  end if;
  perform set_config('tdp.force_recalc', 'on', true);
  update products set price_brl = price_brl where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function recompute_product_prices(uuid[]) from public;
grant execute on function recompute_product_prices(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------- margin per product
create or replace function tdp_product_margin(p_product uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p products;
  r pricing_rules;
  fixed numeric;
  cost numeric;
  other_pct numeric;
  target numeric;
  cat_margin numeric;
  usd_rate numeric;
  eur_rate numeric;
  m_usd numeric;
  m_eur numeric;
  worst numeric;
begin
  select * into p from products where id = p_product;
  select * into r from pricing_rules where id = 1;
  if p.id is null or r is null then return null; end if;

  select coalesce(sum(nullif(e ->> 'amount', '')::numeric), 0) into fixed from jsonb_array_elements(r.fixed_costs) e;
  cost := coalesce(p.original_price, 0) + fixed + coalesce(p.extra_cost_brl, 0);
  other_pct := coalesce(p.commission_pct_override, r.commission_pct) + r.icms_pct + r.pis_cofins_pct + r.card_fee_pct;
  select cp.margin_pct into cat_margin from category_pricing cp where cp.category = p.category;
  target := coalesce(p.margin_pct_override, cat_margin, r.margin_pct);

  if r.fx_mode = 'auto' then
    select f.rate into usd_rate from fx_rates f where f.base = 'BRL' and f.quote = 'USD' order by f.fetched_at desc limit 1;
    select f.rate into eur_rate from fx_rates f where f.base = 'BRL' and f.quote = 'EUR' order by f.fetched_at desc limit 1;
  end if;
  usd_rate := coalesce(nullif(usd_rate, 0), r.usd_rate);
  eur_rate := coalesce(nullif(eur_rate, 0), r.eur_rate);

  if p.price_usd > 0 and cost > 0 then
    m_usd := ((p.price_usd * usd_rate) * (1 - other_pct / 100) - cost) / (p.price_usd * usd_rate) * 100;
  end if;
  if p.price_eur > 0 and cost > 0 then
    m_eur := ((p.price_eur * eur_rate) * (1 - other_pct / 100) - cost) / (p.price_eur * eur_rate) * 100;
  end if;
  worst := least(coalesce(m_usd, m_eur), coalesce(m_eur, m_usd));

  return jsonb_build_object(
    'cost_brl', round(cost, 2),
    'fixed_brl', round(fixed, 2),
    'usd_rate', usd_rate,
    'eur_rate', eur_rate,
    'margin_usd', round(m_usd, 1),
    'margin_eur', round(m_eur, 1),
    'target', target,
    'status', case when worst is null then 'NO_PRICE' when worst < target - 0.05 then 'MARGIN_BELOW_TARGET' else 'OK' end
  );
end;
$$;
grant execute on function tdp_product_margin(uuid) to authenticated, service_role;

-- --------------------------------------------------------------- Action Center
create or replace function action_feed_products()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  info jsonb;
  worst numeric;
  href text := '/admin/produtos/' || new.id;
begin
  if new.status = 'draft' then
    perform raise_action('products_to_review', 'products_to_review:' || new.id,
      'Product waiting for review', 'product', new.id, new.slug, new.title,
      new.price_brl, 'BRL', 1, href);
  else
    perform resolve_action('products_to_review:' || new.id);
  end if;

  if new.status <> 'archived' and coalesce(trim(new.category), '') = '' then
    perform raise_action('category_review_required', 'category_review_required:' || new.id,
      'Category missing', 'product', new.id, new.slug, new.title, null, null, 1, href);
  else
    perform resolve_action('category_review_required:' || new.id);
  end if;

  if new.status <> 'archived' and (new.weight_g is null or coalesce(trim(new.hs_code), '') = '') then
    perform raise_action('shipping_data_required', 'shipping_data_required:' || new.id,
      'Weight / HS code missing', 'product', new.id, new.slug, new.title, null, null, 1, href);
  else
    perform resolve_action('shipping_data_required:' || new.id);
  end if;

  -- one margin target (category / product / global rule), checked per currency
  if new.status <> 'archived' and coalesce(new.price_brl, 0) > 0 then
    info := tdp_product_margin(new.id);
    if info is not null and info ->> 'status' = 'MARGIN_BELOW_TARGET' then
      worst := least(coalesce((info ->> 'margin_usd')::numeric, 999), coalesce((info ->> 'margin_eur')::numeric, 999));
      perform raise_action('margin_below_target', 'margin_below_target:' || new.id,
        'Margin ' || worst || '% (target ' || (info ->> 'target') || '%)', 'product', new.id, new.slug,
        new.title, new.price_brl, 'BRL', 1, href);
    else
      perform resolve_action('margin_below_target:' || new.id);
      if tg_op = 'UPDATE' and new.original_price is distinct from old.original_price then
        perform log_system_event('info', 'source_cost_changed',
          'Source cost changed, margin OK', 'product', new.id,
          jsonb_build_object('from', old.original_price, 'to', new.original_price));
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists products_action_feed on products;
create trigger products_action_feed
  after insert or update of status, category, weight_g, hs_code, price_brl, price_usd, price_eur, original_price on products
  for each row execute function action_feed_products();

select recompute_all_product_prices();
