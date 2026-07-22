-- W9e deep_scan_pulse : instantanés d'intel PERSISTÉS par joueur.
-- Un instantané fixe un PLANCHER de palier d'intel sur un corps (v1 :
-- la connaissance acquise ne se périme pas — interp annoncée, JOURNAL
-- 2026-07-22). Retour arrière : DROP TABLE player_body_intel;
CREATE TABLE IF NOT EXISTS player_body_intel (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, body_id)
);
