-- ---------------------------------------------------------------------
-- Auto Generate & Fallback Product Images
-- ---------------------------------------------------------------------

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  clean_path text;
begin
  -- 1. Try to sync from new.images array
  if new.images is not null and jsonb_typeof(new.images) = 'array' and jsonb_array_length(new.images) > 0 then
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
  end if;

  -- 2. Try to sync from new.source_url if present
  if new.source_url is not null and trim(new.source_url) <> '' then
    clean_path := trim(new.source_url);
    if not exists (
      select 1 from public.product_images pi
      where pi.product_id = new.id
        and pi.storage_path = clean_path
    ) then
      insert into public.product_images (product_id, storage_path, hash, position)
      values (new.id, clean_path, md5(new.id::text || '_' || clean_path), 0);
    end if;
  end if;

  -- 3. Automatic Fallback: If product has NO images in product_images at all, generate default slug image
  if not exists (select 1 from public.product_images where product_id = new.id) then
    clean_path := '/images/products/' || new.slug || '.png';
    insert into public.product_images (product_id, storage_path, hash, position)
    values (new.id, clean_path, md5(new.id::text || '_' || clean_path), 0);
  end if;

  return new;
end;
$$;

-- Fire trigger AFTER INSERT OR UPDATE on any product column
drop trigger if exists products_auto_sync_images on products;
create trigger products_auto_sync_images
  after insert or update on products
  for each row execute function sync_product_images_from_array();

-- Backfill ALL products in database so EVERY product gets its product_images generated
do $$
declare
  p record;
begin
  for p in select id, slug, images, source_url from products loop
    -- Sync from images jsonb array if present
    if p.images is not null and jsonb_typeof(p.images) = 'array' and jsonb_array_length(p.images) > 0 then
      insert into public.product_images (product_id, storage_path, hash, position)
      select
        p.id,
        trim(elem),
        md5(p.id::text || '_' || trim(elem)),
        (row_number() over (partition by p.id)) - 1
      from lateral jsonb_array_elements_text(p.images) as elem
      where trim(elem) <> ''
        and not exists (
          select 1 from public.product_images pi
          where pi.product_id = p.id
            and pi.storage_path = trim(elem)
        );
    end if;

    -- Sync from source_url if present
    if p.source_url is not null and trim(p.source_url) <> '' then
      if not exists (
        select 1 from public.product_images pi
        where pi.product_id = p.id
          and pi.storage_path = trim(p.source_url)
      ) then
        insert into public.product_images (product_id, storage_path, hash, position)
        values (p.id, trim(p.source_url), md5(p.id::text || '_' || trim(p.source_url)), 0);
      end if;
    end if;

    -- Fallback: generate default image if product still has 0 images
    if not exists (select 1 from public.product_images where product_id = p.id) then
      insert into public.product_images (product_id, storage_path, hash, position)
      values (p.id, '/images/products/' || p.slug || '.png', md5(p.id::text || '_fallback'), 0);
    end if;
  end loop;
end;
$$;
