-- 036 : W9b — actifs de conversion (JOURNAL 2026-07-22). État par item
-- monté : { itemKey: { runPct, direction, batchLeftT, startedAtMs } }.
ALTER TABLE ships ADD COLUMN conversions jsonb NOT NULL DEFAULT '{}';
