-- ---------------------------------------------------------------------
-- 0091: supplier registration in Admin → Automação (name + URL)
-- connectors had only name, status and "included in contract".
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------
alter table connectors
  add column if not exists supplier_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'connectors_supplier_url_check') then
    alter table connectors
      add constraint connectors_supplier_url_check check (supplier_url is null or supplier_url ~* '^https?://');
  end if;
end $$;

-- one supplier per name (case-insensitive)
create unique index if not exists connectors_supplier_name_key on connectors (lower(trim(supplier_name)));

grant select, insert, update, delete on connectors to authenticated;
grant all on connectors to service_role;
