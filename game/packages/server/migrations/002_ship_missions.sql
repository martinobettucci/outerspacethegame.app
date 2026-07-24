-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §002_ship_missions; docs/BACKLOG.md §P3 “Free flight”; GAME_BOOK.md §6; DESIGN_GUIDE.md §9.1.
-- 002_ship_missions — vol libre (GB §6, DG §8/§9.1) : colonnes de mission
-- sur ships (segment origine→destination, interpolation lazy à la lecture),
-- statut 'idle' (à l'arrêt dans le vide, distinct de 'stranded' = panne).
-- Retour arrière : DROP des colonnes, restauration de l'ancien CHECK.

ALTER TABLE ships DROP CONSTRAINT IF EXISTS ships_status_check;
ALTER TABLE ships ADD CONSTRAINT ships_status_check CHECK (status IN
  ('docked','hovering','transit','idle','stranded','derelict','warehoused'));

ALTER TABLE ships
  ADD COLUMN origin_x double precision,
  ADD COLUMN origin_y double precision,
  ADD COLUMN dest_x double precision,
  ADD COLUMN dest_y double precision,
  ADD COLUMN dest_body_id uuid REFERENCES bodies(id),
  ADD COLUMN departed_at timestamptz,
  ADD COLUMN arrives_at timestamptz,
  ADD COLUMN speed_pc_per_day double precision;

CREATE INDEX ships_transit ON ships (arrives_at) WHERE status = 'transit';
