-- The Dressing Project — apply migrations 0024 → 0028 in one go.
-- Paste into Supabase (project thedress) → SQL Editor → Run.
-- Safe to re-run (idempotent). Requires 0001–0023 already applied.

begin;

-- ====================================================================
-- 0024_sync_protection_and_image_review.sql
-- ====================================================================
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

-- ====================================================================
-- 0025_channels_and_payments.sql
-- ====================================================================
-- ---------------------------------------------------------------------
-- 0025: Sales channels, payment-method availability hierarchy and a
--       per-transaction payments ledger.
--
-- Payment availability: channel default → customer exception → order
-- exception; the most specific rule wins (see available_payment_methods).
--
-- Bank Processing Fee: charged PER Bank Transfer payment (a Reserve
-- deposit + a later balance by transfer = two fees). Configured in BRL in
-- app_settings and converted to the order currency at payment creation;
-- the BRL value and the converted amount are snapshotted on the row.
--
-- Revenue/margin: each payment stores its own breakdown (merchandise vs
-- pass-through charges) and the cost of goods it recognises, so history
-- never changes when prices, FX or orders change later.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- order lifecycle statuses used by the payment / confirmation flow
--   order_request → stock_confirmation → (awaiting_buyer_decision) →
--   confirmed_awaiting_payment | payment_coordination_required →
--   (payment_window_expired) → reserved | paid → processing → shipped …
-- 'created' is kept for orders placed before this migration.
-- ---------------------------------------------------------------------

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in (
  'created', 'order_request', 'stock_confirmation', 'awaiting_buyer_decision',
  'confirmed_awaiting_payment', 'payment_coordination_required', 'payment_window_expired',
  'reserved', 'paid', 'processing', 'shipped', 'delivered', 'canceled'
));

-- ---------------------------------------------------------------------
-- settings (key/value, editable in the Admin)
-- ---------------------------------------------------------------------

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null
);

alter table app_settings enable row level security;
drop policy if exists app_settings_staff on app_settings;
create policy app_settings_staff on app_settings for all using (is_staff()) with check (is_staff());
grant all on app_settings to service_role;

insert into app_settings (key, value) values
  ('bank_processing_fee_brl', '135'::jsonb),
  ('reserve_markup_pct', '10'::jsonb),
  ('margin_target_pct', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function get_setting_numeric(p_key text)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric end
  from app_settings where key = p_key;
$$;

-- BRL per 1 unit of `cur` from the latest fx_rates row (1 for BRL).
create or replace function latest_brl_rate(cur text)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select case
    when upper(cur) = 'BRL' then 1::numeric
    else (select rate from fx_rates where base = 'BRL' and quote = upper(cur)
          order by fetched_at desc limit 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------

create table if not exists sales_channels (
  code text primary key,
  name text not null,
  default_currency text not null,
  sort integer not null default 0
);

insert into sales_channels (code, name, default_currency, sort) values
  ('intl_b2b', 'International B2B', 'USD', 1),
  ('intl_b2c', 'International B2C', 'USD', 2),
  ('br_b2b', 'Brazil B2B', 'BRL', 3),
  ('br_b2c', 'Brazil B2C', 'BRL', 4)
on conflict (code) do nothing;

alter table sales_channels enable row level security;
drop policy if exists sales_channels_read on sales_channels;
create policy sales_channels_read on sales_channels for select using (true);
drop policy if exists sales_channels_staff on sales_channels;
create policy sales_channels_staff on sales_channels for all using (is_staff()) with check (is_staff());
grant select on sales_channels to anon, authenticated;
grant all on sales_channels to service_role;

alter table customers add column if not exists channel text references sales_channels (code);
update customers
set channel = case when customer_type = 'business' then 'intl_b2b' else 'intl_b2c' end
where channel is null;

alter table orders add column if not exists channel text references sales_channels (code);
update orders o
set channel = coalesce(c.channel, 'intl_b2c')
from customers c
where c.id = o.customer_id and o.channel is null;

create or replace function orders_default_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.channel is null then
    select channel into new.channel from customers where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_default_channel on orders;
create trigger orders_default_channel
  before insert on orders
  for each row execute function orders_default_channel();

-- ---------------------------------------------------------------------
-- payment methods + availability rules
-- ---------------------------------------------------------------------

create table if not exists payment_methods (
  code text primary key,
  name text not null,
  active boolean not null default true,
  sort integer not null default 0
);

insert into payment_methods (code, name, sort) values
  ('bank_transfer', 'Bank Transfer', 1),
  ('stripe_card', 'Card / Stripe', 2),
  ('pix', 'Pix', 3)
on conflict (code) do nothing;

create table if not exists payment_method_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('channel', 'customer', 'order')),
  channel_code text references sales_channels (code) on delete cascade,
  customer_id uuid references customers (id) on delete cascade,
  order_id uuid references orders (id) on delete cascade,
  method_code text not null references payment_methods (code) on delete cascade,
  enabled boolean not null,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  constraint payment_method_rules_scope_target check (
    (scope = 'channel' and channel_code is not null and customer_id is null and order_id is null) or
    (scope = 'customer' and customer_id is not null and channel_code is null and order_id is null) or
    (scope = 'order' and order_id is not null and channel_code is null and customer_id is null)
  )
);

create unique index if not exists payment_method_rules_channel_uq
  on payment_method_rules (channel_code, method_code) where scope = 'channel';
create unique index if not exists payment_method_rules_customer_uq
  on payment_method_rules (customer_id, method_code) where scope = 'customer';
create unique index if not exists payment_method_rules_order_uq
  on payment_method_rules (order_id, method_code) where scope = 'order';

