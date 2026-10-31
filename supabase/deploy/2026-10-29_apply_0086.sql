-- ---------------------------------------------------------------------
-- 0086: homologation report 24/10 — placements (P17), collection stock
-- levels (P26), brand/collection/lookbook/edit extras (P27), size mapping
-- review and expiring placements in the Action Center (P29), reserve
-- storage window (P30), customers' country (P24)
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

-- ============================================================ P17 placements
-- The paid placement window only controls the PAID HIGHLIGHT (partner label,
-- featured spot). Brands, collections, lookbooks and edits stay visible while
-- active; a collection keeps its own schedule (starts_at / ends_at).
drop policy if exists brands_public_read on brands;
create policy brands_public_read on brands for select to anon, authenticated using (active);

drop policy if exists collections_public_read on collections;
create policy collections_public_read on collections for select to anon, authenticated
  using (active and tdp_window_ok(starts_at, ends_at));

drop policy if exists lookbooks_public_read on lookbooks;
create policy lookbooks_public_read on lookbooks for select to anon, authenticated using (active);

drop policy if exists tdp_edits_public_read on tdp_edits;
create policy tdp_edits_public_read on tdp_edits for select to anon, authenticated using (active);

insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('placements_expiring', 'Placements Expiring / Renewals', 3, 'normal', '/admin/placements', false, 32),
  ('size_mapping_review', 'Size Mapping Review Required', 6, 'normal', '/admin/tamanhos', false, 67),
  ('collection_ending',   'Collection Ending Soon',        6, 'normal', '/admin/colecoes', false, 68)
on conflict (code) do nothing;

create table if not exists placement_reminder_log (
  source text not null,
  source_id uuid not null,
  placement_end date not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  primary key (source, source_id, placement_end, days_before)
);
alter table placement_reminder_log enable row level security;
drop policy if exists placement_reminder_log_staff on placement_reminder_log;
create policy placement_reminder_log_staff on placement_reminder_log for all using (is_staff()) with check (is_staff());
grant all on placement_reminder_log to service_role;

create or replace function placement_rows()
returns table (src text, id uuid, label text, partner text, placement_end date)
language sql
stable
security definer set search_path = public
as $$
  select 'brands', b.id, b.name, b.partner, b.placement_end from brands b where b.paid_placement and b.placement_end is not null
  union all
  select 'collections', c.id, coalesce(nullif(c.title ->> 'en', ''), c.slug), c.partner, c.placement_end from collections c where c.paid_placement and c.placement_end is not null
  union all
  select 'lookbooks', l.id, coalesce(nullif(l.title ->> 'en', ''), l.slug), l.partner, l.placement_end from lookbooks l where l.paid_placement and l.placement_end is not null
  union all
  select 'tdp_edits', e.id, coalesce(nullif(e.title ->> 'en', ''), e.slug), e.partner, e.placement_end from tdp_edits e where e.paid_placement and e.placement_end is not null;
$$;

-- Action Center item per placement ending in <= 7 days (or already ended); resolved after renew / extend / end.
create or replace function refresh_placement_actions()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  d integer;
  raised integer := 0;
begin
  for r in select * from placement_rows() loop
    d := r.placement_end - current_date;
    if d <= 7 then
      perform raise_action(
        'placements_expiring', 'placement:' || r.src || ':' || r.id,
        case when d < 0 then 'Placement ended ' || (-d) || ' day(s) ago'
             when d = 0 then 'Placement ends today'
             else 'Placement ends in ' || d || ' day(s)' end,
        'placement', r.id, r.label, r.partner, null, null, 1, '/admin/placements',
        case when d <= 0 then 'critical' when d <= 1 then 'high' else 'normal' end
      );
      raised := raised + 1;
    else
      perform resolve_action('placement:' || r.src || ':' || r.id);
    end if;
  end loop;

  -- items whose placement was ended / removed
  update action_items ai
     set status = 'resolved', resolution = 'auto', resolved_at = now(), updated_at = now()
   where ai.action_type = 'placements_expiring' and ai.status = 'open'
     and not exists (
       select 1 from placement_rows() p
        where 'placement:' || p.src || ':' || p.id = ai.dedupe_key and p.placement_end - current_date <= 7
     );
  return raised;
end;
$$;

-- reminders 7 days, 1 day and on the day (each once per end date); the cron sends them to the team
create or replace function due_placement_reminders()
returns table (src text, id uuid, label text, partner text, placement_end date, days_before integer)
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  d integer;
  k integer;
