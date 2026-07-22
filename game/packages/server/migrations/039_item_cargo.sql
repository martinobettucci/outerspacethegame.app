-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W6 (reste b — acheminement d'items); JOURNAL 2026-07-22 (plan W6c-b persisté); PROD_MIGRATIONS.md §« Migrations en attente ».
-- 039 : W6c-b1 — acheminement d'ITEMS par cargo. La soute d'items est
-- une LISTE de clés (objets discrets, 1 conteneur chacun [TUNE-v1]).
-- Retour arrière : ALTER TABLE ships DROP COLUMN item_cargo;
ALTER TABLE ships ADD COLUMN item_cargo jsonb NOT NULL DEFAULT '[]';
