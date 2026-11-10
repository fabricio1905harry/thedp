-- =====================================================================
-- 2026-11-10 — rodar UMA VEZ no Supabase (SQL Editor), inteiro, nesta ordem:
--   0088 (regras NCM por composição + função tdp_category_key)
--   0089 (MULTI em ES, categorias Dresses/em branco -> Vestidos, campos do Become a Brand)
--   0090 (Categorias com subcategorias, herança no produto, tamanhos do PDF, importação Vesti)
-- A 0089 depende da 0088: rodada sozinha ela falha e o Supabase desfaz tudo (foi o que aconteceu em 04/11).
-- Pode ser rodado de novo sem problema.
-- =====================================================================

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


-- ---------------------------------------------------------------------
-- 0089: homologation retest 03/11
--
-- * P15  MULTI: ES name is "Multicolor" (PT stays "Estampado", PDF p. 45).
-- * P35  Become a Brand: extra form fields (product categories, markets, wholesale presence, opportunity).
-- * P18  Categories: "Dresses" / "Dress" / "Vestido" and blank names are folded into
--        "Vestidos" in products, category defaults and packaging capacity rules, and the
--        "Vestidos" default always carries the PDF values (1.60 kg; 36 x 34 x 11 cm).
--        (0088 only filled NULLs and never merged the duplicate rows.)
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

-- P15
update tdp_colors set name_es = 'Multicolor' where id = 'MULTI' and name_es = 'Estampado';

-- P18: products
update products set category = 'Vestidos'
 where category is not null and tdp_category_key(category) = 'vestidos' and category <> 'Vestidos';
update products set category = null where category is not null and trim(category) = '';

-- P18: category defaults (NCM / weight / dimensions)
delete from category_shipping_defaults where trim(category) = '';
insert into category_shipping_defaults (category) values ('Vestidos') on conflict (category) do nothing;
update category_shipping_defaults v
   set hs_code = coalesce(v.hs_code, (
         select d.hs_code from category_shipping_defaults d
          where d.category <> 'Vestidos' and tdp_category_key(d.category) = 'vestidos' and d.hs_code is not null
          limit 1)),
       weight_g = coalesce(v.weight_g, 1600),
       dims_cm = case
         when v.dims_cm is null or v.dims_cm = '{}'::jsonb or v.dims_cm = 'null'::jsonb
           then '{"length": 36, "width": 34, "height": 11}'::jsonb
         else v.dims_cm end,
       updated_at = now()
 where v.category = 'Vestidos';
delete from category_shipping_defaults where category <> 'Vestidos' and tdp_category_key(category) = 'vestidos';

-- P18: packaging capacity rules — drop the duplicate "Dresses" copies, rename the rest
delete from packaging_capacity_rules d
 using packaging_capacity_rules v
 where d.id <> v.id
   and d.category <> 'Vestidos' and tdp_category_key(d.category) = 'vestidos'
   and v.category = 'Vestidos'
   and d.packaging_type_id = v.packaging_type_id
   and d.min_quantity = v.min_quantity
   and d.max_quantity = v.max_quantity;
update packaging_capacity_rules set category = 'Vestidos'
 where category <> 'Vestidos' and tdp_category_key(category) = 'vestidos';

-- P35: Become a Brand — product categories, current markets, wholesale presence, opportunity type
-- (options of the PDF p. 83; wholesale presence is free text)
alter table brand_applications
  add column if not exists product_categories text[] not null default '{}',
  add column if not exists current_markets text,
  add column if not exists wholesale_presence text,
  add column if not exists opportunity_type text
    check (opportunity_type is null or opportunity_type in
      ('international_distribution', 'national_distribution', 'wholesale_b2b', 'commercial_placement', 'other'));


-- ---------------------------------------------------------------------
-- 0090: homologation 09/11 — categories, supplier import, size table
-- Needs 0088 (tdp_category_key, hs_rules) and 0089. Idempotent / rerun-safe.
--
-- * M6   size_chart: bust / waist / hip of the PDF (p. 116) and the BR letter
--        aliases (36 PP … 46 3G … 56 8G).
-- * P18  Categories (Admin → Categorias) = category_shipping_defaults with
--        subcategories, EN/ES names, NCM, HS, weight and L × W × H. A product takes
--        them automatically when its category is chosen (and again when the
--        category changes), and they feed freight, duties and the invoice.
--        Weight per supplier + category (PDF pp. 36–41) wins over the category.
-- * P41–P45 supplier import (Vesti): composition out of the description, title
--        in sentence case, default stock 500, brand "The Dressing Project".
-- ---------------------------------------------------------------------

