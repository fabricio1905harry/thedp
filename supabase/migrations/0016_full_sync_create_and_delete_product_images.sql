-- ---------------------------------------------------------------------
-- Full Sync on CREATE and EDIT (INSERT or UPDATE)
-- Adds new image links from products.images array
-- Deletes images from product_images that were removed from products.images
-- Updates positions to match current array order
-- ---------------------------------------------------------------------

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  clean_links text[];
begin
  -- 1. Extract non-empty trimmed links from new.images array
  if new.images is not null and jsonb_typeof(new.images) = 'array' then
    select array_agg(trim(elem))
    into clean_links
    from jsonb_array_elements_text(new.images) as elem
    where trim(elem) <> '';
  end if;

  -- 2. If clean_links is null or empty, delete all product_images for this product
  if clean_links is null or array_length(clean_links, 1) is null then
    delete from public.product_images
    where product_id = new.id;
    return new;
  end if;

  -- 3. Delete any images in product_images that are no longer present in the clean_links array
  delete from public.product_images
  where product_id = new.id
    and storage_path not in (select unnest(clean_links));

  -- 4. Insert any new images that are not yet in product_images
  insert into public.product_images (product_id, storage_path, hash, position)
  select
    new.id,
    link_data.link,
    md5(new.id::text || '_' || link_data.link),
    link_data.pos - 1
  from (
    select unnest(clean_links) as link, generate_subscripts(clean_links, 1) as pos
  ) as link_data
  where not exists (
    select 1 from public.product_images pi
    where pi.product_id = new.id
      and pi.storage_path = link_data.link
  );

  -- 5. Update positions for existing images to match their array order
  update public.product_images pi
  set position = link_data.pos - 1
  from (
    select unnest(clean_links) as link, generate_subscripts(clean_links, 1) as pos
  ) as link_data
  where pi.product_id = new.id
    and pi.storage_path = link_data.link
    and pi.position <> (link_data.pos - 1);

  return new;
end;
$$;

-- Trigger runs AFTER INSERT OR UPDATE on products table
drop trigger if exists products_auto_sync_images on products;
create trigger products_auto_sync_images
  after insert or update on products
  for each row execute function sync_product_images_from_array();
