-- @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P3 “Sondes v3 : le carburant”; GAME_BOOK.md §4/§14; DESIGN_GUIDE.md §8.1-v3; PROD_MIGRATIONS.md §“Migrations en attente” (docs/SCHEMA.md gap: IR-004).
-- 026 — Sondes v3 (décisions responsable 2026-07-20) : deux niveaux de
-- sonde (L2 = télescope de bord + survol moitié). Les sondes existantes
-- restent L1.
ALTER TABLE ships
  ADD COLUMN probe_level integer NOT NULL DEFAULT 1
  CHECK (probe_level IN (1, 2));