-- ================================================================ M6 sizes
update size_chart s
   set bust_cm = v.bust, waist_cm = v.waist, hip_cm = v.hip, aliases = v.aliases, updated_at = now()
  from (values
    ('36', '79-86',   '62-66',   '93-97',   array['PP']),
    ('38', '86-90',   '66-70',   '97-101',  array['P']),
    ('40', '90-96',   '70-79',   '101-109', array['M']),
    ('42', '96-104',  '79-87',   '109-113', array['G']),
    ('44', '104-108', '87-91',   '113-118', array['GG']),
    ('46', '108-112', '91-95',   '118-122', array['3G']),
    ('48', '112-116', '95-99',   '122-126', array['4G']),
    ('50', '116-120', '99-103',  '126-130', array['5G']),
    ('52', '120-124', '103-107', '130-134', array['6G']),
    ('54', '124-128', '107-111', '134-138', array['7G']),
    ('56', '128-132', '111-115', '138-142', array['8G'])
  ) as v (size_br, bust, waist, hip, aliases)
 where s.size_br = v.size_br;

-- ========================================================= P18 categories
alter table category_shipping_defaults
  add column if not exists parent_category text,
  add column if not exists name_en text,
  add column if not exists name_es text,
  add column if not exists ncm text,
  add column if not exists active boolean not null default true,
  add column if not exists sort integer not null default 0;
-- the HS of a category is typed freely (6 digits), not only codes of the master table
alter table category_shipping_defaults drop constraint if exists category_shipping_defaults_hs_code_fkey;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'category_shipping_defaults_parent_fkey') then
    alter table category_shipping_defaults
      add constraint category_shipping_defaults_parent_fkey foreign key (parent_category)
      references category_shipping_defaults (category) on update cascade on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_shipping_defaults_ncm_check') then
    alter table category_shipping_defaults
      add constraint category_shipping_defaults_ncm_check check (ncm is null or ncm ~ '^\d{8}$');
  end if;
end $$;

-- Vestidos (the only category in use) with the PDF values
insert into category_shipping_defaults (category, name_en, name_es, weight_g, dims_cm, sort)
values ('Vestidos', 'Dresses', 'Vestidos', 1600, '{"length": 36, "width": 34, "height": 11}'::jsonb, 10)
on conflict (category) do nothing;
update category_shipping_defaults
   set name_en = coalesce(nullif(name_en, ''), 'Dresses'),
       name_es = coalesce(nullif(name_es, ''), 'Vestidos'),
       weight_g = coalesce(weight_g, 1600),
       dims_cm = case when dims_cm is null or dims_cm = '{}'::jsonb or dims_cm = 'null'::jsonb
                      then '{"length": 36, "width": 34, "height": 11}'::jsonb else dims_cm end,
       updated_at = now()
 where category = 'Vestidos';

-- weight / dimensions per supplier + category (PDF pp. 36–41)
create table if not exists category_supplier_defaults (
  category text not null references category_shipping_defaults (category) on update cascade on delete cascade,
  connector_id uuid not null references connectors (id) on delete cascade,
  weight_g integer check (weight_g is null or weight_g > 0),
  dims_cm jsonb,
  updated_at timestamptz not null default now(),
  primary key (category, connector_id)
);
alter table category_supplier_defaults enable row level security;
drop policy if exists category_supplier_defaults_staff on category_supplier_defaults;
create policy category_supplier_defaults_staff on category_supplier_defaults for all using (is_staff()) with check (is_staff());
grant all on category_supplier_defaults to authenticated, service_role;

