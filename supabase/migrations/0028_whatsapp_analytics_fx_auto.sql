-- ---------------------------------------------------------------------
-- 0028: WhatsApp button settings, analytics events, automatic FX and the
--       storage bucket for TDP-uploaded/treated images.
-- ---------------------------------------------------------------------

insert into app_settings (key, value) values
  ('whatsapp', jsonb_build_object(
    'active', false,
    'number', '',
    'messages', jsonb_build_object(
      'general', jsonb_build_object(
        'en', 'Hello! I would like more information about The Dressing Project.',
        'es', '¡Hola! Me gustaría más información sobre The Dressing Project.',
        'pt', 'Olá! Gostaria de mais informações sobre o The Dressing Project.'),
      'product', jsonb_build_object(
        'en', 'Hello! I am interested in this product: {product} — {url}',
        'es', '¡Hola! Me interesa este producto: {product} — {url}',
        'pt', 'Olá! Tenho interesse neste produto: {product} — {url}'),
      'order', jsonb_build_object(
        'en', 'Hello! I would like to talk about my order {order}.',
        'es', '¡Hola! Me gustaría hablar sobre mi pedido {order}.',
        'pt', 'Olá! Gostaria de falar sobre o meu pedido {order}.')
    )
  )),
  ('fx_auto', jsonb_build_object('enabled', true, 'provider', 'frankfurter'))
on conflict (key) do nothing;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  path text,
  source text,
  locale text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_event_idx on analytics_events (event, created_at desc);

alter table analytics_events enable row level security;
drop policy if exists analytics_events_staff_read on analytics_events;
create policy analytics_events_staff_read on analytics_events for select using (is_staff());
grant all on analytics_events to service_role;

alter table fx_rates add column if not exists source text not null default 'manual'
  check (source in ('manual', 'auto'));

-- Public bucket for images uploaded/treated by the TDP (Supabase only;
-- skipped on plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('tdp-images', 'tdp-images', true)
    on conflict (id) do nothing;
  end if;
end;
$$;
