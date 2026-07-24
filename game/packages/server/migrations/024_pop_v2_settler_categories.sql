-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §024_pop_v2_settler_categories; docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BD; DESIGN_GUIDE.md §3.2-v2(j–k).
-- 024 — Population v2, chunk BD : manifeste settlers par catégorie.
-- Le total historique reste matérialisé pour les gardes/capacités, mais la
-- contrainte garantit qu'il égale toujours enfants + actifs + seniors.
-- Les données antérieures ne pouvaient embarquer QUE des actifs : backfill
-- fidèle dans settlers_actives, sans inventer de démographie.
ALTER TABLE ships
  ADD COLUMN settlers_children integer NOT NULL DEFAULT 0
    CHECK (settlers_children >= 0),
  ADD COLUMN settlers_actives integer NOT NULL DEFAULT 0
    CHECK (settlers_actives >= 0),
  ADD COLUMN settlers_seniors integer NOT NULL DEFAULT 0
    CHECK (settlers_seniors >= 0);

UPDATE ships SET settlers_actives = settlers WHERE settlers > 0;

ALTER TABLE ships ADD CONSTRAINT ships_settler_manifest_total CHECK (
  settlers = settlers_children + settlers_actives + settlers_seniors
);
