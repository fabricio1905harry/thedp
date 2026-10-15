-- 0033: gives admin role + approved status to affonsori@gmail.com.
-- The person must already have an account (sign-up on the site or Supabase
-- Auth → Users). Safe to re-run.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'affonsori@gmail.com';
  if v_id is null then
    raise exception 'User affonsori@gmail.com not found in auth.users — create the account first (sign up on the site or Supabase → Authentication → Users), then run this again.';
  end if;

  insert into public.customers (id, email, role, status, approved_at)
  values (v_id, 'affonsori@gmail.com', 'admin', 'approved', now())
  on conflict (id) do update
    set role = 'admin',
        status = 'approved',
        approved_at = coalesce(public.customers.approved_at, now());
end
$$;

select id, email, role, status, approved_at from public.customers where lower(email) = 'affonsori@gmail.com';
