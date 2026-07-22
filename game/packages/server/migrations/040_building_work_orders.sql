-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W7 (reste : bâtiments en usinage partiel); JOURNAL 2026-07-22 (plan W7-bâtiments persisté); PROD_MIGRATIONS.md §« Migrations en attente ».
-- 040 : W7-bâtiments — les work-orders savent usiner un BÂTIMENT
-- (placement/levelup par paliers de 5 % sur un monde à industrie L3).
-- Retour arrière : recréer le CHECK sans 'building' (aucun ordre de ce
-- kind ne doit exister).
ALTER TABLE work_orders DROP CONSTRAINT work_orders_kind_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_kind_check
  CHECK (kind IN ('ship', 'item', 'building'));
