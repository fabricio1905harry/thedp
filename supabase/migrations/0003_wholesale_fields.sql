-- INT-08: wholesale/B2B signup needs a business flag + company fields on
-- the same customers/approval pipeline (AUTH-01..04) — no separate table,
-- a wholesale applicant is just a customer with customer_type = 'business'.

alter table customers
  add column customer_type text not null default 'individual'
    check (customer_type in ('individual', 'business')),
  add column company_name text,
  add column tax_id text;

-- the signup trigger needs to carry these through from auth.users metadata
create or replace function handle_new_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.customers (id, email, name, locale, customer_type, company_name, tax_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'pt'),
    coalesce(new.raw_user_meta_data ->> 'customer_type', 'individual'),
    new.raw_user_meta_data ->> 'company_name',
    new.raw_user_meta_data ->> 'tax_id'
  );
  return new;
end;
$$;
