-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §016_wear; docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Hull wear & shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.8.
-- Usure de coque environnementale (GB §27 SETTLED, DG §8.8) : HP de coque
-- PARESSEUX (amount/rate/as_of — motif fuel/survie ; hull_hp NULL = coque
-- neuve, matérialisée au premier rebase) + trois boucliers d'atelier.
-- Aucun bord : l'usure PLANCHERE à 1 HP (péage, jamais une mort) — la
-- destruction (junk) arrive avec le combat P5.
ALTER TABLE ships ADD COLUMN hull_hp double precision;
ALTER TABLE ships ADD COLUMN hull_wear_hp_per_day double precision NOT NULL DEFAULT 0;
ALTER TABLE ships ADD COLUMN hull_as_of timestamptz;
ALTER TABLE ships ADD COLUMN shield_hot boolean NOT NULL DEFAULT false;
ALTER TABLE ships ADD COLUMN shield_cold boolean NOT NULL DEFAULT false;
ALTER TABLE ships ADD COLUMN shield_radio boolean NOT NULL DEFAULT false;
