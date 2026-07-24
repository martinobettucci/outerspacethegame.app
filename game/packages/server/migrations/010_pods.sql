-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §010_pods; docs/BACKLOG.md §P4 “Recruitment pods”; GAME_BOOK.md §12/§13/§19; DESIGN_GUIDE.md §11.4.
-- 010_pods — pods de recrutement (GB §12/§13, DG §11.4) :
-- - pod_openings : journal des ouvertures — sert au cap quotidien
--   (10/jour/compte [TUNE]) ET à l'impact de prix immédiat (les tonnes
--   payées depuis le dernier census se déduisent de S_r) ;
-- - le PNJ créé porte account_bound_until (npcs, colonne de 001).
-- Retour arrière : DROP TABLE pod_openings.

CREATE TABLE pod_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id),
  resource text NOT NULL,
  tons_paid double precision NOT NULL CHECK (tons_paid > 0),
  npc_id uuid REFERENCES npcs(id),
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pod_openings_player_day ON pod_openings (player_id, opened_at DESC);
CREATE INDEX pod_openings_resource_time ON pod_openings (resource, opened_at DESC);
