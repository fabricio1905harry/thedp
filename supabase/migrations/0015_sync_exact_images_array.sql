-- ---------------------------------------------------------------------
-- Sync Exact Image Links from products.images Array to product_images
-- (No dummy fallback generation)
-- ---------------------------------------------------------------------

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only process if new.images is a non-empty jsonb array
  if new.images is null or jsonb_typeof(new.images) <> 'array' or jsonb_array_length(new.images) = 0 then
    return new;
  end if;

  -- Insert exact links from new.images array if not already in product_images for this product
  insert into public.product_images (product_id, storage_path, hash, position)
  select
    new.id,
    trim(elem),
    md5(new.id::text || '_' || trim(elem)),
    (row_number() over ()) - 1
  from jsonb_array_elements_text(new.images) as elem
  where trim(elem) <> ''
    and not exists (
      select 1 from public.product_images pi
      where pi.product_id = new.id
        and pi.storage_path = trim(elem)
    );

  return new;
end;
$$;

-- Trigger fires on insert or update of images column on products
drop trigger if exists products_auto_sync_images on products;
create trigger products_auto_sync_images
  after insert or update of images on products
  for each row execute function sync_product_images_from_array();

-- Backfill exact links from products.images array to product_images
insert into public.product_images (product_id, storage_path, hash, position)
select
  p.id,
  trim(elem),
  md5(p.id::text || '_' || trim(elem)),
  (row_number() over (partition by p.id)) - 1
from products p,
lateral jsonb_array_elements_text(p.images) as elem
where p.images is not null
  and jsonb_typeof(p.images) = 'array'
  and trim(elem) <> ''
  and not exists (
    select 1 from public.product_images pi
    where pi.product_id = p.id
      and pi.storage_path = trim(elem)
  );
