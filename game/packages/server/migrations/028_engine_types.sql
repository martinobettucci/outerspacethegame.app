-- 028 : W2 — moteurs typés à l'usinage (MASTER_PLAN W2, JOURNAL 2026-07-21).
-- Le moteur est FIGÉ au build ; sondes (multicarburant) et coques
-- personnelles (sans réservoir) restent NULL.
ALTER TABLE ships ADD COLUMN engine_type text
  CHECK (engine_type IN ('cold', 'hot', 'gas'));

-- Backfill : type courant des coques existantes = slot du jsonb fuel
-- (au plus un type par coque non-sonde aujourd'hui), sinon 'cold'.
UPDATE ships s
SET engine_type = COALESCE(
  (SELECT e.key FROM jsonb_each_text(s.fuel) e
    WHERE e.key IN ('cold', 'hot', 'gas') AND e.value::float8 > 0
    LIMIT 1),
  (SELECT e.key FROM jsonb_each_text(s.fuel) e
    WHERE e.key IN ('cold', 'hot', 'gas')
    LIMIT 1),
  'cold')
WHERE s.hull_category NOT IN ('probe', 'personal');