-- Initial channel defaults (editable in Admin → Payments):
-- Bank Transfer everywhere; Stripe off for International B2B (example
-- from the spec), on elsewhere; Pix only on Brazil channels.
insert into payment_method_rules (scope, channel_code, method_code, enabled)
select 'channel', ch.code, pm.code,
  case
    when pm.code = 'bank_transfer' then true
    when pm.code = 'stripe_card' then ch.code <> 'intl_b2b'
    when pm.code = 'pix' then ch.code like 'br_%'
    else false
  end
from sales_channels ch cross join payment_methods pm
on conflict do nothing;

alter table payment_methods enable row level security;
alter table payment_method_rules enable row level security;
drop policy if exists payment_methods_read on payment_methods;
create policy payment_methods_read on payment_methods for select using (true);
drop policy if exists payment_methods_staff on payment_methods;
create policy payment_methods_staff on payment_methods for all using (is_staff()) with check (is_staff());
drop policy if exists payment_method_rules_staff on payment_method_rules;
create policy payment_method_rules_staff on payment_method_rules for all using (is_staff()) with check (is_staff());
grant select on payment_methods to anon, authenticated;
grant all on payment_methods, payment_method_rules to service_role;

-- Effective availability for an order: the most specific rule wins.
-- A method with no rule at any level is unavailable.
create or replace function available_payment_methods(p_order_id uuid)
returns table (method_code text, method_name text, enabled boolean, decided_by text)
language sql
stable
security definer set search_path = public
as $$
  with o as (
    select o.id, o.customer_id, coalesce(o.channel, c.channel) as channel
    from orders o left join customers c on c.id = o.customer_id
    where o.id = p_order_id
      and (o.customer_id = auth.uid() or is_staff() or auth.uid() is null)
  )
  select pm.code, pm.name,
    coalesce(r_order.enabled, r_cust.enabled, r_chan.enabled, false) and pm.active,
    case
      when r_order.enabled is not null then 'order'
      when r_cust.enabled is not null then 'customer'
      when r_chan.enabled is not null then 'channel'
      else 'none'
    end
  from o
  cross join payment_methods pm
  left join payment_method_rules r_order
    on r_order.scope = 'order' and r_order.order_id = o.id and r_order.method_code = pm.code
  left join payment_method_rules r_cust
    on r_cust.scope = 'customer' and r_cust.customer_id = o.customer_id and r_cust.method_code = pm.code
  left join payment_method_rules r_chan
    on r_chan.scope = 'channel' and r_chan.channel_code = o.channel and r_chan.method_code = pm.code
  order by pm.sort;
$$;

revoke execute on function available_payment_methods(uuid) from public;
grant execute on function available_payment_methods(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- cost snapshot on order lines (needed for margin by transaction)
-- ---------------------------------------------------------------------

alter table order_items
  add column if not exists unit_cost_brl numeric(12, 2),
  add column if not exists product_id uuid references products (id) on delete set null,
  add column if not exists product_title text,
  add column if not exists brand text,
  add column if not exists sku text,
  add column if not exists color text,
  add column if not exists size text;

create or replace function snapshot_order_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select
    coalesce(new.product_id, p.id),
    coalesce(new.product_title, p.title),
    coalesce(new.brand, p.brand, c.supplier_name),
    coalesce(new.sku, v.sku),
    coalesce(new.color, v.color),
    coalesce(new.size, v.size),
    coalesce(new.unit_cost_brl, p.original_price)
  into new.product_id, new.product_title, new.brand, new.sku, new.color, new.size, new.unit_cost_brl
  from variants v
  join products p on p.id = v.product_id
  left join connectors c on c.id = p.connector_id
  where v.id = new.variant_id;
  return new;
end;
$$;

drop trigger if exists order_items_snapshot on order_items;
create trigger order_items_snapshot
  before insert or update of variant_id on order_items
  for each row execute function snapshot_order_item();

update order_items set variant_id = variant_id where unit_cost_brl is null;

-- ---------------------------------------------------------------------
-- payments ledger (one row per transaction)
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists payment_mode text not null default 'standard'
    check (payment_mode in ('standard', 'reserve')),
  add column if not exists reserve_amount numeric(12, 2),
  add column if not exists reserve_pct_of_sale numeric(7, 4),
  add column if not exists reserved_at timestamptz;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  method_code text not null references payment_methods (code),
  kind text not null default 'full' check (kind in ('full', 'reserve_deposit', 'balance', 'other')),
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'confirmed', 'rejected', 'refunded', 'chargeback', 'canceled')),
  currency text not null,

  -- breakdown, all in `currency`. amount is always the sum (trigger).
  merchandise_amount numeric(12, 2) not null default 0,
  freight_amount numeric(12, 2) not null default 0,
  insurance_amount numeric(12, 2) not null default 0,
  fuel_surcharge_amount numeric(12, 2) not null default 0,
  demand_surcharge_amount numeric(12, 2) not null default 0,
  export_declaration_amount numeric(12, 2) not null default 0,
  other_dhl_amount numeric(12, 2) not null default 0,
  duties_taxes_amount numeric(12, 2) not null default 0,
  bank_fee_amount numeric(12, 2) not null default 0,
  other_charges_amount numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,

  bank_fee_brl numeric(12, 2),            -- Admin config at creation
  received_amount numeric(12, 2),         -- what actually landed (Payment Difference when ≠ amount)
  fx_rate_brl numeric(14, 6),             -- BRL per 1 `currency` at confirmation (dashboard only)
  cogs_recognized_brl numeric(12, 2) not null default 0, -- product cost recognised by THIS payment

  external_ref text,
  proof_url text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_order_idx on payments (order_id);
create index if not exists payments_confirmed_at_idx on payments (confirmed_at) where status = 'confirmed';

