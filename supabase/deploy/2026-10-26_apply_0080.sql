-- 0080: the storefront reads the CMS tables with the public key when the
-- deployment has no service-role key. CMS content is public by design
-- (it is what the site shows). Writes stay staff-only. Safe to re-run.
grant select on cms_blocks to anon, authenticated;
drop policy if exists cms_blocks_public_read on cms_blocks;
create policy cms_blocks_public_read on cms_blocks for select to anon, authenticated using (true);
