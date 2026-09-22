-- "Novidades" derives from created_at recency; "Destaques" needs an
-- explicit operator toggle since there's no other signal for it.
alter table products add column is_featured boolean not null default false;

drop view if exists products_public;
create view products_public as
  select id, slug, title, title_en, title_es, category, status, is_featured, created_at
  from products
  where status = 'published';

grant select on products_public to anon, authenticated;
