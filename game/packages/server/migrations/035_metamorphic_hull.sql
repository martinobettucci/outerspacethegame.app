-- 035 : W9a — la coque MÉTAMORPHOSE est un accessoire installé D'OFFICE
-- (décision responsable 2026-07-22) : backfill sur toute coque à slots
-- (les sondes et la coque personnelle n'ont pas de slots). Sans lui,
-- pas de bouclier morphique (gate W5).
UPDATE ships
   SET accessories = accessories || '["metamorphic_hull"]'::jsonb
 WHERE hull_category NOT IN ('probe', 'personal')
   AND NOT (accessories @> '["metamorphic_hull"]'::jsonb);
