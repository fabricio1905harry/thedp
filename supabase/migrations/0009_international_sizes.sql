-- ---------------------------------------------------------------------
-- International Size Conversion (BR / US / EU)
-- Adds size_br, size_us, size_eu columns & automatic triggers.
-- ---------------------------------------------------------------------

alter table products add column if not exists sizes_us jsonb;
alter table products add column if not exists sizes_eu jsonb;

alter table variants add column if not exists size_br text;
alter table variants add column if not exists size_us text;
alter table variants add column if not exists size_eu text;

-- Helper function: convert BR size to US size
create or replace function convert_size_br_to_us(sz text)
returns text
language plpgsql
as $$
declare
  clean_sz text;
begin
  clean_sz := upper(trim(both from sz));
  case clean_sz
    when '34', 'PP', 'XS' then return '0 (XS)';
    when '36', 'P', 'S' then return '2 (S)';
    when '38' then return '4 (S)';
    when '40', 'M' then return '6 (M)';
    when '42' then return '8 (M)';
    when '44', 'G', 'L' then return '10 (L)';
    when '46', 'GG', 'XL' then return '12 (XL)';
    when '48', 'XGG', 'XXL' then return '14 (XL)';
    when '50' then return '16 (XXL)';
    else return sz;
  end case;
end;
$$;

-- Helper function: convert BR size to EU size
create or replace function convert_size_br_to_eu(sz text)
returns text
language plpgsql
as $$
declare
  clean_sz text;
begin
  clean_sz := upper(trim(both from sz));
  case clean_sz
    when '34', 'PP', 'XS' then return '34';
    when '36', 'P', 'S' then return '36';
    when '38' then return '38';
    when '40', 'M' then return '40';
    when '42' then return '42';
    when '44', 'G', 'L' then return '44';
    when '46', 'GG', 'XL' then return '46';
    when '48', 'XGG', 'XXL' then return '48';
    when '50' then return '50';
    else return sz;
  end case;
end;
$$;

-- Trigger function: compute sizes_us and sizes_eu on products
create or replace function compute_product_international_sizes()
returns trigger
language plpgsql
as $$
declare
  sz text;
  us_arr jsonb := '[]'::jsonb;
  eu_arr jsonb := '[]'::jsonb;
  us_converted text;
  eu_converted text;
begin
  if new.sizes is not null and jsonb_array_length(new.sizes) > 0 then
    for sz in select distinct trim(both from x) from jsonb_array_elements_text(new.sizes) as x where length(trim(both from x)) > 0
    loop
      us_converted := convert_size_br_to_us(sz);
      eu_converted := convert_size_br_to_eu(sz);

      us_arr := us_arr || to_jsonb(us_converted);
      eu_arr := eu_arr || to_jsonb(eu_converted);
    end loop;
  end if;

  new.sizes_us := us_arr;
  new.sizes_eu := eu_arr;
  return new;
end;
$$;

drop trigger if exists products_compute_international_sizes on products;
create trigger products_compute_international_sizes
  before insert or update of sizes on products
  for each row execute function compute_product_international_sizes();

-- Update generate_variant_matrix() trigger function to populate size_br, size_us, size_eu
create or replace function generate_variant_matrix()
returns trigger
language plpgsql
as $$
declare
  size_val text;
  color_val text;
  color_abbrev text;
  has_colors boolean;
  sz_br text;
  sz_us text;
  sz_eu text;
begin
  if new.sizes is null or jsonb_array_length(new.sizes) = 0 then
    return new;
  end if;

  has_colors := (new.colors is not null and jsonb_array_length(new.colors) > 0);

  for size_val in select distinct trim(both from x) from jsonb_array_elements_text(new.sizes) as x where length(trim(both from x)) > 0
  loop
    sz_br := size_val;
    sz_us := convert_size_br_to_us(size_val);
    sz_eu := convert_size_br_to_eu(size_val);

    if has_colors then
      for color_val in select distinct trim(both from x) from jsonb_array_elements_text(new.colors) as x where length(trim(both from x)) > 0
      loop
        color_abbrev := upper(left(regexp_replace(color_val, '[^a-zA-Z]', '', 'g'), 3));
        insert into variants (product_id, size, size_br, size_us, size_eu, color, sku, stock)
        values (
          new.id,
          size_val,
          sz_br,
          sz_us,
          sz_eu,
          color_val,
          new.slug || '-' || size_val || '-' || coalesce(nullif(color_abbrev, ''), 'STD'),
          coalesce(new.default_stock, 0)
        )
        on conflict (product_id, size, color) do update set
          size_br = excluded.size_br,
          size_us = excluded.size_us,
          size_eu = excluded.size_eu;
      end loop;
    else
      insert into variants (product_id, size, size_br, size_us, size_eu, color, sku, stock)
      values (
        new.id,
        size_val,
        sz_br,
        sz_us,
        sz_eu,
        null,
        new.slug || '-' || size_val,
        coalesce(new.default_stock, 0)
      )
      on conflict (product_id, size, color) do update set
        size_br = excluded.size_br,
        size_us = excluded.size_us,
        size_eu = excluded.size_eu;
    end if;
  end loop;

  return new;
end;
$$;

-- Backfill existing products & variants
update products set sizes = sizes where sizes is not null;
