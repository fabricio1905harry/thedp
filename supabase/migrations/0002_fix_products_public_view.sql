-- Bug found via scripts/smoke-test-auth.mjs: products_public was created
-- with security_invoker = true, which makes it enforce the *caller's* RLS
-- against the underlying `products` table — and anon has no SELECT policy
-- there (only is_staff() does), so the "public" catalog view silently
-- returned zero rows for anon/authenticated non-staff users.
--
-- Recreating without security_invoker makes the view run with the
-- definer's (view owner's) privileges, bypassing the base table's RLS,
-- while still only exposing the whitelisted non-price columns.

drop view if exists products_public;

create view products_public as
  select id, slug, title, title_en, title_es, category, status, created_at
  from products
  where status = 'published';

grant select on products_public to anon, authenticated;