create or replace function payments_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  fee_brl numeric;
  rate numeric;
  cost numeric;
begin
  -- Bank Processing Fee: one per Bank Transfer payment, BRL config
  -- converted to the payment currency. Snapshotted on insert only.
  if tg_op = 'INSERT' and new.method_code = 'bank_transfer' and new.bank_fee_brl is null then
    fee_brl := coalesce(get_setting_numeric('bank_processing_fee_brl'), 0);
    rate := latest_brl_rate(new.currency);
    if fee_brl > 0 and (rate is null or rate <= 0) then
      raise exception 'FX_RATE_MISSING: cannot convert the Bank Processing Fee to %', new.currency;
    end if;
    new.bank_fee_brl := fee_brl;
    new.bank_fee_amount := case when fee_brl > 0 then round(fee_brl / rate, 2) else 0 end;
  end if;

  new.amount := new.merchandise_amount + new.freight_amount + new.insurance_amount
    + new.fuel_surcharge_amount + new.demand_surcharge_amount + new.export_declaration_amount
    + new.other_dhl_amount + new.duties_taxes_amount + new.bank_fee_amount + new.other_charges_amount;

  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.fx_rate_brl := coalesce(new.fx_rate_brl, latest_brl_rate(new.currency));
    new.received_amount := coalesce(new.received_amount, new.amount);

    -- Margin: the FIRST confirmed payment that carries merchandise
    -- recognises 100% of the order's product cost; later payments (e.g.
    -- Reserve balance) recognise revenue only.
    if new.merchandise_amount > 0 and not exists (
      select 1 from payments p
      where p.order_id = new.order_id and p.status = 'confirmed'
        and p.cogs_recognized_brl > 0 and p.id <> new.id
    ) then
      select coalesce(sum(oi.qty * coalesce(oi.unit_cost_brl, 0)), 0) into cost
      from order_items oi
      where oi.order_id = new.order_id
        and coalesce(oi.item_status, 'available') not in ('unavailable_out_of_stock', 'unavailable_order_only', 'removed');
      new.cogs_recognized_brl := cost;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- order_items.item_status drives Order Request confirmation (checked
-- constraint + lost-sales trigger live in 0026).
alter table order_items add column if not exists item_status text not null default 'requested';

drop trigger if exists payments_before_write on payments;
create trigger payments_before_write
  before insert or update on payments
  for each row execute function payments_before_write();

-- Reserve: goods are only reserved once the deposit is CONFIRMED.
create or replace function payments_after_confirm()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  paid numeric;
  due numeric;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return new;
  end if;

  if new.kind = 'reserve_deposit' then
    update orders set reserved_at = coalesce(reserved_at, new.confirmed_at), status = 'reserved'
    where id = new.order_id and status not in ('paid', 'processing', 'shipped', 'delivered');
  else
    select coalesce(sum(merchandise_amount), 0) into paid
    from payments where order_id = new.order_id and status = 'confirmed';
    select subtotal into due from orders where id = new.order_id;
    if paid >= coalesce(due, 0) then
      update orders set status = 'paid'
      where id = new.order_id and status not in ('paid', 'processing', 'shipped', 'delivered');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_after_confirm on payments;
create trigger payments_after_confirm
  after insert or update of status on payments
  for each row execute function payments_after_confirm();

alter table payments enable row level security;
drop policy if exists payments_owner_read on payments;
create policy payments_owner_read on payments for select using (
  is_staff() or exists (select 1 from orders o where o.id = payments.order_id and o.customer_id = auth.uid())
);
drop policy if exists payments_staff_write on payments;
create policy payments_staff_write on payments for all using (is_staff()) with check (is_staff());
grant select on payments to authenticated;
grant all on payments to service_role;

-- ====================================================================
-- 0026_order_confirmation_stock_hold_lost_sales.sql
-- ====================================================================
-- ---------------------------------------------------------------------
-- 0026: Order Request confirmation, Temporary Stock Hold, Lost Sales and
--       Restock Opportunities.
--
-- * order_items.item_status — per-line availability decided by the TDP
--   while confirming an Order Request. Lines can be added, removed,
--   substituted (substitutes_item_id) or re-quantified before the
--   Confirmed Order is generated.
--     UNAVAILABLE — OUT OF STOCK  → variant becomes unavailable in the
--       catalog (source_stock := 0) + LOST SALE recorded.
--     UNAVAILABLE — ORDER ONLY / OTHER REASON → affects this order only.
-- * Temporary Stock Hold (≠ Reserve Order): 24h / 48h / custom /
--   cannot_reserve, counted from when the Confirmed Order is released for
--   payment. expire_unpaid_orders() is run by the cron route.
-- * Restock: when a sync brings source_stock of a variant with LOST
--   history back above zero, its lost sales become RESTOCK OPPORTUNITY
--   (history is never deleted).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- order lines
-- ---------------------------------------------------------------------

alter table order_items drop constraint if exists order_items_item_status_check;
alter table order_items add constraint order_items_item_status_check check (item_status in (
  'requested', 'available', 'unavailable_out_of_stock', 'unavailable_order_only', 'removed'
));

alter table order_items
  add column if not exists unavailable_note text,
  add column if not exists substitutes_item_id uuid references order_items (id) on delete set null,
  add column if not exists added_by_tdp boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- orders: confirmation + temporary stock hold
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists stock_hold_type text
    check (stock_hold_type in ('24h', '48h', 'custom', 'cannot_reserve')),
  add column if not exists stock_hold_until timestamptz,
  add column if not exists payment_released_at timestamptz,
  add column if not exists payment_window_expired_at timestamptz;

