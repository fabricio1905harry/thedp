-- ---------------------------------------------------------------------
-- 0092: products.url / products.imagens were added by hand for an n8n
-- Supabase node. `url` is NOT NULL, so the import endpoint
-- (/api/ingest/product, which uses source_url and images) could not
-- insert products. The system keeps using source_url / images; url is
-- kept, but optional, and old values are copied over.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'products' and column_name = 'url') then
    alter table products alter column url drop not null;
    update products set source_url = url
     where coalesce(trim(source_url), '') = '' and coalesce(trim(url), '') <> '';
  end if;
end $$;
