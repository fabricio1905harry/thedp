-- ---------------------------------------------------------------------
-- 0070: Notifications engine (post-payment operations, stream 4)
--
-- * notification_templates — approved texts per event × channel × locale
--   (the client wants approved texts, NOT AI-translated at send time).
--   Seeds are NOT inserted here: Admin → Notificações creates the default
--   drafts (approved = false) on demand and the TDP approves each one.
-- * notification_log — one row per message (e-mail, WhatsApp, SMS).
--   E-mail rows link to email_outbox (the actual queue, sent by
--   src/lib/email.ts); WhatsApp/SMS rows are queued here and handled by the
--   messaging adapter (mock unless provider env vars exist).
-- * queue_notification() — single entry point used by triggers, crons and
--   server actions.
-- * Triggers on orders / payments → events: order_request_received,
--   stock_confirmed, reserve_confirmed, payment_received.
--   (shipment events: migration 0073; reserve reminders: 0072; abandoned
--   cart: 0071.)
-- * queue_payment_window_reminders() — reminder before the stock hold
--   window ends (hourly cron).
-- ---------------------------------------------------------------------

create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  locale text not null check (locale in ('en', 'es', 'pt')),
  subject text not null default '',
  body text not null default '',
  approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references customers (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references customers (id) on delete set null,
  unique (event, channel, locale)
);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  locale text not null default 'en',
  to_address text,
  customer_id uuid references customers (id) on delete set null,
  order_id uuid references orders (id) on delete set null,
  subject text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider text,                 -- resend | mock | twilio …
  provider_ref text,
  error text,
  is_test boolean not null default false,
  email_outbox_id uuid references email_outbox (id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_log_created_idx on notification_log (created_at desc);
create index if not exists notification_log_order_idx on notification_log (order_id);
create index if not exists notification_log_outbox_idx on notification_log (email_outbox_id);
create index if not exists notification_log_queue_idx on notification_log (channel, status) where status = 'queued';
create unique index if not exists notification_log_dedupe_uq on notification_log (dedupe_key) where dedupe_key is not null;

alter table notification_templates enable row level security;
alter table notification_log enable row level security;
drop policy if exists notification_templates_staff on notification_templates;
create policy notification_templates_staff on notification_templates for all using (is_staff()) with check (is_staff());
drop policy if exists notification_log_staff on notification_log;
create policy notification_log_staff on notification_log for all using (is_staff()) with check (is_staff());
grant all on notification_templates, notification_log to service_role;
grant select, insert, update, delete on notification_templates, notification_log to authenticated;

insert into app_settings (key, value) values
  ('notifications_require_approval', 'true'::jsonb),
  ('payment_window_reminder_hours', '6'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- queue_notification: e-mail → email_outbox (+ log row linked to it);
-- WhatsApp / SMS → log row 'queued' when the customer has a phone and a
-- template exists for that channel. p_dedupe makes reminders idempotent.
-- ---------------------------------------------------------------------

create or replace function queue_notification(
  p_event text,
  p_customer_id uuid,
  p_order_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c customers;
  loc text;
  payload jsonb;
  outbox_id uuid;
  ch text;
begin
  select * into c from customers where id = p_customer_id;
  if c.id is null or coalesce(c.email, '') = '' then
    return;
  end if;
  loc := case when c.locale in ('es', 'pt') then c.locale else 'en' end;
  payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'buyer_name', coalesce(nullif(c.name, ''), nullif(c.company_name, ''), ''),
    'customer_id', c.id
  );
  if p_order_id is not null then
    payload := payload || jsonb_build_object('order_id', p_order_id)
      || coalesce((select jsonb_build_object('order_number', o.order_number) from orders o where o.id = p_order_id), '{}'::jsonb);
  end if;

  if p_dedupe is not null and exists (select 1 from notification_log where dedupe_key = p_dedupe) then
    return;
  end if;

  insert into email_outbox (to_email, template, locale, payload)
  values (c.email, p_event, loc, payload)
  returning id into outbox_id;

  insert into notification_log (event, channel, locale, to_address, customer_id, order_id, payload, email_outbox_id, dedupe_key)
  values (p_event, 'email', loc, c.email, c.id, p_order_id, payload, outbox_id, p_dedupe)
  on conflict do nothing;

  if coalesce(c.phone, '') <> '' then
    foreach ch in array array['whatsapp', 'sms'] loop
      if exists (select 1 from notification_templates t where t.event = p_event and t.channel = ch and t.locale in (loc, 'en')) then
        insert into notification_log (event, channel, locale, to_address, customer_id, order_id, payload, dedupe_key)
        values (p_event, ch, loc, c.phone, c.id, p_order_id, payload,
                case when p_dedupe is null then null else p_dedupe || ':' || ch end)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function queue_notification(text, uuid, uuid, jsonb, text) from public;
grant execute on function queue_notification(text, uuid, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------
-- order status → events
-- ---------------------------------------------------------------------

create or replace function orders_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  base := jsonb_build_object(
    'currency', new.currency,
    'total', new.total,
    'stock_hold_until', new.stock_hold_until,
    'reserve_amount', new.reserve_amount
  );

  if tg_op = 'INSERT' and new.status in ('order_request', 'created') then
    perform queue_notification('order_request_received', new.customer_id, new.id, base);
  elsif new.status = 'confirmed_awaiting_payment' then
    perform queue_notification('stock_confirmed', new.customer_id, new.id, base);
  elsif new.status = 'reserved' then
    perform queue_notification('reserve_confirmed', new.customer_id, new.id, base);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_notify on orders;
create trigger orders_notify
  after insert or update of status on orders
  for each row execute function orders_notify();

-- Confirmed payment → "payment received" (the Reserve deposit is announced
-- as reserve_confirmed by the order status trigger instead).
create or replace function payments_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o orders;
begin
  if new.status <> 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return null;
  end if;
  if new.kind = 'reserve_deposit' then
    return null;
  end if;
  select * into o from orders where id = new.order_id;
  if o.id is null then
    return null;
  end if;
  perform queue_notification('payment_received', o.customer_id, o.id,
    jsonb_build_object('amount', new.amount, 'currency', new.currency, 'kind', new.kind),
    'payment_received:' || new.id);
  return null;
end;
$$;

drop trigger if exists payments_notify on payments;
create trigger payments_notify
  after insert or update of status on payments
  for each row execute function payments_notify();

-- ---------------------------------------------------------------------
-- Reminder: the stock hold window ends soon (hourly cron).
-- ---------------------------------------------------------------------

create or replace function queue_payment_window_reminders()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  hrs numeric := coalesce(get_setting_numeric('payment_window_reminder_hours'), 6);
  r record;
  n integer := 0;
begin
  if hrs <= 0 then
    return 0;
  end if;
  for r in
    select o.id, o.customer_id, o.stock_hold_until, o.currency, o.total
    from orders o
    where o.status = 'confirmed_awaiting_payment'
      and o.payment_released_at is not null
      and o.stock_hold_until is not null
      and o.stock_hold_until > now()
      and o.stock_hold_until <= now() + make_interval(secs => hrs * 3600)
      and not exists (select 1 from payments p where p.order_id = o.id and p.status in ('confirmed', 'pending_verification'))
  loop
    perform queue_notification('payment_window_expiring', r.customer_id, r.id,
      jsonb_build_object('stock_hold_until', r.stock_hold_until, 'currency', r.currency, 'total', r.total),
      'payment_window_expiring:' || r.id || ':' || extract(epoch from r.stock_hold_until)::bigint);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function queue_payment_window_reminders() from public;
grant execute on function queue_payment_window_reminders() to service_role;
