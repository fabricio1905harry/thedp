-- ---------------------------------------------------------------------
-- Robust Auto Sync Product Images (Handles JSONB arrays, stringified JSON, single URLs, and source_url)
-- ---------------------------------------------------------------------

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  clean_links text[] := array[]::text[];
  raw_json jsonb;
  elem text;
  str_val text;
begin
  -- 1. Try to parse new.images (whether it's a jsonb array, jsonb string, stringified json, etc.)
  if new.images is not null then
    if jsonb_typeof(new.images) = 'array' then
      for elem in select jsonb_array_elements_text(new.images) loop
        if elem is not null and trim(elem) <> '' then
          clean_links := array_append(clean_links, trim(elem));
        end if;
      end loop;
    elsif jsonb_typeof(new.images) = 'string' then
      -- #>> '{}' extracts unescaped text content from jsonb scalar string
      str_val := trim(new.images #>> '{}');
      if str_val like '[%' then
        begin
          raw_json := str_val::jsonb;
          if jsonb_typeof(raw_json) = 'array' then
            for elem in select jsonb_array_elements_text(raw_json) loop
              if elem is not null and trim(elem) <> '' then
                clean_links := array_append(clean_links, trim(elem));
              end if;
            end loop;
          end if;
        exception when others then
          if str_val <> '' then
            clean_links := array_append(clean_links, str_val);
          end if;
        end;
      elsif str_val <> '' then
        clean_links := array_append(clean_links, str_val);
      end if;
    end if;
  end if;

  -- 2. If no links found in images column, fallback to source_url if present
  if (clean_links is null or array_length(clean_links, 1) is null) and new.source_url is not null and trim(new.source_url) <> '' then
    clean_links := array_append(clean_links, trim(new.source_url));
  end if;

  -- 3. If still no links found, delete product_images for this product
  if clean_links is null or array_length(clean_links, 1) is null then
    delete from public.product_images where product_id = new.id;
    return new;
  end if;

  -- 4. Remove duplicate links from clean_links while preserving order
  select array_agg(link order by min_pos)
  into clean_links
  from (
    select link, min(pos) as min_pos
    from (
      select unnest(clean_links) as link, generate_subscripts(clean_links, 1) as pos
    ) sub
    group by link
  ) dedup;

  -- 5. Delete any images in product_images that are no longer present in clean_links
  delete from public.product_images
  where product_id = new.id
    and storage_path not in (select unnest(clean_links));

  -- 6. Insert any new images that are not yet in product_images
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

  -- 7. Update positions for existing images to match their array order
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