begin
  for r in select * from placement_rows() loop
    d := r.placement_end - current_date;
    for k in select unnest(array[0, 1, 7]) loop
      if d <= k and d >= -1 then
        insert into placement_reminder_log (source, source_id, placement_end, days_before)
        values (r.src, r.id, r.placement_end, k)
        on conflict do nothing;
        if found then
          src := r.src; id := r.id; label := r.label; partner := r.partner; placement_end := r.placement_end; days_before := k;
          return next;
        end if;
        exit; -- only the closest reminder level due now
      end if;
    end loop;
  end loop;
end;
$$;
revoke execute on function refresh_placement_actions() from public;
revoke execute on function due_placement_reminders() from public;
grant execute on function refresh_placement_actions() to service_role;
grant execute on function due_placement_reminders() to service_role;

select refresh_placement_actions();

-- ===================================================== P26 collection stock levels
alter table collections
  add column if not exists alert_review_styles integer not null default 10,
  add column if not exists alert_low_styles integer not null default 5,
  add column if not exists alert_end_days integer not null default 14;

-- the old single threshold becomes the "low" level when it was set
update collections set alert_low_styles = alert_min_styles
 where alert_min_styles > 0 and alert_low_styles = 5 and alert_review_styles = 10;

create or replace function refresh_collection_alert(p_collection uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c collections;
  tot integer;
  av integer;
  label text;
  ends_in integer;
begin
  select * into c from collections where id = p_collection;
  if c.id is null then
    perform resolve_action('collection_low_stock:' || p_collection);
    perform resolve_action('collection_ending:' || p_collection);
    return;
  end if;
  select total_styles, available_styles into tot, av from collection_stock_counts(p_collection);
  label := coalesce(nullif(c.title ->> 'en', ''), c.slug);

  if c.active and tot > 0 and c.alert_low_styles > 0 and av <= c.alert_low_styles then
    perform raise_action(
      'collection_low_stock', 'collection_low_stock:' || c.id,
      'LOW INVENTORY — REVIEW REQUIRED · ' || label || ': ' || av || '/' || tot || ' styles available (limit ' || c.alert_low_styles || ')',
      'collection', c.id, c.slug, label, null, null, 1, '/admin/colecoes/' || c.id, 'high'
    );
  elsif c.active and tot > 0 and c.alert_review_styles > 0 and av <= c.alert_review_styles then
    perform raise_action(
      'collection_low_stock', 'collection_low_stock:' || c.id,
      'COLLECTION INVENTORY REVIEW · ' || label || ': ' || av || '/' || tot || ' styles available (limit ' || c.alert_review_styles || ')',
      'collection', c.id, c.slug, label, null, null, 1, '/admin/colecoes/' || c.id, 'normal'
    );
  else
    perform resolve_action('collection_low_stock:' || c.id);
  end if;

  -- reminder before the collection end date
  if c.active and c.ends_at is not null then
    ends_in := c.ends_at - current_date;
    if ends_in >= 0 and ends_in <= c.alert_end_days then
      perform raise_action(
        'collection_ending', 'collection_ending:' || c.id,
        label || ': collection ends in ' || ends_in || ' day(s) (' || to_char(c.ends_at, 'YYYY-MM-DD') || ')',
        'collection', c.id, c.slug, label, null, null, 1, '/admin/colecoes/' || c.id
      );
    else
      perform resolve_action('collection_ending:' || c.id);
    end if;
  else
    perform resolve_action('collection_ending:' || c.id);
  end if;
end;
$$;

drop trigger if exists collections_alert on collections;
create trigger collections_alert
  after insert or update of active, alert_min_styles, alert_review_styles, alert_low_styles, alert_end_days, ends_at on collections
  for each row execute function collections_alert();

create or replace function refresh_all_collection_alerts()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from collections loop
    perform refresh_collection_alert(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function refresh_all_collection_alerts() from public;
grant execute on function refresh_all_collection_alerts() to service_role;
select refresh_all_collection_alerts();

-- ============================================================= P27 entity extras
alter table brands      add column if not exists cover_mobile_url text, add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';
alter table collections add column if not exists cover_mobile_url text, add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';
alter table lookbooks   add column if not exists cover_mobile_url text, add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';
alter table tdp_edits   add column if not exists cover_mobile_url text, add column if not exists visible_ops text[] not null default '{intl_b2b,intl_b2c,br_b2b,br_b2c}';

alter table lookbooks
  add column if not exists brand_id uuid references brands (id) on delete set null,
  add column if not exists collection_id uuid references collections (id) on delete set null;

alter table tdp_edits add column if not exists gallery jsonb not null default '[]'::jsonb;

create table if not exists tdp_edit_brands (
  edit_id uuid not null references tdp_edits (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  sort integer not null default 0,
  primary key (edit_id, brand_id)
);
alter table tdp_edit_brands enable row level security;
drop policy if exists tdp_edit_brands_staff on tdp_edit_brands;
create policy tdp_edit_brands_staff on tdp_edit_brands for all using (is_staff()) with check (is_staff());
drop policy if exists tdp_edit_brands_public_read on tdp_edit_brands;
create policy tdp_edit_brands_public_read on tdp_edit_brands for select to anon, authenticated
  using (exists (select 1 from tdp_edits e where e.id = edit_id));
grant select on tdp_edit_brands to anon, authenticated;
grant all on tdp_edit_brands to authenticated, service_role;

-- ================================================== P29 size mapping review
create or replace function refresh_size_mapping_action()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
  sample text;
begin
  select count(*), string_agg(sz, ', ' order by sz)
    into n, sample
    from (
      select distinct trim(v.size) as sz
        from variants v
        join products p on p.id = v.product_id and p.status <> 'archived'
       where coalesce(trim(v.size), '') <> ''
         and not exists (
           select 1 from size_chart s
            where lower(s.size_br) = lower(trim(v.size))
               or lower(coalesce(s.letter, '')) = lower(trim(v.size))
               or exists (select 1 from unnest(s.aliases) a where lower(a) = lower(trim(v.size)))
         )
       limit 50
    ) x;
  if n > 0 then
    perform raise_action(
      'size_mapping_review', 'size_mapping_review',
      n || ' supplier size(s) without a size-chart match: ' || left(sample, 120),
      null, null, null, null, null, null, n, '/admin/tamanhos'
    );
  else
    perform resolve_action('size_mapping_review');
  end if;
  return n;
end;
$$;
revoke execute on function refresh_size_mapping_action() from public;
grant execute on function refresh_size_mapping_action() to authenticated, service_role;
select refresh_size_mapping_action();

-- ======================================== P30 reserve: 180 days = STORAGE after the shipping date
-- reserve_max_days is the storage window counted from the date the buyer wants the goods shipped
-- (reserve_desired_delivery_date); without a desired date it falls back to the reservation date.
create or replace function orders_reserve_lifecycle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  max_days integer := coalesce(get_setting_numeric('reserve_max_days'), 180);
  base_date timestamptz;
begin
  if new.payment_mode <> 'reserve' then
    return new;
  end if;

  base_date := coalesce(new.reserve_desired_delivery_date::timestamptz, new.reserved_at, now());

  if new.status = 'reserved' and new.reserve_stage is null then
    new.reserve_stage := 'reserved';
    new.reserve_stage_at := now();
    new.reserve_expires_at := coalesce(new.reserve_expires_at, base_date + make_interval(days => max_days));
  elsif new.status in ('paid', 'processing') and new.reserve_stage in ('reserved', 'balance_due', 'overdue') then
    new.reserve_stage := 'ready_to_ship';
    new.reserve_stage_at := now();
  elsif new.status in ('shipped', 'delivered') and new.reserve_stage is distinct from 'completed' and new.reserve_stage is not null then
    new.reserve_stage := 'completed';
    new.reserve_stage_at := now();
  end if;

  -- the storage window follows the desired shipping date when it changes
  if tg_op = 'UPDATE' and new.reserve_stage in ('reserved', 'balance_due', 'overdue')
     and new.reserve_desired_delivery_date is distinct from old.reserve_desired_delivery_date
     and new.reserve_desired_delivery_date is not null then
    new.reserve_expires_at := new.reserve_desired_delivery_date::timestamptz + make_interval(days => max_days);
  end if;

  if new.reserve_balance_due_date is null and new.reserve_desired_delivery_date is not null then
    new.reserve_balance_due_date := new.reserve_desired_delivery_date
      - coalesce(get_setting_numeric('reserve_balance_lead_days'), 15)::integer;
  end if;
  return new;
end;
$$;

-- orders already reserved with a desired date: recount the storage window from it
update orders
   set reserve_expires_at = reserve_desired_delivery_date::timestamptz
         + make_interval(days => coalesce(get_setting_numeric('reserve_max_days'), 180)::integer)
 where payment_mode = 'reserve' and reserve_stage in ('reserved', 'balance_due', 'overdue')
   and reserve_desired_delivery_date is not null;

-- ================================================== P24 customers' country
-- buyers registered before the country was mandatory: take it from their latest order's address
update customers c
   set country = upper(left(o.shipping_address ->> 'countryCode', 2))
  from (
    select distinct on (customer_id) customer_id, shipping_address
      from orders
     where coalesce(shipping_address ->> 'countryCode', '') <> ''
     order by customer_id, created_at desc
  ) o
 where o.customer_id = c.id and coalesce(c.country, '') = '';
