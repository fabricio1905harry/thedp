-- ---------------------------------------------------------------------
-- 0024: Sync protection (manual edits / stock overrides) + image review
--
-- 1. products.locked_fields — every field the TDP edits by hand is
--    added here and the ingest endpoint never overwrites it again; all
--    other fields keep syncing. "Reset to source" removes the lock and
--    restores the value from products.source_snapshot.
-- 2. variants.source_stock / stock_override — `stock` becomes the
--    *effective* stock (override wins over source). Sync only writes
--    source_stock; "Reset to Source Stock" clears the override.
-- 3. product_images review workflow — PENDING REVIEW / APPROVED /
--    HIDDEN / REJECTED (+ internal REPLACED for a source image that was
--    superseded by a TDP-treated version). Sync never deletes rows, so
--    rejected/replaced images are remembered by source_key and never
--    come back as new.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. products: field-level locks + last supplier snapshot + brand
-- ---------------------------------------------------------------------

alter table products
  add column if not exists locked_fields text[] not null default '{}',
  add column if not exists source_snapshot jsonb,
  add column if not exists last_synced_at timestamptz,
  add column if not exists brand text;

-- ---------------------------------------------------------------------
-- 2. variants: source stock vs manual override (per color + size)
-- ---------------------------------------------------------------------

alter table variants
  add column if not exists source_stock integer,
  add column if not exists stock_override integer
    check (stock_override is null or stock_override >= 0),
  add column if not exists override_set_at timestamptz,
  add column if not exists override_set_by uuid references customers (id) on delete set null;

update variants set source_stock = stock where source_stock is null;

create or replace function compute_variant_effective_stock()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.source_stock is null then
      new.source_stock := new.stock;
    end if;
  elsif new.stock is distinct from old.stock
        and new.source_stock is not distinct from old.source_stock
        and new.stock_override is not distinct from old.stock_override then
    -- legacy direct write to `stock` (old scripts / triggers): treat it as
    -- a new source value so the override logic below still applies.
    new.source_stock := new.stock;
  end if;

  new.stock := coalesce(new.stock_override, new.source_stock, 0);
  return new;
end;
$$;

drop trigger if exists variants_effective_stock on variants;
create trigger variants_effective_stock
  before insert or update on variants
  for each row execute function compute_variant_effective_stock();

-- ---------------------------------------------------------------------
-- 3. product_images: review workflow
-- ---------------------------------------------------------------------

alter table product_images
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists origin text not null default 'source',
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists replaces_image_id uuid references product_images (id) on delete set null,
  add column if not exists is_cover boolean not null default false,
  add column if not exists crop jsonb,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references customers (id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

alter table product_images drop constraint if exists product_images_review_status_check;
alter table product_images add constraint product_images_review_status_check
  check (review_status in ('pending_review', 'approved', 'hidden', 'rejected', 'replaced'));

alter table product_images drop constraint if exists product_images_origin_check;
alter table product_images add constraint product_images_origin_check
  check (origin in ('source', 'tdp_upload'));

-- Normalised fingerprint of a supplier image URL: same photo served at a
-- different size/resolution (WxH suffixes, ?width=, @2x, Shopify _large…)
-- maps to the same key. Pixel-identical copies under unrelated filenames
-- need a content hash (perceptual hash worker) — see docs.
create or replace function image_source_key(url text)
returns text
language sql
immutable
as $$
  select md5(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(split_part(split_part(trim(url), '?', 1), '#', 1)),
          '^https?://', ''
        ),
        -- -1200x1800 / _800x / @2x / _large / _grande / -scaled before the extension
        '([-_](\d+x\d*|\d*x\d+|small|medium|large|grande|thumb|thumbnail|scaled|compact|master)|@\dx)+(\.[a-z0-9]+)$',
        '\3'
      ),
      '\.(jpe?g|png|webp|avif|gif)$', ''
    )
  );
$$;

-- Rough quality score from the URL (no download): an un-suffixed original
-- beats any WxH-suffixed rendition; otherwise bigger WxH wins.
create or replace function image_url_quality(url text)
returns bigint
language plpgsql
immutable
as $$
declare
  m text[];
  q text;
begin
  q := lower(url);
  m := regexp_match(q, '[-_](\d+)x(\d+)(?:\.[a-z0-9]+)?(?:\?|$)');
  if m is not null then
    return m[1]::bigint * m[2]::bigint;
  end if;
  m := regexp_match(q, '[?&](?:w|width)=(\d+)');
  if m is not null then
    return m[1]::bigint * m[1]::bigint;
  end if;
  if q ~ '([-_](small|medium|thumb|thumbnail|compact))(\.[a-z0-9]+)?(\?|$)' then
    return 1;
  end if;
  return 9223372036854775807; -- treated as the original file
end;
$$;

-- Backfill: everything already in the gallery is live today, so it starts
-- APPROVED (publishing nothing new, hiding nothing that buyers see now);
-- the lowest position becomes the cover.
update product_images
set review_status = 'approved',
    source_url = coalesce(source_url, storage_path),
    source_key = coalesce(source_key, image_source_key(storage_path)),
    reviewed_at = coalesce(reviewed_at, now())
where source_key is null;

