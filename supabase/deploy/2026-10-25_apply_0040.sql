-- 0040: homologation stream 1 (checkout, buyer cancel/return, customers, contacts).
-- Safe to re-run.

-- ---------------------------------------------------------------------
-- M5: wholesale signup country (ISO alpha-2). Drives the default channel
-- (BR -> br_b2b, anything else -> intl_b2b) and the checkout country.
-- ---------------------------------------------------------------------
alter table customers add column if not exists country text;

create or replace function handle_new_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  c text := nullif(upper(left(coalesce(m ->> 'country', ''), 2)), '');
  ctype text := coalesce(m ->> 'customer_type', 'individual');
begin
  insert into public.customers (
    id, email, name, locale, customer_type, company_name, tax_id,
    company_address, delivery_address, website, instagram, phone, business_type,
    has_physical_store, store_count, brands_carried, application_message,
    referral_code, applicant_confirmed, country, channel
  ) values (
    new.id,
    new.email,
    m ->> 'name',
    coalesce(m ->> 'locale', 'pt'),
    ctype,
    m ->> 'company_name',
    m ->> 'tax_id',
    m ->> 'company_address',
    m ->> 'delivery_address',
    m ->> 'website',
    m ->> 'instagram',
    m ->> 'phone',
    m ->> 'business_type',
    case when m ->> 'has_physical_store' in ('true', 'false') then (m ->> 'has_physical_store')::boolean end,
    case when (m ->> 'store_count') ~ '^[0-9]+$' then (m ->> 'store_count')::integer end,
    m ->> 'brands_carried',
    m ->> 'application_message',
    m ->> 'referral_code',
    coalesce((m ->> 'applicant_confirmed')::boolean, false),
    c,
    case when ctype = 'business' and c is not null
         then case when c = 'BR' then 'br_b2b' else 'intl_b2b' end end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- A8: buyer cancellation of an Order Request (before payment).
-- ---------------------------------------------------------------------
alter table orders
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists canceled_by_buyer boolean not null default false;

-- ---------------------------------------------------------------------
-- A8 / M12: contact messages reference an order (return / after-sale
-- tickets) and keep the admin reply.
-- ---------------------------------------------------------------------
alter table contact_messages
  add column if not exists order_id uuid references orders (id) on delete set null,
  add column if not exists order_number text,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_text text,
  add column if not exists replied_by uuid references customers (id) on delete set null;
create index if not exists contact_messages_order_idx on contact_messages (order_id);

-- ---------------------------------------------------------------------
-- A11: Action Center type "Order above available stock" (server-side check
-- when the Order Request is submitted; the buyer never sees stock numbers).
-- ---------------------------------------------------------------------
insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('order_above_stock', 'Order above available stock', 2, 'high', '/admin/acoes?type=order_above_stock', true, 26)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- M4: the buyer reads/writes own saved addresses (policy exists since
-- 0001; make sure the table privileges and a staff read policy do too).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on addresses to authenticated;
grant all on addresses to service_role;
drop policy if exists addresses_staff_read on addresses;
create policy addresses_staff_read on addresses for select using (is_staff());
