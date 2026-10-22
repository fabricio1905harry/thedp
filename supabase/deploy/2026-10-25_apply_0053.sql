-- ---------------------------------------------------------------------
-- 0053: NCM/HS master + category shipping defaults
--
-- * hs_codes_master — master list of NCM/HS codes (description, optional
--   default weight/dimensions, country of origin default BR). `validated`
--   stays false until the accountant confirms the code.
-- * category_shipping_defaults — per product category: HS code (from the
--   master) + default weight and dimensions.
-- * products.hs_review_status / shipping_inherited — a product without HS
--   code / weight / dimensions inherits the category defaults and is flagged
--   `needs_review` until someone approves it (or edits the value by hand).
--   The existing Action Center item `shipping_data_required` reflects it.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

create table if not exists hs_codes_master (
  code text primary key,
  description text not null,
  default_weight_g integer check (default_weight_g is null or default_weight_g > 0),
  default_dims_cm jsonb,                          -- {length, width, height}
  country_origin text not null default 'BR',
  validated boolean not null default false,
  active boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists category_shipping_defaults (
  category text primary key,
  hs_code text references hs_codes_master (code) on update cascade on delete set null,
  weight_g integer check (weight_g is null or weight_g > 0),
  dims_cm jsonb,
  updated_at timestamptz not null default now()
);

alter table products add column if not exists hs_review_status text not null default 'ok';
alter table products add column if not exists shipping_inherited text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_hs_review_status_check') then
    alter table products add constraint products_hs_review_status_check check (hs_review_status in ('ok', 'needs_review'));
  end if;
end $$;

-- Suggested codes (NOT validated — to be confirmed with the accountant)
insert into hs_codes_master (code, description, notes) values
  ('6204.43.00', 'Vestidos de fibras sintéticas, de uso feminino (tecido plano)', 'Sugestão — validar com a contabilidade'),
  ('6204.42.00', 'Vestidos de algodão, de uso feminino (tecido plano)', 'Sugestão — validar com a contabilidade'),
  ('6204.49.00', 'Vestidos de outras matérias têxteis, de uso feminino (tecido plano)', 'Sugestão — validar com a contabilidade'),
  ('6104.43.00', 'Vestidos de fibras sintéticas, de uso feminino (malha)', 'Sugestão — validar com a contabilidade')
on conflict (code) do nothing;

alter table hs_codes_master enable row level security;
alter table category_shipping_defaults enable row level security;
drop policy if exists hs_codes_master_staff on hs_codes_master;
create policy hs_codes_master_staff on hs_codes_master for all using (is_staff()) with check (is_staff());
drop policy if exists category_shipping_defaults_staff on category_shipping_defaults;
create policy category_shipping_defaults_staff on category_shipping_defaults for all using (is_staff()) with check (is_staff());
grant all on hs_codes_master, category_shipping_defaults to authenticated, service_role;

-- Inherit category defaults when a product lacks HS code / weight / dimensions
create or replace function products_inherit_shipping()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  d category_shipping_defaults;
  m hs_codes_master;
  inherited text[] := coalesce(new.shipping_inherited, '{}');
  w integer;
  dm jsonb;
begin
  -- a value edited by hand is no longer inherited
  if tg_op = 'UPDATE' then
    if new.hs_code is distinct from old.hs_code then inherited := array_remove(inherited, 'hs_code'); end if;
    if new.weight_g is distinct from old.weight_g then inherited := array_remove(inherited, 'weight_g'); end if;
    if new.dims_cm is distinct from old.dims_cm then inherited := array_remove(inherited, 'dims_cm'); end if;
  end if;

  if coalesce(trim(new.category), '') <> '' then
    select * into d from category_shipping_defaults where lower(category) = lower(trim(new.category));
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
  end if;

  new.shipping_inherited := inherited;
  new.hs_review_status := case when cardinality(inherited) > 0 then 'needs_review' else 'ok' end;
  return new;
end;
$$;

drop trigger if exists products_inherit_shipping on products;
create trigger products_inherit_shipping
  before insert or update of category, hs_code, weight_g, dims_cm, shipping_inherited on products
  for each row execute function products_inherit_shipping();

-- Action Center: same item as 0027 (`shipping_data_required:<product>`), reflecting the review state.
-- Named so that it runs after products_action_feed (triggers fire alphabetically).
create or replace function action_feed_products_hs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  href text := '/admin/ncm?tab=revisao';
begin
  if new.status = 'archived' then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.hs_review_status = old.hs_review_status
     and new.hs_code is not distinct from old.hs_code
     and new.weight_g is not distinct from old.weight_g
     and new.status = old.status then
    return null;
  end if;
  if new.hs_review_status = 'needs_review' then
    perform raise_action('shipping_data_required', 'shipping_data_required:' || new.id,
      'HS code / weight / dimensions inherited from category — review',
      'product', new.id, new.slug, new.title, null, null, 1, href);
  elsif new.weight_g is not null and coalesce(trim(new.hs_code), '') <> '' then
    perform resolve_action('shipping_data_required:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists products_hs_action_feed on products;
create trigger products_hs_action_feed
  after insert or update on products
  for each row execute function action_feed_products_hs();

-- Bulk: apply the category defaults to products still missing data (the trigger does the work)
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
     and exists (select 1 from category_shipping_defaults d where lower(d.category) = lower(trim(p.category)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function apply_category_shipping_defaults() from public;
grant execute on function apply_category_shipping_defaults() to authenticated, service_role;
