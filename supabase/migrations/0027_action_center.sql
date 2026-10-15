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
