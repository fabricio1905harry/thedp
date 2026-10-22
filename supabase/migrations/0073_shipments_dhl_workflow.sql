-- ---------------------------------------------------------------------
-- 0073: Shipping (DHL) workflow (stream 4)
--
-- * shipments (extends the 0001 table): CREATED → PICKUP_REQUESTED →
--   IN_TRANSIT → DELIVERED | EXCEPTION. A shipment can only be created for
--   an order paid in full (status paid/processing/shipped/delivered).
-- * is_mock marks shipments produced by the mock adapter (no DHL
--   credentials): the Admin shows "MOCK" and the buyer never sees a
--   fabricated tracking code as real (see src/lib/dhl-adapter.ts).
-- * shipment_events — tracking timeline (buyer can read their own).
-- * shipment_documents — commercial invoice / packing list / label files in
--   the private storage bucket 'shipment-docs' (staff only; buyers get a
--   signed URL through an authenticated route, never a public link).
-- * order_prep_items — "Product preparation" checklist (labels / tags /
--   bagging per order line).
-- * Triggers: order status follows the shipment (shipped / delivered),
--   buyer notifications (shipment_created, in_transit, delivered) and
--   Action Center items (dhl_shipping_actions, dhl_errors).
-- ---------------------------------------------------------------------

alter table shipments
  add column if not exists carrier text not null default 'DHL',
  add column if not exists is_mock boolean not null default false,
  add column if not exists tracking_url text,
  add column if not exists shipment_reference text,
  add column if not exists pickup_requested_at timestamptz,
  add column if not exists pickup_date date,
  add column if not exists pickup_reference text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists packages jsonb,
  add column if not exists total_weight_kg numeric(10, 3),
  add column if not exists provider_payload jsonb,
  add column if not exists last_error text,
  add column if not exists created_by uuid references customers (id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

update shipments set status = 'CREATED' where status is null or upper(status) not in ('CREATED', 'PICKUP_REQUESTED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION');
update shipments set status = upper(status) where status <> upper(status);
alter table shipments alter column status set default 'CREATED';
alter table shipments alter column status set not null;
alter table shipments drop constraint if exists shipments_status_check;
alter table shipments add constraint shipments_status_check
  check (status in ('CREATED', 'PICKUP_REQUESTED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION'));

create index if not exists shipments_order_idx on shipments (order_id);
create index if not exists shipments_status_idx on shipments (status);

create table if not exists shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  status text not null,
  description text,
  location text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('dhl', 'mock', 'manual', 'system')),
  raw jsonb,
  created_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shipment_events_shipment_idx on shipment_events (shipment_id, occurred_at);

create table if not exists shipment_documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('commercial_invoice', 'packing_list', 'label', 'other')),
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  visible_to_buyer boolean not null default false,
  uploaded_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shipment_documents_shipment_idx on shipment_documents (shipment_id);

create table if not exists order_prep_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  task text not null check (task in ('labels', 'tags', 'bagging')),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references customers (id) on delete set null,
  unique (order_item_id, task)
);
create index if not exists order_prep_items_order_idx on order_prep_items (order_id);

alter table shipment_events enable row level security;
alter table shipment_documents enable row level security;
alter table order_prep_items enable row level security;
alter table shipments enable row level security;

drop policy if exists shipments_staff_write on shipments;
create policy shipments_staff_write on shipments for all using (is_staff()) with check (is_staff());
drop policy if exists shipment_events_staff on shipment_events;
create policy shipment_events_staff on shipment_events for all using (is_staff()) with check (is_staff());
drop policy if exists shipment_events_owner_read on shipment_events;
create policy shipment_events_owner_read on shipment_events for select using (
  exists (
    select 1 from shipments s join orders o on o.id = s.order_id
    where s.id = shipment_events.shipment_id and o.customer_id = auth.uid()
  )
);
drop policy if exists shipment_documents_staff on shipment_documents;
create policy shipment_documents_staff on shipment_documents for all using (is_staff()) with check (is_staff());
drop policy if exists order_prep_items_staff on order_prep_items;
create policy order_prep_items_staff on order_prep_items for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on shipments, shipment_events, shipment_documents, order_prep_items to authenticated;
grant all on shipments, shipment_events, shipment_documents, order_prep_items to service_role;

