-- Manual FX rates: no external API. An operator enters BRL-per-USD and
-- BRL-per-EUR in the admin, we keep the append-only log in fx_rates and
-- read the latest row per quote currency as "current".

alter table fx_rates
  add column updated_by uuid references customers (id);

-- fx_rates_staff_write already restricts insert to is_staff(); replace it
-- with an explicit check that rate is positive (belt-and-suspenders on top
-- of the app-level validation in the server action).
drop policy if exists fx_rates_staff_write on fx_rates;
create policy fx_rates_staff_write on fx_rates
  for insert with check (is_staff() and rate > 0);
