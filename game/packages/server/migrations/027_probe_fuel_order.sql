-- 027 — W1 multi-carburant des sondes (MASTER_PLAN, décision 2026-07-21) :
-- ordre de consommation configurable PAR SONDE. NULL = ordre canonique
-- ['cold','hot','gas'].
ALTER TABLE ships ADD COLUMN fuel_order jsonb;
