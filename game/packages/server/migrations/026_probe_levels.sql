-- 026 — Sondes v3 (décisions responsable 2026-07-20) : deux niveaux de
-- sonde (L2 = télescope de bord + survol moitié). Les sondes existantes
-- restent L1.
ALTER TABLE ships
  ADD COLUMN probe_level integer NOT NULL DEFAULT 1
  CHECK (probe_level IN (1, 2));
