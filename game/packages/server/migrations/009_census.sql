-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §009_census; docs/BACKLOG.md §P4 “Global census”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.5.
-- 009_census — census global de l'offre (GB §13, DG §11.5) :
-- - census_snapshots : totaux par ressource, 4×/jour [TUNE] ;
--   la ventilation par SOURCE (stocks vs soutes) est INTERNE (debug +
--   futures valorisations serveur plunder/bonds) — l'API ne publie que
--   les totaux GLOBAUX ;
-- - amorçage idempotent du premier événement census_run (le worker n'a
--   pas de cron : la récurrence vit dans la file events, DG §1).
-- Retour arrière : DROP TABLE census_snapshots ;
--                  DELETE FROM events WHERE kind = 'census_run'.

CREATE TABLE census_snapshots (
  id bigserial PRIMARY KEY,
  taken_at timestamptz NOT NULL,
  -- { "<resourceId>": { "totalT": n, "planetStockT": n, "shipCargoT": n } }
  totals jsonb NOT NULL,
  -- { "sources": ["planet_stock","ship_cargo"], "bodyCount": n, "shipCount": n }
  -- — rend visible DANS LA DONNÉE que pools/escrow ne sont pas encore
  -- comptés (règle de complétude : le manque est enregistré).
  meta jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX census_snapshots_taken ON census_snapshots (taken_at DESC);

INSERT INTO events (due_at, kind, payload)
SELECT now(), 'census_run', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE kind = 'census_run' AND processed_at IS NULL
);
