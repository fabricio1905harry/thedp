-- The Dressing Project — migration 0029 (freight & duties informed after stock confirmation).
-- Paste into Supabase (project thedress) → SQL Editor → Run. Requires 0024–0028. Safe to re-run.

begin;
-- ---------------------------------------------------------------------
-- 0029: Freight & import duties are informed by the TDP after stock
--       confirmation (not calculated at checkout).
--
-- The buyer places the Order Request seeing "to be informed after stock
-- confirmation"; the TDP fills the components below in the Admin. Until
-- charges_informed_at is set the order shows DHL Quote Required in the
-- Action Center and cannot be released for payment.
--
-- shipping_cost / duties_estimate / total are kept in sync (trigger) so
-- the existing screens and reports keep working.
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists freight_amount numeric(12, 2) not null default 0,
  add column if not exists insurance_amount numeric(12, 2) not null default 0,
  add column if not exists fuel_surcharge_amount numeric(12, 2) not null default 0,
  add column if not exists demand_surcharge_amount numeric(12, 2) not null default 0,
  add column if not exists export_declaration_amount numeric(12, 2) not null default 0,
  add column if not exists other_dhl_amount numeric(12, 2) not null default 0,
  add column if not exists duties_taxes_amount numeric(12, 2) not null default 0,
  add column if not exists other_charges_amount numeric(12, 2) not null default 0,
  add column if not exists delivery_days integer,
  add column if not exists charges_note text,
  add column if not exists charges_informed_at timestamptz,
  add column if not exists charges_informed_by uuid references customers (id) on delete set null;

create or replace function orders_compute_charges()
returns trigger
language plpgsql
as $$
begin
  new.shipping_cost := new.freight_amount + new.insurance_amount + new.fuel_surcharge_amount
    + new.demand_surcharge_amount + new.export_declaration_amount + new.other_dhl_amount;
  new.duties_estimate := new.duties_taxes_amount;
  new.total := round(coalesce(new.subtotal, 0) + new.shipping_cost + new.duties_estimate + new.other_charges_amount, 2);
  return new;
end;
$$;

drop trigger if exists orders_compute_charges on orders;
create trigger orders_compute_charges
  before insert or update on orders
  for each row execute function orders_compute_charges();

-- Orders placed before this migration: keep their stored estimate as freight
-- / duties so their totals don't change.
update orders
set freight_amount = coalesce(shipping_cost, 0),
    duties_taxes_amount = coalesce(duties_estimate, 0),
    charges_informed_at = case when coalesce(shipping_cost, 0) > 0 then created_at end
where charges_informed_at is null
  and freight_amount = 0 and duties_taxes_amount = 0
  and (coalesce(shipping_cost, 0) > 0 or coalesce(duties_estimate, 0) > 0);

-- Action Center: DHL Quote Required while the order is being confirmed and
-- freight/duties were not informed yet.
create or replace function action_feed_order_charges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who text;
begin
  if new.charges_informed_at is null
     and new.status in ('created', 'order_request', 'stock_confirmation', 'awaiting_buyer_decision',
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

drop trigger if exists orders_action_feed_charges on orders;
create trigger orders_action_feed_charges
  after insert or update of status, charges_informed_at on orders
  for each row execute function action_feed_order_charges();

update orders set charges_informed_at = charges_informed_at
where charges_informed_at is null
  and status in ('created', 'order_request', 'stock_confirmation', 'awaiting_buyer_decision');

create table if not exists _migrations_applied (
  name text primary key,
  applied_at timestamptz not null default now()
);
insert into _migrations_applied (name) values ('0029_order_shipping_charges.sql') on conflict (name) do nothing;

commit;
