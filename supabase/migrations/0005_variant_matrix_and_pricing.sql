-- Variant matrix (size x color) generated from supplier text, and
-- precomputed multi-currency pricing (no on-the-fly conversion at
-- display time — everything is computed once, here, on write).

-- ---------------------------------------------------------------------
-- products: raw supplier size/color lists + 4-column pricing
-- ---------------------------------------------------------------------

alter table products rename column base_price to original_price;
alter table products alter column markup type numeric(12, 2);
alter table products drop column final_price;
alter table products drop column currency;

alter table products
  add column sizes jsonb not null default '[]'::jsonb,
  add column colors jsonb not null default '[]'::jsonb,
  add column default_stock integer not null default 0,
  add column price_brl numeric(12, 2),
  add column price_usd numeric(12, 2),
  add column price_eur numeric(12, 2);

-- ---------------------------------------------------------------------
-- variants: raw supplier size/color text (size_br/us/eu stay for a later
-- grade-conversion feature — CAT-02 — and are unused by this generator)
-- ---------------------------------------------------------------------

alter table variants
  add column size text,
  alter column color drop not null; -- was already nullable, kept explicit

update variants set size = size_br where size is null;
alter table variants alter column size set not null;

alter table variants
  add constraint variants_product_size_color_key unique (product_id, size, color);

-- ---------------------------------------------------------------------
-- price_brl = original_price + markup (markup is a flat BRL amount, not
-- a percentage); price_usd/eur = price_brl / latest manually-entered rate.
-- Recomputed on every original_price/markup change, and again whenever
-- the admin updates a rate in fx_rates (see trigger below) — never at
-- request time.
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

create trigger products_compute_prices
  before insert or update of original_price, markup on products
  for each row execute function compute_product_prices();

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

create trigger fx_rates_recompute_products
  after insert on fx_rates
  for each row execute function recompute_products_fx();

-- backfill existing rows so price_brl/usd/eur aren't null before the first
-- edit touches original_price/markup
update products set original_price = original_price;

-- ---------------------------------------------------------------------
-- variant matrix generation: cartesian product of sizes x colors,
-- upserted so re-imports (CAT-05 incremental sync) never duplicate or
-- clobber existing stock.
-- ---------------------------------------------------------------------

create or replace function generate_variant_matrix()
returns trigger
language plpgsql
as $$
declare
  size_val text;
  color_val text;
  color_abbrev text;
begin
  for size_val in select trim(both from x) from jsonb_array_elements_text(new.sizes) as x
  loop
    for color_val in select trim(both from x) from jsonb_array_elements_text(new.colors) as x
    loop
      color_abbrev := upper(left(regexp_replace(color_val, '[^a-zA-Z]', '', 'g'), 3));
      insert into variants (product_id, size, color, sku, stock)
      values (
        new.id,
        size_val,
        color_val,
        new.slug || '-' || size_val || '-' || coalesce(nullif(color_abbrev, ''), 'STD'),
        new.default_stock
      )
      on conflict (product_id, size, color) do nothing;
    end loop;
  end loop;
  return new;
end;
$$;

create trigger products_generate_variants
  after insert or update of sizes, colors on products
  for each row execute function generate_variant_matrix();

-- ---------------------------------------------------------------------
-- RLS: approved customers need to read variant availability (size/color
-- stock) for the products they're allowed to see a price for. Staff keep
-- full access via the existing variants_staff_all policy.
-- ---------------------------------------------------------------------

create policy variants_approved_read on variants
  for select using (
    exists (
      select 1 from products p
      join customers c on c.id = auth.uid()
      where p.id = variants.product_id
        and p.status = 'published'
        and c.status = 'approved'
    )
  );

-- ---------------------------------------------------------------------
-- get_priced_product/get_priced_catalog referenced products.final_price
-- and products.currency, both dropped above — replace with the 4-column
-- model. Single-product (detail page) and bulk (listing pages) variants.
-- ---------------------------------------------------------------------

drop function if exists get_priced_product(text);

create function get_priced_product(product_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  sizes jsonb,
  colors jsonb,
  price_brl numeric,
  price_usd numeric,
  price_eur numeric
)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.slug, p.title, p.sizes, p.colors, p.price_brl, p.price_usd, p.price_eur
  from products p
  where p.slug = product_slug
    and p.status = 'published'
    and exists (
      select 1 from customers c
      where c.id = auth.uid() and c.status = 'approved'
    );
$$;

grant execute on function get_priced_product(text) to authenticated;

create function get_priced_catalog()
returns table (
  id uuid,
  slug text,
  title text,
  price_brl numeric,
  price_usd numeric,
  price_eur numeric
)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.slug, p.title, p.price_brl, p.price_usd, p.price_eur
  from products p
  where p.status = 'published'
    and exists (
      select 1 from customers c
      where c.id = auth.uid() and c.status = 'approved'
    );
$$;

grant execute on function get_priced_catalog() to authenticated;