update product_images pi
set is_cover = true
from (
  select distinct on (product_id) id
  from product_images
  where review_status = 'approved'
  order by product_id, position, id
) first_img
where pi.id = first_img.id
  and not exists (
    select 1 from product_images c where c.product_id = pi.product_id and c.is_cover
  );

alter table product_images drop constraint if exists product_images_cover_must_be_approved;
alter table product_images add constraint product_images_cover_must_be_approved
  check (not is_cover or review_status = 'approved');

create unique index if not exists product_images_one_cover_idx
  on product_images (product_id) where is_cover;
create index if not exists product_images_source_key_idx
  on product_images (product_id, source_key);
create index if not exists product_images_review_status_idx
  on product_images (review_status);

-- Buyers only ever see APPROVED images (staff keep full access through
-- product_images_staff_all).
drop policy if exists product_images_public_read on product_images;
create policy product_images_public_read on product_images
  for select using (review_status = 'approved');

-- ---------------------------------------------------------------------
-- 3b. Non-destructive image sync from products.images / products.imagens
--
-- Replaces the 0013→0020 trigger, which ran on *every* product update and
-- deleted any gallery row missing from the supplier array (wiping manual
-- uploads and forgetting rejections). Now:
--   * only fires when the image columns change;
--   * never deletes;
--   * a URL whose source_key already exists for the product (in ANY state,
--     including rejected/replaced) is skipped — rejections are permanent;
--   * a higher-quality rendition of a known photo upgrades the stored URL
--     in place instead of creating a duplicate;
--   * genuinely new photos enter as PENDING REVIEW at the end of the
--     gallery and never change the cover or the product status.
-- ---------------------------------------------------------------------

create or replace function extract_image_links(images jsonb, imagens jsonb, fallback_url text)
returns text[]
language plpgsql
immutable
as $$
declare
  links text[] := array[]::text[];
  src jsonb;
  elem jsonb;
  val text;
begin
  foreach src in array array[images, imagens] loop
    exit when array_length(links, 1) is not null;
    continue when src is null or jsonb_typeof(src) = 'null';

    begin
      if jsonb_typeof(src) = 'string' then
        val := trim(src #>> '{}');
        if val like '[%' then
          src := val::jsonb;
        elsif val <> '' then
          select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), array[]::text[])
            into links from unnest(string_to_array(val, ',')) as x;
          continue;
        end if;
      end if;

      if jsonb_typeof(src) = 'array' then
        for elem in select jsonb_array_elements(src) loop
          if jsonb_typeof(elem) = 'string' then
            val := trim(elem #>> '{}');
          elsif jsonb_typeof(elem) = 'object' then
            val := trim(coalesce(
              elem ->> 'url', elem ->> 'src', elem ->> 'link', elem ->> 'storage_path',
              elem ->> 'image', elem ->> 'foto', elem ->> 'path', elem ->> 'href', ''
            ));
          else
            val := '';
          end if;
          if val <> '' then
            links := array_append(links, val);
          end if;
        end loop;
      end if;
    exception when others then
      -- malformed payload: ignore this column, try the next one
    end;
  end loop;

  if array_length(links, 1) is null and fallback_url is not null and trim(fallback_url) <> '' then
    links := array[trim(fallback_url)];
  end if;

  return links;
end;
$$;

create or replace function sync_product_images_from_array()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  links text[];
  link text;
  key text;
  existing record;
  next_pos integer;
begin
  links := extract_image_links(new.images, new.imagens, new.source_url);
  if array_length(links, 1) is null then
    return new;
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
  from product_images where product_id = new.id;

  foreach link in array links loop
    key := image_source_key(link);

    select id, storage_path, source_url, review_status, origin into existing
    from product_images
    where product_id = new.id and source_key = key
    order by (origin = 'source') desc, created_at
    limit 1;

    if found then
      -- same photo, better file: upgrade the stored source URL in place
      -- (only for untouched supplier rows; TDP uploads are never replaced)
      if existing.origin = 'source'
         and existing.review_status in ('pending_review', 'approved', 'hidden')
         and image_url_quality(link) > image_url_quality(coalesce(existing.source_url, existing.storage_path)) then
        update product_images
        set storage_path = link, source_url = link
        where id = existing.id;
      end if;
      continue;
    end if;

    insert into product_images (
      product_id, storage_path, source_url, source_key, hash, position, review_status, origin
    ) values (
      new.id, link, link, key, md5(new.id::text || '_' || link), next_pos, 'pending_review', 'source'
    );
    next_pos := next_pos + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists products_auto_sync_images on products;
create trigger products_auto_sync_images
  after insert or update of images, imagens, source_url on products
  for each row execute function sync_product_images_from_array();

-- ---------------------------------------------------------------------
-- 4. Publish guard: a product can only go (or stay) PUBLISHED with at
--    least one APPROVED image and a cover. Pending images never block.
-- ---------------------------------------------------------------------

create or replace function guard_product_publish()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (
      select 1 from product_images
      where product_id = new.id and review_status = 'approved' and is_cover
    ) then
      raise exception 'PUBLISH_REQUIRES_COVER: product % needs at least 1 APPROVED image set as MAIN IMAGE/COVER before publishing', new.slug
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_publish on products;
create trigger products_guard_publish
  before insert or update of status on products
  for each row execute function guard_product_publish();
