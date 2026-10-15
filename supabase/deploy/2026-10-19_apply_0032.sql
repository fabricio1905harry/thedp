-- 0032: CMS also manages institutional pages (FAQ, terms, privacy, returns).
alter table public.cms_blocks drop constraint if exists cms_blocks_scope_check;
alter table public.cms_blocks
  add constraint cms_blocks_scope_check check (scope in ('home', 'about', 'contact', 'site', 'pages'));
