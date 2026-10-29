-- ---------------------------------------------------------------------
-- 0082: homologation report 24/10 — colors (P15, P14) and sizes (M6)
--
-- * the 7 TDP colors missing from the PDF table (p. 45): TEAL, BEIGE,
--   MULTI, FUCHSIA, ORANGE, LILAC, SILVER (EN/ES/PT as in the PDF)
-- * "Coral-1" is the same supplier color as "Coral": a trailing "-<n>" is
--   ignored by norm_color_key() (and by colorKey() in src/lib/colors.ts)
-- * sizes BR 48–56 (3XL–7XL / US 14–22), 46 = 2XL; bust / waist / hip in cm
--   filled ONLY where still empty (inches are derived in the site). The
--   numbers are the standard Brazilian chart: TDP must confirm them against
--   PDF p. 116 in Admin -> Tamanhos.
-- * Action Center count for colors to review re-synced (P14)
-- Idempotent / rerun-safe.
-- ---------------------------------------------------------------------

insert into tdp_colors (id, name_en, name_es, name_pt, hex, sort) values
  ('TEAL',    'Teal',       'Verde azulado', 'Azul-petróleo', '#1f6f78', 160),
  ('BEIGE',   'Beige',      'Beige',         'Bege',          '#d9c3a0', 170),
  ('MULTI',   'Multicolor', 'Estampado',     'Estampado',     '#b0873a', 180),
  ('FUCHSIA', 'Fuchsia',    'Fucsia',        'Fúcsia',        '#c2185b', 190),
  ('ORANGE',  'Orange',     'Naranja',       'Laranja',       '#e8742a', 200),
  ('LILAC',   'Lilac',      'Lila',          'Lilás',         '#b9a1d6', 210),
  ('SILVER',  'Silver',     'Plateado',      'Prata',         '#b8b8bc', 220)
on conflict (id) do nothing;

-- A trailing "-1", "-2"… is a supplier variation of the same color
create or replace function norm_color_key(c text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(regexp_replace(trim(coalesce(c, '')), '\s+', ' ', 'g')), '\s*-\s*\d+$', '');
$$;

-- orphan duplicate rows ("coral-1") are folded into the base color row
delete from supplier_color_map m
 where m.supplier_key ~ '-\s*\d+$'
   and exists (select 1 from supplier_color_map b where b.supplier_key = norm_color_key(m.supplier_key));
update supplier_color_map m
   set supplier_key = norm_color_key(m.supplier_key)
 where m.supplier_key ~ '-\s*\d+$';

-- the new TDP colors may now match supplier text that was unmapped
update supplier_color_map m
   set tdp_color_id = c.id, status = 'auto', updated_at = now()
  from tdp_colors c
 where m.tdp_color_id is null and m.manual_override = false
   and (norm_color_key(c.name_en) = m.supplier_key or norm_color_key(c.name_es) = m.supplier_key
        or norm_color_key(c.name_pt) = m.supplier_key or norm_color_key(c.id) = m.supplier_key);

-- ------------------------------------------------------------------ sizes
insert into size_chart (size_br, size_us, size_eu, letter, aliases, sort) values
  ('48', '14', '48', '3XL', '{XXGG,EGG}',  70),
  ('50', '16', '50', '4XL', '{}',          80),
  ('52', '18', '52', '5XL', '{}',          90),
  ('54', '20', '54', '6XL', '{}',         100),
  ('56', '22', '56', '7XL', '{}',         110)
on conflict (size_br) do nothing;

update size_chart set letter = '2XL' where size_br = '46' and letter = 'XXL';

update size_chart s set bust_cm = v.bust, waist_cm = v.waist, hip_cm = v.hip, updated_at = now()
  from (values
    ('36', '80',  '62',  '88'),
    ('38', '84',  '66',  '92'),
    ('40', '88',  '70',  '96'),
    ('42', '92',  '74',  '100'),
    ('44', '96',  '78',  '104'),
    ('46', '100', '82',  '108'),
    ('48', '104', '86',  '112'),
    ('50', '108', '90',  '116'),
    ('52', '112', '94',  '120'),
    ('54', '116', '98',  '124'),
    ('56', '120', '102', '128')
  ) as v (size_br, bust, waist, hip)
 where s.size_br = v.size_br
   and coalesce(s.bust_cm, '') = '' and coalesce(s.waist_cm, '') = '' and coalesce(s.hip_cm, '') = '';

-- P14: keep the Action Center count in step with the Colors screen
select refresh_color_review_action();