-- Product ← category. Order for weight / dimensions: the product's own value → supplier + category →
-- rule of category + composition → category → parent category → HS master. NCM / HS: rule → category →
-- parent. A value typed on the product is never replaced. Values that came from a category are replaced
-- when the category (or supplier / composition) changes, or when the category itself is edited
-- (reapply_category). They stay flagged for review, as before.
create or replace function products_inherit_shipping()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cat category_shipping_defaults;
  par category_shipping_defaults;
  sup category_supplier_defaults;
  r hs_rules;
  m hs_codes_master;
  inherited text[] := coalesce(new.shipping_inherited, '{}');
  catkey text := tdp_category_key(new.category);
  ckey text := tdp_composition_key(new.composition);
  refresh boolean;
  v_ncm text; v_hs text; v_w integer; v_d jsonb;
  ncm_rule boolean := false; hs_rule boolean := false; w_rule boolean := false; d_rule boolean := false;
  empty_d boolean;
begin
  refresh := tg_op = 'INSERT'
    or new.category is distinct from old.category
    or new.connector_id is distinct from old.connector_id
    or new.composition is distinct from old.composition
    or coalesce(current_setting('tdp.reapply_category', true), '') = 'on';

  -- a value edited by hand is no longer inherited
  if tg_op = 'UPDATE' then
    if new.ncm is distinct from old.ncm then inherited := array_remove(inherited, 'ncm'); end if;
    if new.hs_code is distinct from old.hs_code then inherited := array_remove(inherited, 'hs_code'); end if;
    if new.weight_g is distinct from old.weight_g then inherited := array_remove(inherited, 'weight_g'); end if;
    if new.dims_cm is distinct from old.dims_cm then inherited := array_remove(inherited, 'dims_cm'); end if;
  end if;
  inherited := array_remove(inherited, 'composition');

  if catkey <> '' then
    select * into cat from category_shipping_defaults where tdp_category_key(category) = catkey limit 1;
    if cat.category is not null and cat.parent_category is not null then
      select * into par from category_shipping_defaults where category = cat.parent_category;
    end if;
    if new.connector_id is not null then
      select * into sup from category_supplier_defaults s where s.connector_id = new.connector_id and tdp_category_key(s.category) = catkey limit 1;
    end if;
    if ckey is not null then
      select * into r from hs_rules where category_key = catkey and composition_key = ckey and active;
    end if;
  end if;

  -- candidate values
  if r.id is not null and regexp_replace(coalesce(r.hs_code, ''), '\D', '', 'g') ~ '^\d{8}$' then
    v_ncm := regexp_replace(r.hs_code, '\D', '', 'g'); ncm_rule := true;
  else
    v_ncm := coalesce(nullif(cat.ncm, ''), nullif(par.ncm, ''));
  end if;
  if r.id is not null and r.hs_code is not null then
    v_hs := r.hs_code; hs_rule := true;
  else
    v_hs := coalesce(nullif(cat.hs_code, ''), nullif(left(cat.ncm, 6), ''), nullif(par.hs_code, ''), nullif(left(par.ncm, 6), ''));
  end if;
  select * into m from hs_codes_master where code = coalesce(nullif(trim(new.hs_code), ''), v_hs);
  if sup.weight_g is not null then v_w := sup.weight_g;
  elsif r.id is not null and r.weight_g is not null then v_w := r.weight_g; w_rule := true;
  else v_w := coalesce(cat.weight_g, par.weight_g, m.default_weight_g);
  end if;
  if sup.dims_cm is not null and sup.dims_cm <> '{}'::jsonb then v_d := sup.dims_cm;
  elsif r.id is not null and r.dims_cm is not null and r.dims_cm <> '{}'::jsonb then v_d := r.dims_cm; d_rule := true;
  else
    v_d := case
      when cat.dims_cm is not null and cat.dims_cm <> '{}'::jsonb then cat.dims_cm
      when par.dims_cm is not null and par.dims_cm <> '{}'::jsonb then par.dims_cm
      when m.default_dims_cm is not null and m.default_dims_cm <> '{}'::jsonb then m.default_dims_cm
    end;
  end if;

  -- NCM
  if coalesce(trim(new.ncm), '') = '' or (refresh and 'ncm' = any(inherited)) then
    new.ncm := v_ncm;
    inherited := array_remove(inherited, 'ncm');
    if v_ncm is not null and not ncm_rule then inherited := array_append(inherited, 'ncm'); end if;
  end if;
  -- HS
  if coalesce(trim(new.hs_code), '') = '' or (refresh and 'hs_code' = any(inherited)) then
    new.hs_code := v_hs;
    inherited := array_remove(inherited, 'hs_code');
    if v_hs is not null and not hs_rule then inherited := array_append(inherited, 'hs_code'); end if;
  end if;
  -- weight
  if new.weight_g is null or (refresh and 'weight_g' = any(inherited)) then
    new.weight_g := v_w;
    inherited := array_remove(inherited, 'weight_g');
    if v_w is not null and not w_rule then inherited := array_append(inherited, 'weight_g'); end if;
  end if;
  -- dimensions
  -- the Admin form used to save empty dimensions as {"length": null, ...}: that is empty too
  empty_d := new.dims_cm is null or jsonb_typeof(new.dims_cm) <> 'object'
    or coalesce(nullif(new.dims_cm ->> 'length', ''), '0')::numeric <= 0;
  if empty_d or (refresh and 'dims_cm' = any(inherited)) then
    new.dims_cm := v_d;
    inherited := array_remove(inherited, 'dims_cm');
    if v_d is not null and not d_rule then inherited := array_append(inherited, 'dims_cm'); end if;
  end if;

  -- new composition: there is no rule for this category + composition yet
  if catkey <> '' and ckey is not null and r.id is null and cardinality(inherited) > 0 then
    inherited := array_append(inherited, 'composition');
  end if;

  new.shipping_inherited := inherited;
  new.hs_review_status := case when cardinality(inherited) > 0 then 'needs_review' else 'ok' end;
  return new;
