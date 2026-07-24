-- @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Climate shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.8; PROD_MIGRATIONS.md §“Migrations en attente” (docs/SCHEMA.md gap: IR-004).
-- 030 : W5 — coque morphique (MASTER_PLAN W5, JOURNAL 2026-07-21).
-- L'adaptation climatique n'est plus un accessoire : réécriture
-- moléculaire SUR PLACE, temps seul. Les booléens shield_* existants
-- restent le résultat (une adaptation active à la fois après morphose ;
-- coques multi-boucliers héritées conservées jusqu'à leur première
-- morphose — grandfather annoncé).
ALTER TABLE ships ADD COLUMN morphing_shield text
  CHECK (morphing_shield IN ('hot', 'cold', 'radio'));
ALTER TABLE ships ADD COLUMN morph_started_at timestamptz;