-- Confirmed Order → released for payment with the chosen stock hold.
-- Re-callable after expiry/coordination: the TDP reconfirms stock and
-- recalculates values in the app first, then calls this again.
create or replace function release_order_for_payment(
  p_order_id uuid,
  p_hold_type text,
  p_custom_until timestamptz default null
)
returns orders
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if not is_staff() and auth.uid() is not null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_hold_type not in ('24h', '48h', 'custom', 'cannot_reserve') then
    raise exception 'INVALID_HOLD_TYPE: %', p_hold_type;
  end if;
  if p_hold_type = 'custom' and (p_custom_until is null or p_custom_until <= now()) then
    raise exception 'CUSTOM_HOLD_NEEDS_FUTURE_DATE';
  end if;

  update orders set
    confirmed_at = coalesce(confirmed_at, now()),
    stock_hold_type = p_hold_type,
    payment_released_at = case when p_hold_type = 'cannot_reserve' then null else now() end,
    stock_hold_until = case p_hold_type
      when '24h' then now() + interval '24 hours'
      when '48h' then now() + interval '48 hours'
      when 'custom' then p_custom_until
      else null end,
    payment_window_expired_at = null,
    status = case when p_hold_type = 'cannot_reserve'
      then 'payment_coordination_required' else 'confirmed_awaiting_payment' end
  where id = p_order_id
    and status not in ('reserved', 'paid', 'processing', 'shipped', 'delivered', 'canceled')
  returning * into o;

  if o.id is null then
    raise exception 'ORDER_NOT_RELEASABLE';
  end if;
  return o;
end;
$$;

revoke execute on function release_order_for_payment(uuid, text, timestamptz) from public;
grant execute on function release_order_for_payment(uuid, text, timestamptz) to authenticated, service_role;

-- Buyer-facing: is payment open right now?
create or replace function order_payment_open(o orders)
returns boolean
language sql
stable
as $$
  select o.status = 'confirmed_awaiting_payment'
     and o.payment_released_at is not null
     and (o.stock_hold_until is null or o.stock_hold_until > now());
$$;

-- transactional e-mail queue (sent by a worker once an e-mail provider is
-- configured — nothing sends from the database itself)
create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  locale text not null default 'en',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table email_outbox enable row level security;
drop policy if exists email_outbox_staff on email_outbox;
create policy email_outbox_staff on email_outbox for all using (is_staff()) with check (is_staff());
grant all on email_outbox to service_role;

-- Expire unpaid hold windows: status PAYMENT WINDOW EXPIRED, payment off,
-- stock no longer held, order kept, buyer e-mail queued. The Action
-- Center item is raised by the orders trigger in 0027.
create or replace function expire_unpaid_orders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  with expired as (
    update orders o set
      status = 'payment_window_expired',
      payment_window_expired_at = now(),
      payment_released_at = null
    where o.status = 'confirmed_awaiting_payment'
      and o.stock_hold_until is not null
      and o.stock_hold_until <= now()
      and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'confirmed')
    returning o.id, o.order_number, o.customer_id
  ), mails as (
    insert into email_outbox (to_email, template, locale, payload)
    select c.email, 'payment_window_expired', c.locale,
           jsonb_build_object('order_id', e.id, 'order_number', e.order_number)
    from expired e join customers c on c.id = e.customer_id
    returning 1
  )
  select count(*) into n from expired;
  return n;
end;
$$;

revoke execute on function expire_unpaid_orders() from public;
grant execute on function expire_unpaid_orders() to service_role;

-- ---------------------------------------------------------------------
-- Lost sales
-- ---------------------------------------------------------------------