end;
$$;

drop trigger if exists products_inherit_shipping on products;
create trigger products_inherit_shipping
  before insert or update of category, composition, connector_id, ncm, hs_code, weight_g, dims_cm, shipping_inherited on products
  for each row execute function products_inherit_shipping();

-- after editing a category (or its supplier weights): products of it (and of its subcategories) take the new values
create or replace function reapply_category(p_category text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  if not is_staff() and auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;
  perform set_config('tdp.reapply_category', 'on', true);
  update products p set shipping_inherited = p.shipping_inherited
   where p.status <> 'archived'
     and (tdp_category_key(p.category) = tdp_category_key(p_category)
          or tdp_category_key(p.category) in (select tdp_category_key(c.category) from category_shipping_defaults c where c.parent_category = p_category));
  get diagnostics n = row_count;
  perform set_config('tdp.reapply_category', 'off', true);
  return n;
end;
$$;
revoke execute on function reapply_category(text) from public;
grant execute on function reapply_category(text) to authenticated, service_role;

-- ============================================== P41–P45 supplier import fixes
-- P44 composition typed into the description ("96% poliéster 04% elastano") → Material / composição
update products
   set composition = trim(description), description = null, updated_at = now()
 where coalesce(trim(composition), '') = ''
   and description ~* '^\s*\d{1,3}([.,]\d+)?\s*%\s*[[:alpha:]]'
   and length(description) <= 200
   and description !~ '[.!?]\s+[[:upper:]]'
   and not ('description' = any(coalesce(locked_fields, '{}')));

-- P42 titles in sentence case ("VESTIDO CAPA" → "Vestido capa")
update products
   set title = upper(left(lower(trim(title)), 1)) || substr(lower(trim(title)), 2), updated_at = now()
 where title = upper(title) and title ~ '[[:upper:]]'
   and not ('title' = any(coalesce(locked_fields, '{}')));

-- P43 default stock of each new size × color combination
alter table products alter column default_stock set default 500;
update products set default_stock = 500 where default_stock = 10;

-- P45 brand: every product without a brand belongs to The Dressing Project
insert into brands (slug, name, active, sort)
select 'the-dressing-project', 'The Dressing Project', true, 0
 where not exists (select 1 from brands where lower(name) = 'the dressing project');
update products p
   set brand_id = (select b.id from brands b where lower(b.name) = 'the dressing project'
                   order by (b.slug = 'the-dressing-project') desc, b.created_at limit 1)
 where p.brand_id is null;

-- empty dimensions saved as {"length": null, ...} by the old form → NULL (they are then inherited)
update products set dims_cm = null
 where dims_cm is not null and (jsonb_typeof(dims_cm) <> 'object' or coalesce(nullif(dims_cm ->> 'length', ''), '0')::numeric <= 0);

-- products take the Vestidos values now (NCM stays empty until the TDP fills it in the category)
select reapply_category('Vestidos');
