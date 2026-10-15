-- ---------------------------------------------------------------------
-- 0031: Site CMS blocks, contact inbox, wholesale application fields.
--
-- * cms_blocks — only OVERRIDES of the default content that lives in code
--   (src/lib/cms-defaults.ts): ON/OFF, display order, visibility by
--   operation, EN/ES/PT content. No row = the default.
-- * contact_messages — Contact page form submissions (NEW / IN PROGRESS /
--   RESOLVED) feeding the Action Center.
-- * customers — wholesale application data and the "request more
--   information" status.
-- ---------------------------------------------------------------------

create table if not exists cms_blocks (
  scope text not null check (scope in ('home', 'about', 'contact', 'site')),
  block_key text not null,
  active boolean,
  sort integer,
  operations text[],
  content jsonb,
  partner text,
  placement_start date,
  placement_end date,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  primary key (scope, block_key)
);

alter table cms_blocks enable row level security;
drop policy if exists cms_blocks_staff on cms_blocks;
create policy cms_blocks_staff on cms_blocks for all using (is_staff()) with check (is_staff());
grant all on cms_blocks to service_role;

-- ---------------------------------------------------------------------
-- contact inbox
-- ---------------------------------------------------------------------

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  phone text,
  country text,
  subject text not null,
  message text not null,
  locale text,
  customer_id uuid references customers (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  internal_note text,
  handled_by uuid references customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx on contact_messages (status, created_at desc);

alter table contact_messages enable row level security;
drop policy if exists contact_messages_staff on contact_messages;
create policy contact_messages_staff on contact_messages for all using (is_staff()) with check (is_staff());
grant all on contact_messages to service_role;

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('contact_message', 'Contact Messages', 2, 'normal', '/admin/contatos?status=new', false, 25)
on conflict (code) do nothing;

create or replace function action_feed_contact_messages()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'new' then
    perform raise_action('contact_message', 'contact_message:' || new.id,
      new.subject || ' — ' || left(new.message, 80), 'contact_message', new.id, new.email,
      coalesce(nullif(new.company, ''), new.name), null, null, 1, '/admin/contatos?status=new');
  else
    perform resolve_action('contact_message:' || new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists contact_messages_action_feed on contact_messages;
create trigger contact_messages_action_feed
  after insert or update of status on contact_messages
  for each row execute function action_feed_contact_messages();

-- ---------------------------------------------------------------------
-- wholesale application
-- ---------------------------------------------------------------------

alter table customers
  add column if not exists company_address text,
  add column if not exists delivery_address text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists phone text,
  add column if not exists business_type text,
  add column if not exists has_physical_store boolean,
  add column if not exists store_count integer,
  add column if not exists brands_carried text,
  add column if not exists application_message text,
  add column if not exists referral_code text,
  add column if not exists applicant_confirmed boolean not null default false,
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references customers (id) on delete set null;

alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check
  check (status in ('pending', 'more_info', 'approved', 'rejected'));

create or replace function handle_new_customer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.customers (
    id, email, name, locale, customer_type, company_name, tax_id,
    company_address, delivery_address, website, instagram, phone, business_type,
    has_physical_store, store_count, brands_carried, application_message,
    referral_code, applicant_confirmed
  ) values (
    new.id,
    new.email,
    m ->> 'name',
    coalesce(m ->> 'locale', 'pt'),
    coalesce(m ->> 'customer_type', 'individual'),
    m ->> 'company_name',
    m ->> 'tax_id',
    m ->> 'company_address',
    m ->> 'delivery_address',
    m ->> 'website',
    m ->> 'instagram',
    m ->> 'phone',
    m ->> 'business_type',
    case when m ->> 'has_physical_store' in ('true', 'false') then (m ->> 'has_physical_store')::boolean end,
    case when (m ->> 'store_count') ~ '^[0-9]+$' then (m ->> 'store_count')::integer end,
    m ->> 'brands_carried',
    m ->> 'application_message',
    m ->> 'referral_code',
    coalesce((m ->> 'applicant_confirmed')::boolean, false)
  );
  return new;
end;
$$;

-- Pending wholesale accounts: keep the Action Center item while the account
-- waits for the TDP (pending or waiting for more information).
create or replace function action_feed_customers()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status in ('pending', 'more_info') and new.role = 'customer' then
    perform raise_action('customer_approval', 'customer_approval:' || new.id,
      case when new.status = 'more_info' then 'Waiting for more information from the applicant'
           else 'New wholesale account application' end,
      'customer', new.id, new.email,
      coalesce(nullif(new.company_name, ''), new.name, new.email), null, null, 1, '/admin/clientes');
  else
    perform resolve_action('customer_approval:' || new.id);
  end if;
  return null;
end;
$$;

update action_types set label = 'Pending Wholesale Accounts' where code = 'customer_approval';
