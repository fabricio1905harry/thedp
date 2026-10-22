-- ---------------------------------------------------------------------
-- 0062: Duties & Taxes per market.
--
-- duties_taxes_rules: one rule per market. A market is a COUNTRY (ISO-2
-- code), a REGION (EU, LATAM, …) or the fallback '*' (every other market).
-- Resolution order: country → region → '*'.
-- mode:
--   prepaid          duties & taxes are paid by the buyer with the order (DDP)
--   upon_import      paid by the buyer to the carrier on delivery (DAP/DDU)
--   customer_choice  the buyer chooses between the two
-- default_pct: % of the merchandise subtotal used to pre-fill the Admin
-- "duties" field of the order; note: text shown with the rule.
-- orders.duties_mode: the mode snapshotted when the TDP informs the
-- charges (buyer-visible only after stock confirmation).
-- Rerun-safe.
-- ---------------------------------------------------------------------

create table if not exists duties_taxes_rules (
  id uuid primary key default gen_random_uuid(),
  market_type text not null check (market_type in ('country', 'region', 'default')),
  market text not null,
  mode text not null check (mode in ('prepaid', 'upon_import', 'customer_choice')),
  default_pct numeric(6, 2) check (default_pct is null or (default_pct >= 0 and default_pct <= 100)),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  constraint duties_taxes_rules_default_market check (market_type <> 'default' or market = '*')
);

create unique index if not exists duties_taxes_rules_market_uq on duties_taxes_rules (market_type, market);

alter table duties_taxes_rules enable row level security;
drop policy if exists duties_taxes_rules_staff on duties_taxes_rules;
create policy duties_taxes_rules_staff on duties_taxes_rules for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on duties_taxes_rules to authenticated;
grant all on duties_taxes_rules to service_role;

-- today's behaviour (the TDP informs duties and the buyer pays them with the
-- order) becomes the fallback rule; editable in the Admin.
insert into duties_taxes_rules (market_type, market, mode, note)
values ('default', '*', 'prepaid', 'Padrão atual: impostos informados pela TDP e pagos junto com o pedido.')
on conflict (market_type, market) do nothing;

alter table orders add column if not exists duties_mode text
  check (duties_mode is null or duties_mode in ('prepaid', 'upon_import', 'customer_choice'));
