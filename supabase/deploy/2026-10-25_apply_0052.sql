-- ---------------------------------------------------------------------
-- 0052: Notify Me (back in stock) + My Favorites
--
-- * notify_requests — an approved buyer asks to be told when a sold-out
--   variant is available again. A trigger on variants queues the e-mail
--   (template `notify_back_in_stock`, in the buyer's locale) in
--   email_outbox when stock goes from 0 to >0 and marks the request notified.
-- * Action Center `restock_demand`: one item per product with the number of
--   buyers still waiting (closes itself when nobody is waiting).
-- * favorites — logged-in buyers' hearts; staff can read them for counts.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

create table if not exists notify_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  variant_id uuid not null references variants (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (customer_id, variant_id)
);
create index if not exists notify_requests_product_idx on notify_requests (product_id) where notified_at is null;
create index if not exists notify_requests_variant_idx on notify_requests (variant_id) where notified_at is null;

alter table notify_requests enable row level security;
drop policy if exists notify_requests_staff on notify_requests;
create policy notify_requests_staff on notify_requests for all using (is_staff()) with check (is_staff());
drop policy if exists notify_requests_own_read on notify_requests;
create policy notify_requests_own_read on notify_requests for select to authenticated using (customer_id = auth.uid());
drop policy if exists notify_requests_own_insert on notify_requests;
create policy notify_requests_own_insert on notify_requests for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (select 1 from customers c where c.id = auth.uid() and c.status = 'approved')
  );
drop policy if exists notify_requests_own_delete on notify_requests;
create policy notify_requests_own_delete on notify_requests for delete to authenticated using (customer_id = auth.uid());
grant select, insert, update, delete on notify_requests to authenticated;
grant all on notify_requests to service_role;

-- Restock demand -> Action Center
create or replace function refresh_restock_demand(p_product uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
  p products;
begin
  select count(distinct customer_id) into n from notify_requests where product_id = p_product and notified_at is null;
  select * into p from products where id = p_product;
  if n > 0 and p.id is not null then
    perform raise_action(
      'restock_demand', 'restock_demand:' || p_product,
      n || ' buyer(s) waiting for restock', 'product', p_product, p.slug, p.title,
      null, null, n, '/admin/avise-me?product=' || p_product
    );
  else
    perform resolve_action('restock_demand:' || p_product);
  end if;
end;
$$;

create or replace function notify_requests_demand()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform refresh_restock_demand(coalesce(new.product_id, old.product_id));
  return null;
end;
$$;
drop trigger if exists notify_requests_demand on notify_requests;
create trigger notify_requests_demand
  after insert or update of notified_at or delete on notify_requests
  for each row execute function notify_requests_demand();

-- Stock 0 -> >0: queue the e-mails and mark the requests as notified
create or replace function variants_notify_back_in_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  prod products;
begin
  if coalesce(old.stock, 0) <= 0 and coalesce(new.stock, 0) > 0 then
    select * into prod from products where id = new.product_id;
    if prod.status = 'published' then
      for r in
        select nr.id, c.email, c.name, c.locale
          from notify_requests nr join customers c on c.id = nr.customer_id
         where nr.variant_id = new.id and nr.notified_at is null
      loop
        insert into email_outbox (to_email, template, locale, payload)
        values (
          r.email, 'notify_back_in_stock', coalesce(nullif(r.locale, ''), 'en'),
          jsonb_build_object(
            'buyer_name', coalesce(r.name, ''),
            'product_title', prod.title,
            'product_slug', prod.slug,
            'color', tdp_color_label(new.color, coalesce(nullif(r.locale, ''), 'en')),
            'size', new.size
          )
        );
        update notify_requests set notified_at = now() where id = r.id;
      end loop;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists variants_notify_back_in_stock on variants;
create trigger variants_notify_back_in_stock
  after update of stock, source_stock, stock_override on variants
  for each row execute function variants_notify_back_in_stock();

-- ------------------------------------------------------------ favorites
create table if not exists favorites (
  customer_id uuid not null references customers (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);
create index if not exists favorites_product_idx on favorites (product_id);

alter table favorites enable row level security;
drop policy if exists favorites_staff_read on favorites;
create policy favorites_staff_read on favorites for select using (is_staff());
drop policy if exists favorites_own_read on favorites;
create policy favorites_own_read on favorites for select to authenticated using (customer_id = auth.uid());
drop policy if exists favorites_own_insert on favorites;
create policy favorites_own_insert on favorites for insert to authenticated with check (customer_id = auth.uid());
drop policy if exists favorites_own_delete on favorites;
create policy favorites_own_delete on favorites for delete to authenticated using (customer_id = auth.uid());
grant select, insert, delete on favorites to authenticated;
grant all on favorites to service_role;
