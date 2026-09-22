-- ---------------------------------------------------------------------
-- Enable Supabase Realtime publication safely for ALL application tables
-- ---------------------------------------------------------------------

do $$
declare
  tbl text;
  tbls text[] := array[
    'products',
    'variants',
    'product_images',
    'connectors',
    'product_connectors',
    'customers',
    'addresses',
    'fx_rates',
    'orders',
    'order_items'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach tbl in array tbls loop
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      where p.pubname = 'supabase_realtime' and c.relname = tbl
    ) then
      execute format('alter publication supabase_realtime add table %I', tbl);
    end if;
  end loop;
end $$;
