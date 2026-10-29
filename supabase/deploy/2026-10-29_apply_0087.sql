-- ---------------------------------------------------------------------
-- 0087: homologation report 24/10 — language of the order communication (P23)
--
-- orders.communication_locale: language of the e-mails / messages about ONE
-- order (en / es / pt). Empty = the buyer's account language. Set by the
-- TDP in Admin -> order when the buyer asks for another language.
-- queue_notification() uses it for every order-related message.
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

alter table orders
  add column if not exists communication_locale text
    check (communication_locale is null or communication_locale in ('en', 'es', 'pt'));

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
  order_loc text;
  payload jsonb;
  outbox_id uuid;
  ch text;
begin
  select * into c from customers where id = p_customer_id;
  if c.id is null or coalesce(c.email, '') = '' then
    return;
  end if;
  loc := case when c.locale in ('es', 'pt') then c.locale else 'en' end;
  if p_order_id is not null then
    select communication_locale into order_loc from orders where id = p_order_id;
    if order_loc in ('en', 'es', 'pt') then
      loc := order_loc;
    end if;
  end if;
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
