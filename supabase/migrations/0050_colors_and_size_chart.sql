-- ---------------------------------------------------------------------
-- 0050: color normalization + size chart (TDP EXP, phase 2)
--
-- * tdp_colors          — normalized colors with EN/ES/PT approved names + hex.
-- * supplier_color_map  — supplier color text (INTERNAL) -> tdp color, with
--                         review status (auto / needs_review / approved) and
--                         manual override. Staff only; the site reads it
--                         through the service role and only exposes TDP names.
-- * new supplier colors found in `variants` are registered automatically as
--   needs_review and raise the Action Center item `colors_to_review`.
-- * size_chart          — BR / US / EU / letter / measurements / notes EN-ES-PT
--   (seed to be validated by the client; editable at Admin -> Tamanhos).
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

-- Action Center types of this stream (registered once here)
insert into action_types (code, label, priority_group, default_severity, card_href, manual_resolve, sort) values
  ('colors_to_review',    'Colors to Review',          6, 'normal', '/admin/cores', false, 65),
  ('collection_low_stock','Collection Stock Alert',    6, 'normal', '/admin/colecoes', false, 66),
  ('restock_demand',      'Restock Demand (Notify Me)',3, 'normal', '/admin/avise-me', false, 31)
on conflict (code) do nothing;

-- ---------------------------------------------------------------- colors
create table if not exists tdp_colors (
  id text primary key,                       -- normalized id, e.g. 'OLIVE GREEN'
  name_en text not null,
  name_es text not null,
  name_pt text not null,
  hex text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_color_map (
  supplier_key text primary key,             -- lower(trim(color)), single spaces
  supplier_color text not null,              -- original text as it came from the supplier
  tdp_color_id text references tdp_colors (id) on update cascade on delete set null,
  status text not null default 'needs_review' check (status in ('auto', 'needs_review', 'approved')),
  manual_override boolean not null default false,
  seen_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references customers (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists supplier_color_map_status_idx on supplier_color_map (status);

insert into tdp_colors (id, name_en, name_es, name_pt, hex, sort) values
  ('YELLOW',          'Yellow',            'Amarillo',        'Amarelo',         '#f2d24b', 10),
  ('WHITE / OFF-WHITE','White / Off-white', 'Blanco / Blanco roto', 'Branco / Off-white', '#f4f1ea', 20),
  ('BURGUNDY',        'Burgundy',          'Borgoña',         'Marsala',         '#6d1f2c', 30),
  ('OLIVE GREEN',     'Olive green',       'Verde oliva',     'Verde oliva',     '#6b6b2f', 40),
  ('PINK',            'Pink',              'Rosa',            'Rosa pink',       '#e8559a', 50),
  ('BLACK',           'Black',             'Negro',           'Preto',           '#141312', 60),
  ('BLACK AND WHITE', 'Black and white',   'Blanco y negro',  'Preto e branco',  '#8a8a8a', 70),
  ('LIGHT BLUE',      'Light blue',        'Azul claro',      'Azul claro',      '#9ec5e8', 80),
  ('TERRACOTTA',      'Terracotta',        'Terracota',       'Terracota',       '#c0603d', 90),
  ('GREEN',           'Green',             'Verde',           'Verde',           '#2f6b4f', 100),
  ('RED',             'Red',               'Rojo',            'Vermelho',        '#c0281f', 110),
  ('BROWN',           'Brown',             'Marrón',          'Marrom',          '#6b4430', 120),
  ('LIGHT GREEN',     'Light green',       'Verde claro',     'Verde claro',     '#a8d5b0', 130),
  ('LIGHT PINK',      'Light pink',        'Rosa claro',      'Rosa claro',      '#f4c7d6', 140),
  ('BLUE',            'Blue',              'Azul',            'Azul',            '#2451c4', 150)
on conflict (id) do nothing;

-- supplier text -> normalized color (client table). needs_review = suggestion to confirm.
insert into supplier_color_map (supplier_key, supplier_color, tdp_color_id, status) values
  ('amarelo',       'Amarelo',       'YELLOW',            'auto'),
  ('branco',        'Branco',        'WHITE / OFF-WHITE', 'auto'),
  ('marsala',       'Marsala',       'BURGUNDY',          'auto'),
  ('oliva',         'Oliva',         'OLIVE GREEN',       'auto'),
  ('verde oliva',   'Verde Oliva',   'OLIVE GREEN',       'auto'),
  ('pink',          'Pink',          'PINK',              'auto'),
  ('preto',         'Preto',         'BLACK',             'auto'),
  ('preto e branco','Preto E Branco','BLACK AND WHITE',   'auto'),
  ('serenity',      'Serenity',      'LIGHT BLUE',        'auto'),
  ('terracota',     'Terracota',     'TERRACOTTA',        'auto'),
  ('verde',         'Verde',         'GREEN',             'auto'),
  ('vermelho',      'Vermelho',      'RED',               'auto'),
  ('cacau',         'Cacau',         'BROWN',             'needs_review'),
  ('menta',         'Menta',         'LIGHT GREEN',       'needs_review'),
  ('rose',          'Rose',          'LIGHT PINK',        'needs_review'),
  ('royal',         'Royal',         'BLUE',              'needs_review'),
  ('azul marinho',  'Azul Marinho',  'BLUE',              'needs_review'),
  ('coral',         'Coral',         null,                'needs_review'),
  ('violeta',       'Violeta',       null,                'needs_review')
on conflict (supplier_key) do nothing;

create or replace function norm_color_key(c text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(c, '')), '\s+', ' ', 'g'));
$$;

-- Pending review count -> Action Center
create or replace function refresh_color_review_action()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  select count(*) into n from supplier_color_map where status = 'needs_review';
  if n > 0 then
    perform raise_action(
      'colors_to_review', 'colors_to_review',
      n || ' supplier color(s) to review', null, null, null, null, null, null, n, '/admin/cores'
    );
  else
    perform resolve_action('colors_to_review');
  end if;
end;
$$;

-- Registers a supplier color seen on a variant (auto-maps exact TDP names in any language)
create or replace function register_supplier_color(p_color text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  k text := norm_color_key(p_color);
  match text;
  inserted integer;
begin
  if k = '' then return; end if;
  select id into match from tdp_colors
   where norm_color_key(name_en) = k or norm_color_key(name_es) = k or norm_color_key(name_pt) = k
      or norm_color_key(id) = k
   limit 1;
  insert into supplier_color_map (supplier_key, supplier_color, tdp_color_id, status)
  values (k, trim(p_color), match, case when match is null then 'needs_review' else 'auto' end)
  on conflict (supplier_key) do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    perform refresh_color_review_action();
  end if;
end;
$$;

create or replace function variants_register_color()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.color is distinct from old.color then
    perform register_supplier_color(new.color);
  end if;
  return null;
end;
$$;

drop trigger if exists variants_register_color on variants;
create trigger variants_register_color
  after insert or update of color on variants
  for each row execute function variants_register_color();

-- Buyer-facing label of a supplier color in a locale. Falls back to the supplier text
-- when the color is not mapped yet (the variant must stay sellable).
create or replace function tdp_color_label(p_color text, p_locale text default 'en')
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select case when p_locale = 'es' then c.name_es when p_locale = 'pt' then c.name_pt else c.name_en end
       from supplier_color_map m join tdp_colors c on c.id = m.tdp_color_id
      where m.supplier_key = norm_color_key(p_color)),
    p_color
  );
