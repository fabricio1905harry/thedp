-- ---------------------------------------------------------------------
-- Sync both images and imagens columns to product_images table
-- (Fixes n8n integration writing to 'imagens' vs 'images' column)
-- ---------------------------------------------------------------------

alter table products add column if not exists imagens jsonb default '[]'::jsonb;

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  clean_links text[] := array[]::text[];
  raw_json jsonb;
  elem jsonb;
  elem_str text;
  str_val text;
  obj_url text;
  target_jsonb jsonb;
begin
  -- 1. Determine target_jsonb safely from new.images or new.imagens
  if new.images is not null and jsonb_typeof(new.images) <> 'null' then
    if jsonb_typeof(new.images) <> 'array' or jsonb_array_length(new.images) > 0 then
      target_jsonb := new.images;
    end if;
  end if;

  if (target_jsonb is null or target_jsonb = '[]'::jsonb) and new.imagens is not null and jsonb_typeof(new.imagens) <> 'null' then
    if jsonb_typeof(new.imagens) <> 'array' or jsonb_array_length(new.imagens) > 0 then
      target_jsonb := new.imagens;
    end if;
  end if;

  -- 2. Extract links from target_jsonb
  if target_jsonb is not null then
    if jsonb_typeof(target_jsonb) = 'array' then
      for elem in select jsonb_array_elements(target_jsonb) loop
        if jsonb_typeof(elem) = 'string' then
          elem_str := trim(both '"' from elem::text);
          if elem_str <> '' then
            clean_links := array_append(clean_links, elem_str);
          end if;
        elsif jsonb_typeof(elem) = 'object' then
          obj_url := coalesce(
            elem ->> 'url',
            elem ->> 'src',
            elem ->> 'link',
            elem ->> 'storage_path',
            elem ->> 'image',
            elem ->> 'foto',
            elem ->> 'path',
            elem ->> 'href'
          );
          if obj_url is not null and trim(obj_url) <> '' then
            clean_links := array_append(clean_links, trim(obj_url));
          end if;
        end if;
      end loop;

    elsif jsonb_typeof(target_jsonb) = 'string' then
      str_val := trim(target_jsonb #>> '{}');
      if str_val like '[%' then
        begin
          raw_json := str_val::jsonb;
          if jsonb_typeof(raw_json) = 'array' then
            for elem in select jsonb_array_elements(raw_json) loop
              if jsonb_typeof(elem) = 'string' then
                elem_str := trim(both '"' from elem::text);
                if elem_str <> '' then
                  clean_links := array_append(clean_links, elem_str);
                end if;
              elsif jsonb_typeof(elem) = 'object' then
                obj_url := coalesce(
                  elem ->> 'url',
                  elem ->> 'src',
                  elem ->> 'link',
                  elem ->> 'storage_path',
                  elem ->> 'image',
                  elem ->> 'foto',
                  elem ->> 'path',
                  elem ->> 'href'
                );
                if obj_url is not null and trim(obj_url) <> '' then
                  clean_links := array_append(clean_links, trim(obj_url));
                end if;
              end if;
            end loop;
          end if;
        exception when others then
          if str_val <> '' then
            clean_links := array_append(clean_links, str_val);
          end if;
        end;
      elsif str_val <> '' then
        if str_val like '%,%' then
          for elem_str in select unnest(string_to_array(str_val, ',')) loop
            if trim(elem_str) <> '' then
              clean_links := array_append(clean_links, trim(elem_str));
            end if;
          end loop;
        else
          clean_links := array_append(clean_links, str_val);
        end if;
      end if;
    end if;
  end if;

  -- 3. Fallback to new.source_url if clean_links is empty
  if (clean_links is null or array_length(clean_links, 1) is null) and new.source_url is not null and trim(new.source_url) <> '' then
    clean_links := array_append(clean_links, trim(new.source_url));
  end if;

  -- 4. If clean_links is empty, do NOT delete product_images
  if clean_links is null or array_length(clean_links, 1) is null then
    return new;
  end if;

  -- 5. Remove duplicates while preserving original order
  select array_agg(link order by min_pos)
  into clean_links
  from (
    select link, min(pos) as min_pos
    from (
      select unnest(clean_links) as link, generate_subscripts(clean_links, 1) as pos
    ) sub
    group by link
  ) dedup;

  -- 6. Delete any images in product_images that are no longer present in clean_links
  delete from public.product_images
  where product_id = new.id
    and storage_path not in (select unnest(clean_links));

  -- 7. Insert any new images that are not yet in product_images
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

  -- 8. Update positions for existing images to match clean_links order
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
