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
