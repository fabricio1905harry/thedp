-- ---------------------------------------------------------------------
-- Allow public read access to product_images for catalog display
-- ---------------------------------------------------------------------

alter table product_images enable row level security;

drop policy if exists product_images_public_read on product_images;
create policy product_images_public_read on product_images
  for select using (true);

grant select on product_images to anon, authenticated;
grant all on product_images to service_role;
