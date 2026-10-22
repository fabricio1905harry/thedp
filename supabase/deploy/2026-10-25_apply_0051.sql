-- ---------------------------------------------------------------------
-- 0051: Brands, Collections, Lookbooks (shoppable), TDP Edits + paid placements
--
-- Every entity has ON/OFF (active), order (sort) and the same placement
-- convention as the CMS (partner, paid_placement flag, placement_start/end):
-- buyers only read rows that are active AND inside the placement window,
-- so an expired placement hides itself without anybody switching it off.
-- Collections also have a visibility schedule (starts_at / ends_at) and a
-- stock alert (alert_min_styles) that raises the Action Center item
-- `collection_low_stock`.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

create or replace function tdp_window_ok(p_start date, p_end date)
returns boolean
language sql
stable
as $$
  select (p_start is null or p_start <= current_date) and (p_end is null or p_end >= current_date);
$$;

-- ---------------------------------------------------------------- brands
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  cover_url text,
  story jsonb not null default '{}'::jsonb,       -- {en, es, pt}
  country text,
  active boolean not null default false,
  featured boolean not null default false,
  sort integer not null default 0,
  partner text,
  paid_placement boolean not null default false,
  placement_start date,
  placement_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products add column if not exists brand_id uuid references brands (id) on delete set null;
create index if not exists products_brand_id_idx on products (brand_id);

-- Link the existing free-text products.brand to brands (created INACTIVE: curate before publishing)
insert into brands (slug, name, active, sort)
select
  coalesce(nullif(trim(both '-' from regexp_replace(lower(b.brand), '[^a-z0-9]+', '-', 'g')), ''), 'brand-' || substr(md5(b.brand), 1, 6)),
  b.brand, false, (row_number() over (order by b.brand)) * 10
from (select distinct trim(brand) as brand from products where coalesce(trim(brand), '') <> '') b
on conflict (slug) do nothing;

update products p
   set brand_id = br.id
  from brands br
 where p.brand_id is null
   and coalesce(trim(p.brand), '') <> ''
   and lower(br.name) = lower(trim(p.brand));

