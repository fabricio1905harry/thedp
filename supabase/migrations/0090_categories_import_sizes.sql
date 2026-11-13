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
