-- ---------------------------------------------------------------------
-- 0084: homologation report 24/10 — complete product registration (P16, P31)
--
-- products:  description EN/ES (description = PT), composition, country of
--            origin, NCM (8 digits; HS 6 digits derived), supplier reference,
--            TDP reference shown to the buyer (TDP12345, generated), customs
--            description, visibility per operation.
-- variants:  visibility per operation.
-- product_images.color_key: photo tied to a color (P31); empty = all colors.
-- products_public exposes visible_ops so the site can filter by operation.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

alter table products
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists composition text,
  add column if not exists origin_country text not null default 'BR',
  add column if not exists ncm text,
  add column if not exists supplier_ref text,
  add column if not exists tdp_ref text,
  add column if not exists customs_description text,
  add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';

alter table variants
  add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';

alter table product_images
  add column if not exists color_key text;

-- ---- TDP reference: TDP + 5 digits, unique, generated when empty
create sequence if not exists tdp_ref_seq start 10001;

create or replace function products_set_tdp_ref()
returns trigger
language plpgsql
as $$
begin
  if coalesce(trim(new.tdp_ref), '') = '' then
    new.tdp_ref := 'TDP' || lpad(nextval('tdp_ref_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists products_set_tdp_ref on products;
create trigger products_set_tdp_ref
  before insert or update of tdp_ref on products
  for each row execute function products_set_tdp_ref();

-- backfill (the trigger fills the reference of each touched row)
update products set tdp_ref = null where coalesce(tdp_ref, '') = '' and id is not null;
create unique index if not exists products_tdp_ref_key on products (tdp_ref);

-- ---- NCM (8 digits) -> HS (first 6) when the HS code is empty
create or replace function products_ncm_to_hs()
returns trigger
language plpgsql
as $$
declare
  digits text;
begin
  if new.ncm is not null then
    digits := regexp_replace(new.ncm, '\D', '', 'g');
    new.ncm := nullif(digits, '');
    if length(digits) >= 6 and coalesce(trim(new.hs_code), '') = '' then
      new.hs_code := left(digits, 6);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_ncm_to_hs on products;
create trigger products_ncm_to_hs
  before insert or update of ncm, hs_code on products
  for each row execute function products_ncm_to_hs();

-- ---- public view with the operation visibility
drop view if exists products_public;
create view products_public as
  select id, slug, title, title_en, title_es, category, status, is_featured, created_at, visible_ops
  from products
  where status = 'published';
grant select on products_public to anon, authenticated;

create index if not exists product_images_color_idx on product_images (product_id, color_key);