-- Private bucket + staff-only object policies (Supabase only; skipped on plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('shipment-docs', 'shipment-docs', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists shipment_docs_staff_all on storage.objects';
    execute $p$create policy shipment_docs_staff_all on storage.objects for all to authenticated
      using (bucket_id = 'shipment-docs' and public.is_staff())
      with check (bucket_id = 'shipment-docs' and public.is_staff())$p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Gate: no shipment before full payment.
-- ---------------------------------------------------------------------
create or replace function shipments_require_full_payment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  st text;
begin
  select status into st from orders where id = new.order_id;
  if st is null or st not in ('paid', 'processing', 'shipped', 'delivered') then
    raise exception 'SHIPMENT_REQUIRES_FULL_PAYMENT: o pedido precisa estar pago integralmente';
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_require_full_payment on shipments;
create trigger shipments_require_full_payment
  before insert on shipments
  for each row execute function shipments_require_full_payment();

-- ---------------------------------------------------------------------
-- Lifecycle: timestamps, order status, notifications, Action Center.
-- ---------------------------------------------------------------------
create or replace function shipments_lifecycle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
  ref text;
  who text;
  href text;
  payload jsonb;
begin
  select * into o from orders where id = new.order_id;
  ref := coalesce(o.order_number, left(o.id::text, 8));
  href := '/admin/pedidos/' || o.id;
  select coalesce(nullif(company_name, ''), nullif(name, ''), email) into who from customers where id = o.customer_id;
  payload := jsonb_build_object(
    'tracking_number', new.dhl_tracking,
    'tracking_url', new.tracking_url,
    'carrier', new.carrier,
    'is_mock', new.is_mock
  );

  if tg_op = 'INSERT' then
    update orders set status = 'processing' where id = o.id and status = 'paid';
    insert into shipment_events (shipment_id, status, description, source)
    values (new.id, 'CREATED', 'Shipment created', case when new.is_mock then 'mock' else 'system' end);
    perform raise_action('dhl_shipping_actions', 'dhl_pickup:' || new.id,
      'Shipment created — request DHL pickup', 'order', o.id, ref, who, null, null, 1, href);
    -- never e-mail the buyer a MOCK tracking code
    if not new.is_mock then
      perform queue_notification('shipment_created', o.customer_id, o.id, payload, 'shipment_created:' || new.id);
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  insert into shipment_events (shipment_id, status, description, source)
  values (new.id, new.status, 'Status → ' || new.status, case when new.is_mock then 'mock' else 'system' end);

  if new.status = 'PICKUP_REQUESTED' then
    perform resolve_action('dhl_pickup:' || new.id);
  end if;

  if new.status = 'IN_TRANSIT' then
    perform resolve_action('dhl_pickup:' || new.id);
    update orders set status = 'shipped' where id = o.id and status in ('paid', 'processing');
    if not new.is_mock then
      perform queue_notification('in_transit', o.customer_id, o.id, payload, 'in_transit:' || new.id);
    end if;
  elsif new.status = 'DELIVERED' then
    perform resolve_action('dhl_pickup:' || new.id);
    update orders set status = 'delivered' where id = o.id and status in ('paid', 'processing', 'shipped');
    if not new.is_mock then
      perform queue_notification('delivered', o.customer_id, o.id, payload, 'delivered:' || new.id);
    end if;
  end if;

  if new.status = 'EXCEPTION' then
    perform raise_action('dhl_errors', 'dhl_exception:' || new.id,
      'DHL EXCEPTION on shipment ' || coalesce(new.dhl_tracking, '—') || coalesce(' — ' || new.last_error, ''),
      'order', o.id, ref, who, null, null, 1, href);
  else
    perform resolve_action('dhl_exception:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists shipments_lifecycle on shipments;
create trigger shipments_lifecycle
  after insert or update of status on shipments
  for each row execute function shipments_lifecycle();

create or replace function shipments_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'IN_TRANSIT' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  if new.status = 'DELIVERED' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  if new.status = 'PICKUP_REQUESTED' and new.pickup_requested_at is null then
    new.pickup_requested_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_touch on shipments;
create trigger shipments_touch
  before insert or update on shipments
  for each row execute function shipments_touch();
