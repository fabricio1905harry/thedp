-- ---------------------------------------------------------------------
-- 0093: Action Center items of deleted products
-- Deleting products left their Action Center items open ("Produtos para
-- revisar", "Dados de envio necessários", margem, categoria…); clicking them
-- opened /admin/produtos/<id> of a product that no longer exists (404).
-- * one-time: resolve the open items whose product does not exist anymore
-- * from now on: deleting a product resolves its open items
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------
update action_items a
   set status = 'resolved', resolution = 'auto', resolved_at = now(), updated_at = now()
 where a.status = 'open'
   and a.reference_type = 'product'
   and a.reference_id is not null
   and not exists (select 1 from products p where p.id = a.reference_id);

create or replace function products_resolve_actions_on_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update action_items
     set status = 'resolved', resolution = 'auto', resolved_at = now(), updated_at = now()
   where status = 'open' and reference_type = 'product' and reference_id = old.id;
  return old;
end;
$$;

drop trigger if exists products_resolve_actions_on_delete on products;
create trigger products_resolve_actions_on_delete
  after delete on products
  for each row execute function products_resolve_actions_on_delete();
