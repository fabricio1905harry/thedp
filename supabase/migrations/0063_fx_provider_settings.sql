-- ---------------------------------------------------------------------
-- 0063: Exchange-rate update settings (source + frequency) and provider
--       of each stored rate.
--
-- app_settings.fx_auto = {
--   "enabled": true,
--   "source": "ecb" | "ptax",          -- ECB (Frankfurter) or Banco Central PTAX
--   "frequency": "daily" | "weekly",
--   "last_run": { "at", "ok", "source", "message" }   -- written by the job
-- }
-- Existing value ({"enabled": true, "provider": "frankfurter"}) keeps working:
-- missing keys default to source ecb / frequency daily.
-- Rerun-safe.
-- ---------------------------------------------------------------------

alter table fx_rates add column if not exists provider text;

update app_settings
set value = value
  || jsonb_build_object(
       'source', coalesce(value ->> 'source', 'ecb'),
       'frequency', coalesce(value ->> 'frequency', 'daily'))
where key = 'fx_auto' and jsonb_typeof(value) = 'object';

insert into app_settings (key, value)
values ('fx_auto', '{"enabled": true, "source": "ecb", "frequency": "daily"}'::jsonb)
on conflict (key) do nothing;
