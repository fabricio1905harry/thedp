-- Migration 0007: Variant Matrix Normalization & 4-Column Pricing Refinements
-- Ensures robust cartesian product generation (sizes x colors) and
-- exact 4-column pricing calculations rounded to 2 decimal places.

-- ---------------------------------------------------------------------
-- 1. Precomputed Pricing Trigger (products)
-- ---------------------------------------------------------------------

create or replace function compute_product_prices()
returns trigger
language plpgsql
as $$
declare
  usd_rate numeric;
  eur_rate numeric;
begin
  new.price_brl := round(coalesce(new.original_price, 0) + coalesce(new.markup, 0), 2);

  select rate into usd_rate from fx_rates
    where base = 'BRL' and quote = 'USD' order by fetched_at desc limit 1;
  select rate into eur_rate from fx_rates
    where base = 'BRL' and quote = 'EUR' order by fetched_at desc limit 1;

  new.price_usd := case when usd_rate > 0 then round(new.price_brl / usd_rate, 2) else null end;
  new.price_eur := case when eur_rate > 0 then round(new.price_brl / eur_rate, 2) else null end;

  return new;
end;
$$;

drop trigger if exists products_compute_prices on products;
create trigger products_compute_prices
  before insert or update on products
  for each row execute function compute_product_prices();

-- ---------------------------------------------------------------------
-- 2. FX Rates Recompute Trigger (fx_rates)
-- ---------------------------------------------------------------------

create or replace function recompute_products_fx()
returns trigger
language plpgsql
as $$
begin
  if new.base = 'BRL' and new.quote = 'USD' and new.rate > 0 then
    update products set price_usd = round(price_brl / new.rate, 2) where price_brl is not null;
  elsif new.base = 'BRL' and new.quote = 'EUR' and new.rate > 0 then
    update products set price_eur = round(price_brl / new.rate, 2) where price_brl is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists fx_rates_recompute_products on fx_rates;
create trigger fx_rates_recompute_products
  after insert or update on fx_rates
  for each row execute function recompute_products_fx();

-- ---------------------------------------------------------------------
-- 3. Variant Matrix Generator Trigger (sizes x colors cartesian product)
-- ---------------------------------------------------------------------

create or replace function generate_variant_matrix()
returns trigger
language plpgsql
as $$
declare
  size_val text;
  color_val text;
  color_abbrev text;
  has_colors boolean;
begin
  -- If sizes is empty or null, no variants to generate
  if new.sizes is null or jsonb_array_length(new.sizes) = 0 then
    return new;
  end if;

  has_colors := (new.colors is not null and jsonb_array_length(new.colors) > 0);

  for size_val in select distinct trim(both from x) from jsonb_array_elements_text(new.sizes) as x where length(trim(both from x)) > 0
  loop
    if has_colors then
      for color_val in select distinct trim(both from x) from jsonb_array_elements_text(new.colors) as x where length(trim(both from x)) > 0
      loop
        color_abbrev := upper(left(regexp_replace(color_val, '[^a-zA-Z]', '', 'g'), 3));
        insert into variants (product_id, size, color, sku, stock)
        values (
          new.id,
          size_val,
          color_val,
          new.slug || '-' || size_val || '-' || coalesce(nullif(color_abbrev, ''), 'STD'),
          coalesce(new.default_stock, 0)
        )
        on conflict (product_id, size, color) do nothing;
      end loop;
    else
      -- Product has sizes but no colors
      insert into variants (product_id, size, color, sku, stock)
      values (
        new.id,
        size_val,
        null,
        new.slug || '-' || size_val,
        coalesce(new.default_stock, 0)
      )
      on conflict (product_id, size, color) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists products_generate_variants on products;
create trigger products_generate_variants
  after insert or update of sizes, colors on products
  for each row execute function generate_variant_matrix();