$$;

-- Backfill: register every color already in variants
do $$
declare r record;
begin
  for r in select distinct color from variants where coalesce(trim(color), '') <> '' loop
    perform register_supplier_color(r.color);
  end loop;
  update supplier_color_map m set seen_count = s.n
    from (select norm_color_key(color) k, count(*) n from variants group by 1) s
   where s.k = m.supplier_key;
  perform refresh_color_review_action();
end $$;

alter table tdp_colors enable row level security;
alter table supplier_color_map enable row level security;
drop policy if exists tdp_colors_read on tdp_colors;
create policy tdp_colors_read on tdp_colors for select to anon, authenticated using (active);
drop policy if exists tdp_colors_staff on tdp_colors;
create policy tdp_colors_staff on tdp_colors for all using (is_staff()) with check (is_staff());
drop policy if exists supplier_color_map_staff on supplier_color_map;
create policy supplier_color_map_staff on supplier_color_map for all using (is_staff()) with check (is_staff());
grant select on tdp_colors to anon, authenticated;
grant all on tdp_colors, supplier_color_map to authenticated, service_role;

-- ------------------------------------------------------------ size chart
create table if not exists size_chart (
  id uuid primary key default gen_random_uuid(),
  size_br text not null unique,
  size_us text,
  size_eu text,
  letter text,
  aliases text[] not null default '{}',      -- other labels suppliers use (P, M, G, GG…)
  bust_cm text,
  waist_cm text,
  hip_cm text,
  note_en text,
  note_es text,
  note_pt text,
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into size_chart (size_br, size_us, size_eu, letter, aliases, sort) values
  ('36', '2',  '36', 'XS',  '{PP}',  10),
  ('38', '4',  '38', 'S',   '{P}',   20),
  ('40', '6',  '40', 'M',   '{}',    30),
  ('42', '8',  '42', 'L',   '{G}',   40),
  ('44', '10', '44', 'XL',  '{GG}',  50),
  ('46', '12', '46', 'XXL', '{XGG}', 60)
on conflict (size_br) do nothing;

alter table size_chart enable row level security;
drop policy if exists size_chart_read on size_chart;
create policy size_chart_read on size_chart for select to anon, authenticated using (active);
drop policy if exists size_chart_staff on size_chart;
create policy size_chart_staff on size_chart for all using (is_staff()) with check (is_staff());
grant select on size_chart to anon, authenticated;
grant all on size_chart to authenticated, service_role;
