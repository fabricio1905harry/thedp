-- packaging_types/packaging_capacity_rules (migration 0012) only had a
-- public "select using (true)" policy plus "grant all to service_role" —
-- there was no RLS policy letting a staff *session* write to these tables,
-- so src/app/admin/embalagens/actions.ts used the service-role client
-- (bypasses RLS) with no app-level staff check, leaving these two tables
-- writable by anyone who could reach the Server Actions directly.
-- This adds the same is_staff() write gate used everywhere else
-- (see products_staff_all etc. in 0001_init.sql) so the admin actions can
-- run on the caller's own session instead of the service-role client.

drop policy if exists packaging_types_staff_write on packaging_types;
create policy packaging_types_staff_write on packaging_types
  for all using (is_staff());

drop policy if exists packaging_capacity_rules_staff_write on packaging_capacity_rules;
create policy packaging_capacity_rules_staff_write on packaging_capacity_rules
  for all using (is_staff());

grant insert, update, delete on packaging_types to authenticated;
grant insert, update, delete on packaging_capacity_rules to authenticated;
