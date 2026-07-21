-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §023_pop_v2_unemployment; docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BB; DESIGN_GUIDE.md §3.2-v2(g).
-- 023 — Population v2, chunk BB : suivi de grâce du chômage (jours
-- CONSÉCUTIFS au-dessus de la tolérance de 7 % — DG §3.2-v2 g).
ALTER TABLE bodies
  ADD COLUMN unemp_over_days double precision NOT NULL DEFAULT 0;