-- ----------------------------------------------------------- collections
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title jsonb not null default '{}'::jsonb,       -- {en, es, pt}
  story jsonb not null default '{}'::jsonb,
  cover_url text,
  active boolean not null default false,
  featured boolean not null default false,
  sort integer not null default 0,
  starts_at date,
  ends_at date,
  alert_min_styles integer not null default 0 check (alert_min_styles >= 0),  -- 0 = alert off
  partner text,
  paid_placement boolean not null default false,
  placement_start date,
  placement_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collection_products (
  collection_id uuid not null references collections (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  sort integer not null default 0,
  primary key (collection_id, product_id)
);
create index if not exists collection_products_product_idx on collection_products (product_id);

-- ------------------------------------------------------------- lookbooks
create table if not exists lookbooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title jsonb not null default '{}'::jsonb,
  story jsonb not null default '{}'::jsonb,
  cover_url text,
  active boolean not null default false,
  featured boolean not null default false,
  sort integer not null default 0,
  partner text,
  paid_placement boolean not null default false,
  placement_start date,
  placement_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lookbook_images (
  id uuid primary key default gen_random_uuid(),
  lookbook_id uuid not null references lookbooks (id) on delete cascade,
  image_url text not null,
  caption jsonb not null default '{}'::jsonb,
  sort integer not null default 0
);
create index if not exists lookbook_images_lookbook_idx on lookbook_images (lookbook_id, sort);

create table if not exists lookbook_image_products (
  image_id uuid not null references lookbook_images (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  sort integer not null default 0,
  primary key (image_id, product_id)
);

-- ------------------------------------------------------------- TDP Edits
create table if not exists tdp_edits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  cover_url text,
  active boolean not null default false,
  featured boolean not null default false,
  sort integer not null default 0,
  partner text,
  paid_placement boolean not null default false,
  placement_start date,
  placement_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tdp_edit_products (
  edit_id uuid not null references tdp_edits (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  sort integer not null default 0,
  primary key (edit_id, product_id)
);

-- ------------------------------------------------------------------ RLS
alter table brands enable row level security;
alter table collections enable row level security;
alter table collection_products enable row level security;
alter table lookbooks enable row level security;
alter table lookbook_images enable row level security;
alter table lookbook_image_products enable row level security;
alter table tdp_edits enable row level security;
alter table tdp_edit_products enable row level security;

-- staff: full access
do $$
declare t text;
begin
  foreach t in array array['brands','collections','collection_products','lookbooks','lookbook_images','lookbook_image_products','tdp_edits','tdp_edit_products']
  loop
    execute format('drop policy if exists %I on %I', t || '_staff', t);
    execute format('create policy %I on %I for all using (is_staff()) with check (is_staff())', t || '_staff', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('grant insert, update, delete on %I to authenticated', t);
    execute format('grant all on %I to service_role', t);
  end loop;
end $$;

-- buyers / visitors: only active rows inside the placement (and schedule) window
drop policy if exists brands_public_read on brands;
create policy brands_public_read on brands for select to anon, authenticated
  using (active and tdp_window_ok(placement_start, placement_end));

drop policy if exists collections_public_read on collections;
create policy collections_public_read on collections for select to anon, authenticated
  using (active and tdp_window_ok(placement_start, placement_end) and tdp_window_ok(starts_at, ends_at));

drop policy if exists lookbooks_public_read on lookbooks;
create policy lookbooks_public_read on lookbooks for select to anon, authenticated
  using (active and tdp_window_ok(placement_start, placement_end));

drop policy if exists tdp_edits_public_read on tdp_edits;
create policy tdp_edits_public_read on tdp_edits for select to anon, authenticated
  using (active and tdp_window_ok(placement_start, placement_end));

-- children inherit the parent's visibility (the sub-select is itself filtered by the parent's policy)
drop policy if exists collection_products_public_read on collection_products;
create policy collection_products_public_read on collection_products for select to anon, authenticated
  using (exists (select 1 from collections c where c.id = collection_id));

drop policy if exists lookbook_images_public_read on lookbook_images;
create policy lookbook_images_public_read on lookbook_images for select to anon, authenticated
  using (exists (select 1 from lookbooks l where l.id = lookbook_id));

drop policy if exists lookbook_image_products_public_read on lookbook_image_products;
create policy lookbook_image_products_public_read on lookbook_image_products for select to anon, authenticated
  using (exists (select 1 from lookbook_images i where i.id = image_id));

drop policy if exists tdp_edit_products_public_read on tdp_edit_products;
create policy tdp_edit_products_public_read on tdp_edit_products for select to anon, authenticated
  using (exists (select 1 from tdp_edits e where e.id = edit_id));

-- --------------------------------------------- collection stock alert
create or replace function collection_stock_counts(p_collection uuid)
returns table (total_styles integer, available_styles integer)
language sql
stable
security definer set search_path = public
as $$
  select
    count(*)::integer,
    count(*) filter (
      where exists (select 1 from variants v where v.product_id = p.id and v.stock > 0)
    )::integer
  from collection_products cp
  join products p on p.id = cp.product_id and p.status = 'published'
  where cp.collection_id = p_collection;
$$;

create or replace function refresh_collection_alert(p_collection uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c collections;
  tot integer;
  av integer;
  label text;
begin
  select * into c from collections where id = p_collection;
  if c.id is null then
    perform resolve_action('collection_low_stock:' || p_collection);
    return;
  end if;
  select total_styles, available_styles into tot, av from collection_stock_counts(p_collection);
  label := coalesce(nullif(c.title ->> 'en', ''), c.slug);
  if c.active and c.alert_min_styles > 0 and tot > 0 and av < c.alert_min_styles then
    perform raise_action(
      'collection_low_stock', 'collection_low_stock:' || c.id,
      label || ': ' || av || '/' || tot || ' styles available (minimum ' || c.alert_min_styles || ')',
      'collection', c.id, c.slug, label, null, null, 1, '/admin/colecoes/' || c.id
    );
  else
    perform resolve_action('collection_low_stock:' || c.id);
  end if;
end;
$$;

create or replace function collection_products_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform refresh_collection_alert(coalesce(new.collection_id, old.collection_id));
  return null;
end;
$$;
drop trigger if exists collection_products_alert on collection_products;
create trigger collection_products_alert
  after insert or update or delete on collection_products
  for each row execute function collection_products_alert();

create or replace function collections_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform refresh_collection_alert(new.id);
  return null;
end;
$$;
drop trigger if exists collections_alert on collections;
create trigger collections_alert
  after insert or update of active, alert_min_styles on collections
  for each row execute function collections_alert();

create or replace function collections_alert_cleanup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform resolve_action('collection_low_stock:' || old.id);
  return old;
end;
$$;
drop trigger if exists collections_alert_cleanup on collections;
create trigger collections_alert_cleanup
  before delete on collections
  for each row execute function collections_alert_cleanup();

-- stock moves (source sync / override) -> re-evaluate the collections containing the product
create or replace function variants_collection_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare cid uuid;
begin
  if (coalesce(old.stock, 0) > 0) is distinct from (coalesce(new.stock, 0) > 0) then
    for cid in select collection_id from collection_products where product_id = new.product_id loop
      perform refresh_collection_alert(cid);
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists variants_collection_alert on variants;
create trigger variants_collection_alert
  after update on variants
  for each row execute function variants_collection_alert();
