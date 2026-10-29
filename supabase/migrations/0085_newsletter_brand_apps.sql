-- ---------------------------------------------------------------------
-- 0085: homologation report 24/10 — newsletter (P22) and Become a Brand (P28)
--
-- * newsletter_subscribers — "Stay in the know" form of the footer.
-- * brand_applications     — Become a Brand form with a status workflow
--   (NEW, UNDER REVIEW, CONTACTED, APPROVED, NOT A FIT, ON HOLD) and
--   internal notes; every new application raises a "Brand Applications"
--   item in the Action Center.
-- Both are written by the site through the service role; only staff read them.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  locale text,
  source text,
  created_at timestamptz not null default now()
);
create unique index if not exists newsletter_subscribers_email_key on newsletter_subscribers (lower(email));

create table if not exists brand_applications (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website text,
  instagram text,
  country text,
  message text,
  locale text,
  status text not null default 'new'
    check (status in ('new', 'under_review', 'contacted', 'approved', 'not_a_fit', 'on_hold')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_applications_status_idx on brand_applications (status, created_at desc);

alter table newsletter_subscribers enable row level security;
alter table brand_applications enable row level security;
drop policy if exists newsletter_subscribers_staff on newsletter_subscribers;
create policy newsletter_subscribers_staff on newsletter_subscribers for all using (is_staff()) with check (is_staff());
drop policy if exists brand_applications_staff on brand_applications;
create policy brand_applications_staff on brand_applications for all using (is_staff()) with check (is_staff());
grant all on newsletter_subscribers, brand_applications to authenticated, service_role;

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('brand_application', 'Brand Applications', 2, 'normal', '/admin/candidaturas-marcas', false, 27)
on conflict (code) do nothing;

create or replace function action_feed_brand_applications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  select count(*) into n from brand_applications where status = 'new';
  if n > 0 then
    perform raise_action('brand_application', 'brand_application', n || ' new brand application(s)',
      null, null, null, null, null, null, n, '/admin/candidaturas-marcas');
  else
    perform resolve_action('brand_application');
  end if;
  return null;
end;
$$;

drop trigger if exists brand_applications_action_feed on brand_applications;
create trigger brand_applications_action_feed
  after insert or update of status or delete on brand_applications
  for each statement execute function action_feed_brand_applications();