create table if not exists lost_sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  order_item_id uuid unique references order_items (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  product_id uuid references products (id) on delete set null,
  variant_id uuid references variants (id) on delete set null,
  product_code text,
  product_title text,
  brand text,
  color text,
  size text,
  quantity integer not null,
  unit_price numeric(12, 2) not null default 0,
  potential_value numeric(12, 2) not null default 0,
  currency text not null,
  channel text references sales_channels (code),
  status text not null default 'lost'
    check (status in ('lost', 'restock_opportunity', 'contacted', 'recovered', 'not_recovered')),
  restocked_at timestamptz,
  contacted_at timestamptz,
  closed_at timestamptz,
  recovered_order_id uuid references orders (id) on delete set null,
  recovered_units integer not null default 0,
  recovered_revenue numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lost_sales_variant_idx on lost_sales (variant_id, status);
create index if not exists lost_sales_created_idx on lost_sales (created_at);

alter table lost_sales enable row level security;
drop policy if exists lost_sales_staff on lost_sales;
create policy lost_sales_staff on lost_sales for all using (is_staff()) with check (is_staff());
grant all on lost_sales to service_role;

create or replace function order_items_after_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if new.item_status = 'unavailable_out_of_stock'
     and (tg_op = 'INSERT' or old.item_status is distinct from 'unavailable_out_of_stock') then
    select * into o from orders where id = new.order_id;

    insert into lost_sales (
      order_id, order_item_id, customer_id, product_id, variant_id, product_code, product_title,
      brand, color, size, quantity, unit_price, potential_value, currency, channel
    ) values (
      new.order_id, new.id, o.customer_id, new.product_id, new.variant_id, new.sku, new.product_title,
      new.brand, new.color, new.size, new.qty, new.unit_price, round(new.qty * new.unit_price, 2),
      o.currency, o.channel
    )
    on conflict (order_item_id) do nothing;

    -- confirmed out of stock at the supplier → unavailable in the catalog
    -- too. Written to source_stock (not to the manual override) so the
    -- next sync that reports stock again re-opens it and flags a restock.
    update variants set source_stock = 0 where id = new.variant_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_after_status on order_items;
create trigger order_items_after_status
  after insert or update of item_status on order_items
  for each row execute function order_items_after_status();

-- Restock detection on supplier stock coming back.
create or replace function variants_detect_restock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(old.source_stock, 0) <= 0 and coalesce(new.source_stock, 0) > 0 then
    update lost_sales
    set status = 'restock_opportunity', restocked_at = now()
    where variant_id = new.id and status = 'lost';
  end if;
  return new;
end;
$$;

drop trigger if exists variants_detect_restock on variants;
create trigger variants_detect_restock
  after update on variants
  for each row execute function variants_detect_restock();

-- ====================================================================
-- 0027_action_center.sql
-- ====================================================================
-- ---------------------------------------------------------------------
-- 0027: Action Center (Central de Pendências)
--
-- * action_types — extensible catalog (one row per card). New features
--   register a type and call raise_action()/resolve_action().
-- * action_items — the ACTION REQUIRED queue. One OPEN item per
--   dedupe_key; history is kept (resolved items stay, closed).
--   Items are closed automatically by the action that solves them
--   (resolution = 'auto'); 'manual' only via Mark as Resolved.
-- * system_events — Information/History (sync completed, FX updated,
--   cost changed with margin OK…). Never shown as pending.
--
-- Priority groups (lower = more urgent):
--   1 money ready to come in · 2 sale in progress · 3 recoverable revenue
--   4 paid order / operational commitment · 5 financial/commercial risk
--   6 catalog expansion/curation. Severity CRITICAL overrides the group.
-- ---------------------------------------------------------------------

create table if not exists action_types (
  code text primary key,
  label text not null,
  priority_group smallint not null check (priority_group between 1 and 6),
  default_severity text not null default 'normal' check (default_severity in ('critical', 'high', 'normal')),
  card_href text,
  manual_resolve boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true
);

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('payments_to_verify',            'Payments to Verify',                       1, 'high',     '/admin/acoes?type=payments_to_verify', false, 10),
  ('payment_difference',            'Payment Differences',                      1, 'high',     '/admin/acoes?type=payment_difference', true, 11),
  ('customer_approval',             'Customer Approvals',                       2, 'normal',   '/admin/clientes', false, 19),
  ('order_request',                 'Order Requests',                           2, 'high',     '/admin/acoes?type=order_request', false, 20),
  ('stock_confirmation_pending',    'Stock Confirmation Pending',               2, 'high',     '/admin/acoes?type=stock_confirmation_pending', false, 21),
  ('buyer_decision_pending',        'Buyer Decision/Substitution Pending',      2, 'normal',   '/admin/acoes?type=buyer_decision_pending', false, 22),
  ('payment_coordination_required', 'Payment Coordination Required',            2, 'high',     '/admin/acoes?type=payment_coordination_required', false, 23),
  ('expired_unpaid_order',          'Expired Unpaid Orders / Follow-up Required', 2, 'high',   '/admin/acoes?type=expired_unpaid_order', true, 24),
  ('restock_opportunity',           'Restock Opportunities',                    3, 'normal',   '/admin/vendas-perdidas?status=restock_opportunity', false, 30),
  ('reserve_actions',               'Reserve Actions',                          4, 'high',     '/admin/acoes?type=reserve_actions', true, 40),
  ('ready_for_fulfillment',         'Ready for Fulfillment',                    4, 'high',     '/admin/acoes?type=ready_for_fulfillment', false, 41),
  ('dhl_quote_required',            'DHL Quote Required',                       4, 'high',     '/admin/acoes?type=dhl_quote_required', false, 42),
  ('dhl_shipping_actions',          'DHL / Shipping Actions',                   4, 'high',     '/admin/acoes?type=dhl_shipping_actions', false, 43),
  ('dhl_errors',                    'DHL Errors',                               4, 'critical', '/admin/acoes?type=dhl_errors', true, 44),
  ('export_documentation_required', 'Export Documentation / NF Number Required', 4, 'high',    '/admin/acoes?type=export_documentation_required', false, 45),
  ('chargeback_cancellation',       'Chargeback / Cancellation Actions',        5, 'critical', '/admin/acoes?type=chargeback_cancellation', true, 50),
  ('margin_below_target',           'Margin Below Target',                      5, 'normal',   '/admin/acoes?type=margin_below_target', false, 51),
  ('sync_issues',                   'Sync Issues',                              5, 'high',     '/admin/acoes?type=sync_issues', true, 52),
  ('fx_update_failed',              'FX Update Failed',                         5, 'high',     '/admin/cambio', false, 53),
  ('products_to_review',            'Products to Review',                       6, 'normal',   '/admin/acoes?type=products_to_review', false, 60),
  ('category_review_required',      'Category Review Required',                 6, 'normal',   '/admin/acoes?type=category_review_required', false, 61),
  ('shipping_data_required',        'Shipping Data Required',                   6, 'normal',   '/admin/acoes?type=shipping_data_required', false, 62),
  ('images_to_review',              'Images to Review',                         6, 'normal',   '/admin/imagens', false, 63),
  ('content_to_review',             'Content to Review',                        6, 'normal',   '/admin/acoes?type=content_to_review', true, 64)
on conflict (code) do nothing;

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  action_type text not null references action_types (code),
  priority_group smallint not null,
  severity text not null default 'normal' check (severity in ('critical', 'high', 'normal')),
  title text not null,
  reference_type text,
  reference_id uuid,
  reference_label text,
  subject_label text,
  value_amount numeric(14, 2),
  value_currency text,
  value_brl numeric(14, 2),
  affected_count integer not null default 1,
  href text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('auto', 'manual')),
  pinned boolean not null default false,
  pinned_at timestamptz,
  pinned_by uuid references customers (id) on delete set null,
  dedupe_key text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references customers (id) on delete set null
);

