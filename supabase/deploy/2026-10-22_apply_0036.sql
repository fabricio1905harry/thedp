-- 0036: staff can edit order lines.
-- order_items had RLS with a SELECT policy only, so every Admin edit of a
-- line (status AVAILABLE/UNAVAILABLE, quantity, price, add/substitute)
-- silently changed 0 rows. That left lines in "requested", broke
-- "Generate Confirmed Order" and kept the subtotal unchanged.
-- Safe to re-run.
drop policy if exists order_items_staff_all on order_items;
create policy order_items_staff_all on order_items
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- A16: orders were created without a sales channel (customers.channel was
-- empty), so they did not inherit the International B2B payment defaults.
-- ---------------------------------------------------------------------
create or replace function default_customer_channel(p_customer uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    c.channel,
    case when c.customer_type = 'business' or c.customer_type is null then 'intl_b2b' else 'intl_b2c' end
  )
  from customers c where c.id = p_customer;
$$;

create or replace function orders_default_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.channel is null then
    new.channel := coalesce(default_customer_channel(new.customer_id), 'intl_b2b');
  end if;
  return new;
end;
$$;

create or replace function customers_default_channel()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.channel is null and new.role = 'customer' then
    new.channel := case when new.customer_type = 'business' or new.customer_type is null then 'intl_b2b' else 'intl_b2c' end;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_default_channel on customers;
create trigger customers_default_channel
  before insert or update of channel on customers
  for each row execute function customers_default_channel();

update customers set channel = channel where channel is null and role = 'customer';
update orders o set channel = coalesce(default_customer_channel(o.customer_id), 'intl_b2b') where o.channel is null;

-- ---------------------------------------------------------------------
-- A9: "DHL Quote Required" only appears once stock confirmation started
-- (not at the same moment as the Order Request).
-- ---------------------------------------------------------------------
create or replace function action_feed_order_charges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who text;
begin
  if new.charges_informed_at is null
     and new.status in ('stock_confirmation', 'awaiting_buyer_decision',
                        'payment_window_expired', 'payment_coordination_required') then
    select coalesce(nullif(company_name, ''), nullif(name, ''), email) into who
    from customers where id = new.customer_id;
    perform raise_action('dhl_quote_required', 'dhl_quote_required:' || new.id,
      'Inform freight & import duties (after stock confirmation)', 'order', new.id,
      coalesce(new.order_number, left(new.id::text, 8)), who, new.subtotal, new.currency, 1,
      '/admin/pedidos/' || new.id || '#charges');
  else
    perform resolve_action('dhl_quote_required:' || new.id);
  end if;
  return null;
end;
$$;

update orders set charges_informed_at = charges_informed_at
where charges_informed_at is null and status in ('created', 'order_request', 'stock_confirmation', 'awaiting_buyer_decision');

-- ---------------------------------------------------------------------
-- A10: stale items escalate to CRITICAL (run by the hourly cron).
--   order request / stock confirmation / buyer decision: after 12 h
--   payments to verify: after 24 h
-- ---------------------------------------------------------------------
create or replace function escalate_stale_actions()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  update action_items
  set severity = 'critical', updated_at = now()
  where status = 'open' and severity <> 'critical'
    and (
      (action_type in ('order_request', 'stock_confirmation_pending', 'buyer_decision_pending')
        and created_at < now() - interval '12 hours')
      or (action_type = 'payments_to_verify' and created_at < now() - interval '24 hours')
    );
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function escalate_stale_actions() from public;
grant execute on function escalate_stale_actions() to service_role;
