-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §007_colonization; docs/BACKLOG.md §P3 “Settlers & colonization”; GAME_BOOK.md §12/§19; DESIGN_GUIDE.md §3.2-v2/§12.
-- 007_colonization — la deuxième planète (GB §19/§14/§12, DG §12/§3.2) :
-- - settlers embarqués sur les coques Civil (+ origine de la route) ;
-- - fitting colonie (colony_kit) — donne le droit d'atterrir sauvage ;
-- - statut 'colonizing' (72 h d'établissement) ;
-- - settler_routes : l'accumulateur fractionnaire DÉTERMINISTE du péage
--   de trajet, par route persistante (origine, destination) — DG §3.2
--   « no free sub-20 cohorts ».
-- Retour arrière : DROP TABLE settler_routes ; DROP des 3 colonnes ;
-- restauration du CHECK de statut de 002.

ALTER TABLE ships
  ADD COLUMN settlers integer NOT NULL DEFAULT 0 CHECK (settlers >= 0),
  ADD COLUMN settlers_origin_body_id uuid REFERENCES bodies(id),
  ADD COLUMN colony_kit boolean NOT NULL DEFAULT false;

ALTER TABLE ships DROP CONSTRAINT IF EXISTS ships_status_check;
ALTER TABLE ships ADD CONSTRAINT ships_status_check CHECK (status IN
  ('docked','hovering','transit','idle','stranded','derelict','warehoused','colonizing'));

CREATE TABLE settler_routes (
  origin_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  dest_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  loss_carry double precision NOT NULL DEFAULT 0
    CHECK (loss_carry >= 0 AND loss_carry < 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_body_id, dest_body_id)
);