create unique index if not exists action_items_open_dedupe_uq on action_items (dedupe_key) where status = 'open';
create index if not exists action_items_open_idx on action_items (status, action_type);
create index if not exists action_items_reference_idx on action_items (reference_type, reference_id);

create table if not exists system_events (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  event_type text not null,
  message text not null,
  reference_type text,
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists system_events_created_idx on system_events (created_at desc);

alter table action_types enable row level security;
alter table action_items enable row level security;
alter table system_events enable row level security;
drop policy if exists action_types_staff on action_types;
create policy action_types_staff on action_types for all using (is_staff()) with check (is_staff());
drop policy if exists action_items_staff on action_items;
create policy action_items_staff on action_items for all using (is_staff()) with check (is_staff());
drop policy if exists system_events_staff on system_events;
create policy system_events_staff on system_events for all using (is_staff()) with check (is_staff());
grant all on action_types, action_items, system_events to service_role;

-- ---------------------------------------------------------------------
-- API used by triggers and by app code (service role)
-- ---------------------------------------------------------------------

create or replace function raise_action(
  p_type text,
  p_dedupe text,
  p_title text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reference_label text default null,
  p_subject text default null,
  p_value numeric default null,
  p_currency text default null,
  p_count integer default 1,
  p_href text default null,
  p_severity text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  t action_types;
  rid uuid;
  rate numeric;
begin
  select * into t from action_types where code = p_type;
  if t.code is null then
    raise exception 'UNKNOWN_ACTION_TYPE: %', p_type;
  end if;
  if p_value is not null and p_currency is not null then
    rate := latest_brl_rate(p_currency);
  end if;

  insert into action_items (
    action_type, priority_group, severity, title, reference_type, reference_id, reference_label,
    subject_label, value_amount, value_currency, value_brl, affected_count, href, dedupe_key, metadata
  ) values (
    p_type, t.priority_group, coalesce(p_severity, t.default_severity), p_title, p_reference_type,
    p_reference_id, p_reference_label, p_subject, p_value, p_currency,
    case when rate is not null then round(p_value * rate, 2) end,
    coalesce(p_count, 1), p_href, p_dedupe, p_metadata
  )
  on conflict (dedupe_key) where status = 'open' do update set
    title = excluded.title,
    severity = excluded.severity,
    reference_label = excluded.reference_label,
    subject_label = excluded.subject_label,
    value_amount = excluded.value_amount,
    value_currency = excluded.value_currency,
    value_brl = excluded.value_brl,
    affected_count = excluded.affected_count,
    href = excluded.href,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into rid;
  return rid;
end;
$$;

create or replace function resolve_action(p_dedupe text, p_resolution text default 'auto', p_by uuid default null)
returns void
language sql
security definer set search_path = public
as $$
  update action_items
  set status = 'resolved', resolution = p_resolution, resolved_at = now(), resolved_by = p_by, updated_at = now()
  where dedupe_key = p_dedupe and status = 'open';
$$;

create or replace function log_system_event(
  p_level text, p_type text, p_message text,
  p_reference_type text default null, p_reference_id uuid default null, p_metadata jsonb default null
)
returns void
language sql
security definer set search_path = public
as $$
  insert into system_events (level, event_type, message, reference_type, reference_id, metadata)
  values (p_level, p_type, p_message, p_reference_type, p_reference_id, p_metadata);
$$;

revoke execute on function raise_action(text, text, text, text, uuid, text, text, numeric, text, integer, text, text, jsonb) from public;
revoke execute on function resolve_action(text, text, uuid) from public;
revoke execute on function log_system_event(text, text, text, text, uuid, jsonb) from public;
grant execute on function raise_action(text, text, text, text, uuid, text, text, numeric, text, integer, text, text, jsonb) to service_role;
grant execute on function resolve_action(text, text, uuid) to service_role;
grant execute on function log_system_event(text, text, text, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Feeders
-- ---------------------------------------------------------------------

-- Images to Review: one queue item per product, count = pending images.
create or replace function action_feed_product_images()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pid uuid;
  n integer;
  p products;
begin
  pid := coalesce(new.product_id, old.product_id);
  select count(*) into n from product_images where product_id = pid and review_status = 'pending_review';
  if n > 0 then
    select * into p from products where id = pid;
    perform raise_action(
      'images_to_review', 'images_to_review:' || pid,
      n || ' image(s) to review', 'product', pid, p.slug, p.title,
      null, null, n, '/admin/imagens?product=' || pid
    );
  else
    perform resolve_action('images_to_review:' || pid);
  end if;
  return null;
end;
$$;

drop trigger if exists product_images_action_feed on product_images;
create trigger product_images_action_feed
  after insert or update of review_status or delete on product_images
  for each row execute function action_feed_product_images();

-- Products: review / category / shipping data / margin.
create or replace function action_feed_products()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target numeric;
  margin numeric;
  href text := '/admin/produtos/' || new.id;
begin
  if new.status = 'draft' then
    perform raise_action('products_to_review', 'products_to_review:' || new.id,
      'Product waiting for review', 'product', new.id, new.slug, new.title,
      new.price_brl, 'BRL', 1, href);
  else
    perform resolve_action('products_to_review:' || new.id);
  end if;

  if new.status <> 'archived' and coalesce(trim(new.category), '') = '' then
    perform raise_action('category_review_required', 'category_review_required:' || new.id,
      'Category missing', 'product', new.id, new.slug, new.title, null, null, 1, href);
  else
    perform resolve_action('category_review_required:' || new.id);
  end if;

  if new.status <> 'archived' and (new.weight_g is null or coalesce(trim(new.hs_code), '') = '') then
    perform raise_action('shipping_data_required', 'shipping_data_required:' || new.id,
      'Weight / HS code missing', 'product', new.id, new.slug, new.title, null, null, 1, href);
  else
    perform resolve_action('shipping_data_required:' || new.id);
  end if;

  target := get_setting_numeric('margin_target_pct');
  if target is not null and new.status <> 'archived' and coalesce(new.price_brl, 0) > 0 then
    margin := (new.price_brl - new.original_price) / new.price_brl * 100;
    if margin < target then
      perform raise_action('margin_below_target', 'margin_below_target:' || new.id,
        'Margin ' || round(margin, 1) || '% (target ' || target || '%)', 'product', new.id, new.slug,
        new.title, new.price_brl, 'BRL', 1, href);
    else
      perform resolve_action('margin_below_target:' || new.id);
      if tg_op = 'UPDATE' and new.original_price is distinct from old.original_price then
        perform log_system_event('info', 'source_cost_changed',
          'Source cost changed, margin OK (' || round(margin, 1) || '%)', 'product', new.id,
          jsonb_build_object('from', old.original_price, 'to', new.original_price));
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists products_action_feed on products;
create trigger products_action_feed
  after insert or update of status, category, weight_g, hs_code, price_brl, original_price on products
  for each row execute function action_feed_products();

-- Orders: one "stage" item at a time, replaced as the order advances.
create or replace function action_feed_orders()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  stage_type text;
  stage_title text;
  who text;
  href text := '/admin/pedidos/' || new.id;
  ref text := coalesce(new.order_number, left(new.id::text, 8));
  sev text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  select coalesce(nullif(company_name, ''), nullif(name, ''), email) into who
  from customers where id = new.customer_id;

  -- the previous stage is solved by moving forward
  update action_items
  set status = 'resolved', resolution = 'auto', resolved_at = now(), updated_at = now()
  where status = 'open' and reference_type = 'order' and reference_id = new.id
    and action_type in ('order_request', 'stock_confirmation_pending', 'buyer_decision_pending',
      'payment_coordination_required', 'expired_unpaid_order', 'reserve_actions', 'ready_for_fulfillment');

  stage_type := case new.status
    when 'order_request' then 'order_request'
    when 'created' then 'order_request'
    when 'stock_confirmation' then 'stock_confirmation_pending'
    when 'awaiting_buyer_decision' then 'buyer_decision_pending'
    when 'payment_coordination_required' then 'payment_coordination_required'
    when 'payment_window_expired' then 'expired_unpaid_order'
    when 'reserved' then 'reserve_actions'
    when 'paid' then 'ready_for_fulfillment'
    when 'processing' then 'ready_for_fulfillment'
    else null end;

  stage_title := case stage_type
    when 'order_request' then 'New Order Request'
    when 'stock_confirmation_pending' then 'Confirm stock with supplier'
    when 'buyer_decision_pending' then 'Waiting buyer decision / substitution'
    when 'payment_coordination_required' then 'PAYMENT COORDINATION REQUIRED — stock could not be held'
    when 'expired_unpaid_order' then 'EXPIRED UNPAID ORDER — FOLLOW-UP REQUIRED'
    when 'reserve_actions' then 'Reserve confirmed — buy/commit goods with supplier'
    when 'ready_for_fulfillment' then 'Paid — ready for fulfillment'
    else null end;

  if stage_type is not null then
    perform raise_action(stage_type, stage_type || ':' || new.id, stage_title, 'order', new.id, ref,
      who, new.total, new.currency, 1, href);
  end if;

  -- cancelling an order that has money in needs a refund decision
  if new.status = 'canceled' then
    if exists (select 1 from payments p where p.order_id = new.id and p.status = 'confirmed') then
      perform raise_action('chargeback_cancellation', 'cancellation:' || new.id,
        'Canceled order with confirmed payment — refund/credit decision', 'order', new.id, ref, who,
        new.total, new.currency, 1, href);
    end if;
    perform log_system_event('info', 'order_canceled', 'Order ' || ref || ' canceled', 'order', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_action_feed on orders;
create trigger orders_action_feed
  after insert or update of status on orders
  for each row execute function action_feed_orders();

-- Payments: verify / differences / chargebacks.
create or replace function action_feed_payments()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
  who text;
  ref text;
  href text;
begin
  select * into o from orders where id = new.order_id;
  select coalesce(nullif(company_name, ''), nullif(name, ''), email) into who from customers where id = o.customer_id;
  ref := coalesce(o.order_number, left(o.id::text, 8));
  href := '/admin/pedidos/' || o.id || '#payments';

  if new.status = 'pending_verification' then
    perform raise_action('payments_to_verify', 'payments_to_verify:' || new.id,
      'Verify ' || replace(new.method_code, '_', ' ') || ' payment (' || new.kind || ')',
      'payment', new.id, ref, who, new.amount, new.currency, 1, href);
  else
    perform resolve_action('payments_to_verify:' || new.id);
  end if;

  if new.status = 'confirmed' and new.received_amount is not null and new.received_amount <> new.amount then
    perform raise_action('payment_difference', 'payment_difference:' || new.id,
      'Received ' || new.received_amount || ' vs expected ' || new.amount || ' ' || new.currency,
      'payment', new.id, ref, who, abs(new.amount - new.received_amount), new.currency, 1, href);
  elsif new.received_amount is not distinct from new.amount then
    perform resolve_action('payment_difference:' || new.id);
  end if;

  if new.status = 'chargeback' and (tg_op = 'INSERT' or old.status is distinct from 'chargeback') then
    perform raise_action('chargeback_cancellation', 'chargeback:' || new.id,
      'CHARGEBACK opened', 'payment', new.id, ref, who, new.amount, new.currency, 1, href, 'critical');
  end if;
  return null;
end;
$$;

drop trigger if exists payments_action_feed on payments;
create trigger payments_action_feed
  after insert or update of status, received_amount on payments
  for each row execute function action_feed_payments();

-- Restock Opportunities: one item per variant, value/buyers aggregated.
create or replace function action_feed_lost_sales()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  vid uuid := coalesce(new.variant_id, old.variant_id);
  agg record;
begin
  if vid is null then
    return null;
  end if;

  select count(distinct customer_id) as buyers, sum(quantity) as units,
         sum(potential_value * coalesce(latest_brl_rate(currency), 0)) as value_brl,
         min(product_title) as title, min(color) as color, min(size) as size
  into agg
  from lost_sales where variant_id = vid and status = 'restock_opportunity';

  if coalesce(agg.units, 0) > 0 then
    perform raise_action('restock_opportunity', 'restock_opportunity:' || vid,
      agg.buyers || ' affected customer(s) · ' || agg.units || ' lost unit(s) · source stock available',
      'variant', vid, coalesce(agg.color, '—') || ' / ' || coalesce(agg.size, '—'), agg.title,
      round(agg.value_brl, 2), 'BRL', agg.buyers::integer, '/admin/vendas-perdidas?variant=' || vid);
  else
    perform resolve_action('restock_opportunity:' || vid);
  end if;
  return null;
end;
$$;

drop trigger if exists lost_sales_action_feed on lost_sales;
create trigger lost_sales_action_feed
  after insert or update of status on lost_sales
  for each row execute function action_feed_lost_sales();

-- Sync runs: failure → action; success → information only.
create or replace function action_feed_sync_runs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.finished_at is null then
    return null;
  end if;
  if new.failed > 0 or new.error_log is not null then
    perform raise_action('sync_issues', 'sync_issues:' || coalesce(new.connector_id::text, 'unknown'),
      'Sync failed: ' || new.failed || ' item(s) with errors', 'sync_run', new.id, null, null,
      null, null, new.failed, '/admin/automacao');
  else
    perform log_system_event('info', 'sync_completed',
      'Sync completed: ' || new.created || ' created, ' || new.updated || ' updated', 'sync_run', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists sync_runs_action_feed on sync_runs;
create trigger sync_runs_action_feed
  after insert or update of finished_at, failed on sync_runs
  for each row execute function action_feed_sync_runs();

-- Customer approvals (new buyer registrations).
create or replace function action_feed_customers()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'pending' and new.role = 'customer' then
    perform raise_action('customer_approval', 'customer_approval:' || new.id,
      'New ' || new.customer_type || ' registration', 'customer', new.id, new.email,
      coalesce(nullif(new.company_name, ''), new.name, new.email), null, null, 1, '/admin/clientes');
  else
    perform resolve_action('customer_approval:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists customers_action_feed on customers;
create trigger customers_action_feed
  after insert or update of status on customers
  for each row execute function action_feed_customers();

-- Backfill open items for what already exists today.
update customers set status = status where status = 'pending';
update products set status = status;
update product_images set review_status = review_status where review_status = 'pending_review';

-- ====================================================================
-- 0028_whatsapp_analytics_fx_auto.sql
-- ====================================================================
-- ---------------------------------------------------------------------
-- 0028: WhatsApp button settings, analytics events, automatic FX and the
--       storage bucket for TDP-uploaded/treated images.
-- ---------------------------------------------------------------------

insert into app_settings (key, value) values
  ('whatsapp', jsonb_build_object(
    'active', false,
    'number', '',
    'messages', jsonb_build_object(
      'general', jsonb_build_object(
        'en', 'Hello! I would like more information about The Dressing Project.',
        'es', '¡Hola! Me gustaría más información sobre The Dressing Project.',
        'pt', 'Olá! Gostaria de mais informações sobre o The Dressing Project.'),
      'product', jsonb_build_object(
        'en', 'Hello! I am interested in this product: {product} — {url}',
        'es', '¡Hola! Me interesa este producto: {product} — {url}',
        'pt', 'Olá! Tenho interesse neste produto: {product} — {url}'),
      'order', jsonb_build_object(
        'en', 'Hello! I would like to talk about my order {order}.',
        'es', '¡Hola! Me gustaría hablar sobre mi pedido {order}.',
        'pt', 'Olá! Gostaria de falar sobre o meu pedido {order}.')
    )
  )),
  ('fx_auto', jsonb_build_object('enabled', true, 'provider', 'frankfurter'))
on conflict (key) do nothing;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  path text,
  source text,
  locale text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_event_idx on analytics_events (event, created_at desc);

alter table analytics_events enable row level security;
drop policy if exists analytics_events_staff_read on analytics_events;
create policy analytics_events_staff_read on analytics_events for select using (is_staff());
grant all on analytics_events to service_role;

alter table fx_rates add column if not exists source text not null default 'manual'
  check (source in ('manual', 'auto'));

-- Public bucket for images uploaded/treated by the TDP (Supabase only;
-- skipped on plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('tdp-images', 'tdp-images', true)
    on conflict (id) do nothing;
  end if;
end;
$$;

-- record them for scripts/run-migrations.mjs (npm run db:migrate)
create table if not exists _migrations_applied (
  name text primary key,
  applied_at timestamptz not null default now()
);
insert into _migrations_applied (name) values
  ('0024_sync_protection_and_image_review.sql'),
  ('0025_channels_and_payments.sql'),
  ('0026_order_confirmation_stock_hold_lost_sales.sql'),
  ('0027_action_center.sql'),
  ('0028_whatsapp_analytics_fx_auto.sql')
on conflict (name) do nothing;

commit;
