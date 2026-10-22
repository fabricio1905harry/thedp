-- 0038: make sure the Admin (authenticated role) can write the CMS tables.
-- RLS already limits writes to staff; this only guarantees table privileges.
-- Safe to re-run.
grant select, insert, update, delete on cms_blocks to authenticated;
grant select, insert, update, delete on contact_messages to authenticated;
alter table cms_blocks drop constraint if exists cms_blocks_scope_check;
alter table cms_blocks
  add constraint cms_blocks_scope_check check (scope in ('home', 'about', 'contact', 'site', 'pages'));
drop policy if exists cms_blocks_staff on cms_blocks;
create policy cms_blocks_staff on cms_blocks for all using (is_staff()) with check (is_staff());
