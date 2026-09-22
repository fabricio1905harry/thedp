-- ---------------------------------------------------------------------
-- Link Suppliers (Connectors) to Products (CAT-06/07 / ADM-03)
-- ---------------------------------------------------------------------

alter table products add column if not exists connector_id uuid references connectors (id) on delete set null;

create table if not exists product_connectors (
  product_id uuid references products (id) on delete cascade,
  connector_id uuid references connectors (id) on delete cascade,
  primary key (product_id, connector_id)
);

alter table product_connectors enable row level security;

create policy product_connectors_public on product_connectors for select using (true);
create policy product_connectors_staff on product_connectors for all using (is_staff());

grant select on product_connectors to anon, authenticated;
grant all on product_connectors to service_role;

-- Track applied migration (handled by runner)
-- 0008_link_suppliers_to_products.sql
