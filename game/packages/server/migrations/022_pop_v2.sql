-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §022_pop_v2; docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BA; GAME_BOOK.md §10; DESIGN_GUIDE.md §3.2-v2.
-- 022 — Population v2, chunk BA (DG §3.2-v2, GB §10 v2, Round 9 / guide v0.10).
-- `population` reste le TOTAL (compatibilité vues/tests) ; les âges le
-- ventilent : actives = population − pop_children − pop_seniors.
-- Backfill : pyramide stationnaire 18,2/54,5/27,3 (époques 20/60/30 j).
-- clock_deadlines : échéances FIXES des horloges de mort par famille de
-- survie ({water|food: ISO}) — posées à l'épuisement, levées au retour.
-- demo_counters : morts/exodés cumulés par catégorie (lu par l'intel, BD).
ALTER TABLE bodies
  ADD COLUMN pop_children double precision NOT NULL DEFAULT 0,
  ADD COLUMN pop_seniors double precision NOT NULL DEFAULT 0,
  ADD COLUMN clock_deadlines jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN demo_counters jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE bodies
   SET pop_children = round(population * 0.182),
       pop_seniors = round(population * 0.273)
 WHERE population IS NOT NULL AND population > 0;
