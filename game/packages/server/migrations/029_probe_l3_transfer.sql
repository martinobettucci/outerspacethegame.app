-- 029 : W3 — sondes L3, ancrage & transfert (MASTER_PLAN W3, JOURNAL
-- 2026-07-21). Le flag « en transfert » (cible valide attaque 0, hook
-- P5) est DÉRIVÉ : transfer_target_id NOT NULL.
ALTER TABLE ships DROP CONSTRAINT IF EXISTS ships_probe_level_check;
ALTER TABLE ships ADD CONSTRAINT ships_probe_level_check
  CHECK (probe_level IN (1, 2, 3));

ALTER TABLE ships ADD COLUMN transfer_target_id uuid
  REFERENCES ships(id) ON DELETE SET NULL;
ALTER TABLE ships ADD COLUMN transfer_fuel_type text;
ALTER TABLE ships ADD COLUMN transfer_units double precision;
ALTER TABLE ships ADD COLUMN transfer_started_at timestamptz;

CREATE INDEX ships_transfer_target ON ships (transfer_target_id)
  WHERE transfer_target_id IS NOT NULL;
