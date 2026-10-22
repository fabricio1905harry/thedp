-- ---------------------------------------------------------------------
-- 0060: Bank-transfer payment proof upload + failed card attempts.
--
-- * payments.proof_path / proof_name / proof_uploaded_at — the buyer's
--   proof lives in the PRIVATE Storage bucket "payment-proofs"
--   (path: <customer_id>/<order_id>/<file>). Admin reads it through a
--   signed URL; confirmation of the payment stays manual.
-- * payment_attempts — failed / canceled / expired Stripe attempts, shown
--   to the staff in the order's payment list.
-- Rerun-safe. The storage part is skipped where the storage schema does
-- not exist (plain Postgres test databases).
-- ---------------------------------------------------------------------

alter table payments
  add column if not exists proof_path text,
  add column if not exists proof_name text,
  add column if not exists proof_uploaded_at timestamptz;

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  method_code text not null default 'stripe_card',
  status text not null check (status in ('failed', 'canceled', 'expired')),
  source text not null default 'stripe_webhook',
  stripe_ref text,
  amount numeric(12, 2),
  currency text,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists payment_attempts_order_idx on payment_attempts (order_id, created_at desc);
create unique index if not exists payment_attempts_stripe_ref_uq
  on payment_attempts (stripe_ref, status) where stripe_ref is not null;

alter table payment_attempts enable row level security;
drop policy if exists payment_attempts_staff on payment_attempts;
create policy payment_attempts_staff on payment_attempts for all using (is_staff()) with check (is_staff());
drop policy if exists payment_attempts_owner_read on payment_attempts;
create policy payment_attempts_owner_read on payment_attempts for select
  using (exists (select 1 from orders o where o.id = payment_attempts.order_id and o.customer_id = auth.uid()));
grant select on payment_attempts to authenticated;
grant all on payment_attempts to service_role;

-- Private bucket + policies (Supabase Storage only).
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found: skipping payment-proofs bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('payment-proofs', 'payment-proofs', false, 8388608,
          array['application/pdf', 'image/jpeg', 'image/png'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 8388608,
        allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

  execute 'drop policy if exists payment_proofs_owner_insert on storage.objects';
  execute $p$create policy payment_proofs_owner_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'payment-proofs'
      and (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[2] and o.customer_id = auth.uid()
      )
    )$p$;

  execute 'drop policy if exists payment_proofs_owner_read on storage.objects';
  execute $p$create policy payment_proofs_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute 'drop policy if exists payment_proofs_staff_read on storage.objects';
  execute $p$create policy payment_proofs_staff_read on storage.objects for select to authenticated
    using (bucket_id = 'payment-proofs' and public.is_staff())$p$;
end $$;
