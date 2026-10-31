-- ---------------------------------------------------------------------
-- 0088: homologation report 24/10 — NCM/HS rule by Category + Composition (P18)
--
-- * tdp_composition_key()  — normalized composition ("95% Viscose, 5% Elastano" ->
--                            "elastano:5|viscose:95"; same fibers in any order/spelling
--                            case = same key).
-- * hs_rules               — NCM/HS + weight + dimensions for a (category, composition).
-- * products_inherit_shipping() — order: the product's own value -> rule of its
--   category + composition -> category default. A product that only got values from
--   the category default while its composition has no rule yet is flagged for review
--   ("new composition"); approving it can save the values as a new rule.
-- * category default for "Vestidos": 1.60 kg and 36 x 34 x 11 cm (PDF); blank and
--   "Dresses" category names are folded into "Vestidos".
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

create or replace function tdp_category_key(c text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(c, '')))
    when 'dresses' then 'vestidos'
    when 'dress' then 'vestidos'
    when 'vestido' then 'vestidos'
    else lower(trim(coalesce(c, '')))
  end;
$$;

create or replace function tdp_composition_key(c text)
returns text
language plpgsql
immutable
as $$
declare
  txt text := lower(coalesce(c, ''));
  parts text[];
  m text[];
  pairs text[] := '{}';
