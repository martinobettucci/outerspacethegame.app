-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W8 (W8e); JOURNAL 2026-07-22 (plan W8e persisté); PROD_MIGRATIONS.md §« Migrations en attente ».
-- 038 : W8e — fabrication À BORD du Crusader. Les work-orders peuvent
-- viser un VAISSEAU (le Crusader) au lieu d'un monde ; la balance
-- d'items de bord vit dans ships.crusader_items (carte clé → compte).
-- Retour arrière : ALTER TABLE work_orders DROP COLUMN ship_id,
-- ALTER COLUMN body_id SET NOT NULL ; ALTER TABLE ships DROP COLUMN
-- crusader_items;
ALTER TABLE work_orders ALTER COLUMN body_id DROP NOT NULL;
ALTER TABLE work_orders ADD COLUMN ship_id uuid
  REFERENCES ships(id) ON DELETE CASCADE;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_target
  CHECK (body_id IS NOT NULL OR ship_id IS NOT NULL);
CREATE INDEX work_orders_ship ON work_orders (ship_id, created_at);

ALTER TABLE ships ADD COLUMN crusader_items jsonb;
