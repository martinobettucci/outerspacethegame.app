-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W1; docs/BACKLOG.md §P3 “Sondes L3 & multi-carburant”; DESIGN_GUIDE.md §8.1-v3; PROD_MIGRATIONS.md §“Migrations en attente” (docs/SCHEMA.md gap: IR-004).
-- 027 — W1 multi-carburant des sondes (MASTER_PLAN, décision 2026-07-21) :
-- ordre de consommation configurable PAR SONDE. NULL = ordre canonique
-- ['cold','hot','gas'].
ALTER TABLE ships ADD COLUMN fuel_order jsonb;
