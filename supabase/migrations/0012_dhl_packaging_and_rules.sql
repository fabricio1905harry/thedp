-- ---------------------------------------------------------------------
-- DHL Packaging Types & Capacity Rules
-- ---------------------------------------------------------------------

create table if not exists packaging_types (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  length_cm numeric(8, 2) not null default 0,
  width_cm numeric(8, 2) not null default 0,
  height_cm numeric(8, 2) not null default 0,
  empty_weight_kg numeric(8, 2) not null default 0,
  max_weight_kg numeric(8, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists packaging_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  packaging_type_id uuid not null references packaging_types (id) on delete cascade,
  category text not null,
  min_quantity integer not null default 1,
  max_quantity integer not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists packaging_capacity_rules_cat_idx on packaging_capacity_rules (category, active);

-- Enable RLS
alter table packaging_types enable row level security;
alter table packaging_capacity_rules enable row level security;

-- Read policies for authenticated and anon users
drop policy if exists packaging_types_read on packaging_types;
create policy packaging_types_read on packaging_types
  for select using (true);

drop policy if exists packaging_capacity_rules_read on packaging_capacity_rules;
create policy packaging_capacity_rules_read on packaging_capacity_rules
  for select using (true);

-- Full access for service_role and staff
grant all on packaging_types to service_role;
grant select on packaging_types to anon, authenticated;

grant all on packaging_capacity_rules to service_role;
grant select on packaging_capacity_rules to anon, authenticated;

-- Seed default initial DHL Packaging Types (code, name, active)
insert into packaging_types (code, name, length_cm, width_cm, height_cm, empty_weight_kg, max_weight_kg, active)
values
  ('DHL_PACKAGE_1', 'DHL Package 1 (Small)', 0, 0, 0, 0.40, 5.00, true),
  ('DHL_PACKAGE_2', 'DHL Package 2 (Medium)', 0, 0, 0, 0.60, 10.00, true),
  ('DHL_BOX_8', 'DHL Box 8 (Large)', 0, 0, 0, 1.00, 30.00, true)
on conflict (code) do nothing;

-- Seed default initial Capacity Rules for 'Dresses' category
insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Dresses', 1, 5, true from packaging_types pt where pt.code = 'DHL_PACKAGE_1'
on conflict do nothing;

insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Dresses', 6, 10, true from packaging_types pt where pt.code = 'DHL_PACKAGE_2'
on conflict do nothing;

insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Dresses', 11, 20, true from packaging_types pt where pt.code = 'DHL_BOX_8'
on conflict do nothing;

-- Also seed rules for 'Vestidos' category so Portuguese category string matches seamlessly
insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Vestidos', 1, 5, true from packaging_types pt where pt.code = 'DHL_PACKAGE_1'
on conflict do nothing;

insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Vestidos', 6, 10, true from packaging_types pt where pt.code = 'DHL_PACKAGE_2'
on conflict do nothing;

insert into packaging_capacity_rules (packaging_type_id, category, min_quantity, max_quantity, active)
select pt.id, 'Vestidos', 11, 20, true from packaging_types pt where pt.code = 'DHL_BOX_8'
on conflict do nothing;
