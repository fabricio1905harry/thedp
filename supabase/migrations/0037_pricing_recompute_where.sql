-- 0037: Supabase enables pg_safeupdate for API sessions ("UPDATE requires a
-- WHERE clause"), which made "recalculate all prices" fail when triggered
-- from the Admin. Same function, with an explicit WHERE. Safe to re-run.
create or replace function recompute_all_product_prices()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  update products set price_brl = price_brl where id is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function recompute_all_product_prices() from public;
grant execute on function recompute_all_product_prices() to authenticated, service_role;

select recompute_all_product_prices();