begin
  txt := translate(txt, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  -- "95% viscose" or "viscose 95%"
  for m in select regexp_matches(txt, '(\d{1,3}(?:[.,]\d+)?)\s*%\s*([a-z][a-z ]*[a-z])', 'g') loop
    pairs := pairs || (trim(m[2]) || ':' || replace(m[1], ',', '.'));
  end loop;
  if cardinality(pairs) = 0 then
    for m in select regexp_matches(txt, '([a-z][a-z ]*[a-z])\s*(\d{1,3}(?:[.,]\d+)?)\s*%', 'g') loop
      pairs := pairs || (trim(m[1]) || ':' || replace(m[2], ',', '.'));
    end loop;
  end if;
  if cardinality(pairs) > 0 then
    select array_agg(p order by p) into parts from unnest(pairs) p;
    return array_to_string(parts, '|');
  end if;
  return nullif(regexp_replace(trim(txt), '\s+', ' ', 'g'), '');
end;
$$;

create table if not exists hs_rules (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  category_key text not null,
  composition_label text not null,
  composition_key text not null,
  hs_code text references hs_codes_master (code) on update cascade on delete set null,
  weight_g integer check (weight_g is null or weight_g > 0),
  dims_cm jsonb,
  notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (category_key, composition_key)
);
alter table hs_rules enable row level security;
drop policy if exists hs_rules_staff on hs_rules;
create policy hs_rules_staff on hs_rules for all using (is_staff()) with check (is_staff());
grant all on hs_rules to authenticated, service_role;

-- category defaults: fold blank names, add the PDF default for Vestidos
delete from category_shipping_defaults where trim(category) = '';
insert into category_shipping_defaults (category, weight_g, dims_cm)
values ('Vestidos', 1600, '{"length": 36, "width": 34, "height": 11}'::jsonb)
on conflict (category) do nothing;
update category_shipping_defaults
   set weight_g = coalesce(weight_g, 1600),
       dims_cm = coalesce(dims_cm, '{"length": 36, "width": 34, "height": 11}'::jsonb),
       updated_at = now()
 where tdp_category_key(category) = 'vestidos' and (weight_g is null or dims_cm is null);

create or replace function products_inherit_shipping()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  d category_shipping_defaults;
  r hs_rules;
  m hs_codes_master;
  inherited text[] := coalesce(new.shipping_inherited, '{}');
  catkey text := tdp_category_key(new.category);
  ckey text := tdp_composition_key(new.composition);
  w integer;
  dm jsonb;
begin
  -- a value edited by hand is no longer inherited
  if tg_op = 'UPDATE' then
    if new.hs_code is distinct from old.hs_code then inherited := array_remove(inherited, 'hs_code'); end if;
    if new.weight_g is distinct from old.weight_g then inherited := array_remove(inherited, 'weight_g'); end if;
    if new.dims_cm is distinct from old.dims_cm then inherited := array_remove(inherited, 'dims_cm'); end if;
  end if;
  inherited := array_remove(inherited, 'composition');

  if catkey <> '' then
    -- 1) rule of this category + composition (trusted: not flagged for review)
    if ckey is not null then
      select * into r from hs_rules where category_key = catkey and composition_key = ckey and active;
      if r.id is not null then
        if coalesce(trim(new.hs_code), '') = '' and r.hs_code is not null then new.hs_code := r.hs_code; end if;
        if new.weight_g is null and r.weight_g is not null then new.weight_g := r.weight_g; end if;
        if (new.dims_cm is null or new.dims_cm = '{}'::jsonb or new.dims_cm = 'null'::jsonb) and r.dims_cm is not null and r.dims_cm <> '{}'::jsonb then
          new.dims_cm := r.dims_cm;
        end if;
      end if;
    end if;

    -- 2) category default for what is still missing (flagged for review)
    select * into d from category_shipping_defaults where tdp_category_key(category) = catkey limit 1;
    if d.category is not null then
      if coalesce(trim(new.hs_code), '') = '' and d.hs_code is not null then
        new.hs_code := d.hs_code;
        inherited := array_append(array_remove(inherited, 'hs_code'), 'hs_code');
      end if;
      select * into m from hs_codes_master where code = coalesce(nullif(trim(new.hs_code), ''), d.hs_code);
      if new.weight_g is null then
        w := coalesce(d.weight_g, m.default_weight_g);
        if w is not null then
          new.weight_g := w;
          inherited := array_append(array_remove(inherited, 'weight_g'), 'weight_g');
        end if;
      end if;
      if new.dims_cm is null or new.dims_cm = '{}'::jsonb or new.dims_cm = 'null'::jsonb then
        dm := coalesce(d.dims_cm, m.default_dims_cm);
        if dm is not null and dm <> '{}'::jsonb then
          new.dims_cm := dm;
          inherited := array_append(array_remove(inherited, 'dims_cm'), 'dims_cm');
        end if;
      end if;
    end if;

    -- new composition: there is no rule for this category + composition yet
    if ckey is not null and r.id is null and cardinality(inherited) > 0 then
      inherited := array_append(inherited, 'composition');
    end if;
  end if;

  -- NCM (8 digits) follows the HS code when it is a full code
  if coalesce(trim(new.ncm), '') = '' and regexp_replace(coalesce(new.hs_code, ''), '\D', '', 'g') ~ '^\d{8}$' then
    new.ncm := regexp_replace(new.hs_code, '\D', '', 'g');
  end if;

  new.shipping_inherited := inherited;
  new.hs_review_status := case when cardinality(inherited) > 0 then 'needs_review' else 'ok' end;
  return new;
end;
$$;

drop trigger if exists products_inherit_shipping on products;
create trigger products_inherit_shipping
  before insert or update of category, composition, hs_code, weight_g, dims_cm, shipping_inherited on products
  for each row execute function products_inherit_shipping();

create or replace function apply_category_shipping_defaults()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  if not is_staff() and auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;
  update products p set category = p.category
   where p.status <> 'archived'
     and (coalesce(trim(p.hs_code), '') = '' or p.weight_g is null or p.dims_cm is null or p.dims_cm = '{}'::jsonb)
     and exists (select 1 from category_shipping_defaults d where tdp_category_key(d.category) = tdp_category_key(p.category));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function apply_category_shipping_defaults() from public;
grant execute on function apply_category_shipping_defaults() to authenticated, service_role;

-- products registered before: take the new Vestidos default (weight / dimensions) where missing
select apply_category_shipping_defaults();
