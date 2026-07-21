-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W8; PROD_MIGRATIONS.md §“Migrations en attente”.
-- 033 : W8a — le CRUSADER, petite planète volante (MASTER_PLAN W8,
-- JOURNAL 2026-07-21). Le combat_l ne se pose JAMAIS (GB amendé —
-- intention première draft) : les existants à quai/en entrepôt sont
-- FORCÉS en survol, effet immédiat.
ALTER TABLE ships ADD COLUMN crusader_stock jsonb;
ALTER TABLE ships ADD COLUMN crusader_pop jsonb;
ALTER TABLE ships ADD COLUMN crusader_infra jsonb;
-- W8d (fondation) : flotte-suiveuse — un vaisseau peut suivre une coque.
ALTER TABLE ships ADD COLUMN follow_ship_id uuid
  REFERENCES ships(id) ON DELETE SET NULL;

-- Migration forcée : tout Crusader posé/entreposé repart en SURVOL du
-- monde où il se trouvait (décision responsable 2026-07-21).
UPDATE ships
   SET status = 'hovering',
       hover_body_id = docked_body_id,
       docked_body_id = NULL,
       docked_at = NULL
 WHERE hull_category = 'combat' AND hull_size = 'l'
   AND status IN ('docked', 'warehoused')
   AND docked_body_id IS NOT NULL;
