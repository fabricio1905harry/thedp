-- ---------------------------------------------------------------------
-- 0074: Commercial invoice PDF (stream 4)
--
-- * invoice_counters — one numbering sequence per year (INV-2026-0001…),
--   allocated atomically by next_invoice_number().
-- * invoices — one issued invoice per order (the PDF is stored in the
--   private bucket 'shipment-docs' under invoices/<year>/<number>.pdf and
--   served through an authenticated route; buyers only see their own).
-- * app_settings 'invoice_template' — company data, bank details, notes
--   (Admin → Configurações da invoice). The client's template is pending:
--   the PDF layout reads everything from this row.
-- ---------------------------------------------------------------------

create table if not exists invoice_counters (
  year integer primary key,
  last_number integer not null default 0
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  year integer not null,
  seq integer not null,
  number text not null unique,
  status text not null default 'issued' check (status in ('issued', 'void')),
  currency text not null,
  total numeric(14, 2) not null default 0,
  storage_path text,
  data jsonb not null default '{}'::jsonb,   -- snapshot used to render the PDF
  issued_at timestamptz not null default now(),
  issued_by uuid references customers (id) on delete set null,
  unique (year, seq)
);
create unique index if not exists invoices_order_active_uq on invoices (order_id) where status = 'issued';

alter table invoice_counters enable row level security;
alter table invoices enable row level security;
drop policy if exists invoice_counters_staff on invoice_counters;
create policy invoice_counters_staff on invoice_counters for all using (is_staff()) with check (is_staff());
drop policy if exists invoices_staff on invoices;
create policy invoices_staff on invoices for all using (is_staff()) with check (is_staff());
drop policy if exists invoices_owner_read on invoices;
create policy invoices_owner_read on invoices for select using (
  status = 'issued' and exists (select 1 from orders o where o.id = invoices.order_id and o.customer_id = auth.uid())
);
grant select, insert, update on invoices to authenticated;
grant all on invoice_counters, invoices to service_role;

create or replace function next_invoice_number(p_year integer default null)
returns table (invoice_year integer, invoice_seq integer)
language plpgsql
security definer set search_path = public
as $$
declare
  y integer := coalesce(p_year, extract(year from now())::integer);
  n integer;
begin
  insert into invoice_counters (year, last_number) values (y, 1)
  on conflict (year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into n;
  return query select y, n;
end;
$$;

revoke execute on function next_invoice_number(integer) from public;
grant execute on function next_invoice_number(integer) to service_role;

insert into app_settings (key, value) values
  ('invoice_template', jsonb_build_object(
    'number_prefix', 'INV',
    'company_name', 'The Dressing Project',
    'company_address', '',
    'company_tax_id', '',
    'company_email', '',
    'company_phone', '',
    'bank_details', '',
    'notes', '',
    'footer', '',
    'origin_country', 'Brazil'
  ))
on conflict (key) do nothing;
