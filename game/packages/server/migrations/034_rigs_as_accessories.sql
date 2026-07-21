-- 034 : erratum W6 (décision responsable 2026-07-22) — les rigs
-- booléens SONT des accessoires : le comptage de slots devient honnête
-- en reflétant les rigs posés dans accessories[]. Les coques héritées
-- sur-remplies sont tolérées telles quelles (annoncé).
UPDATE ships
   SET accessories = (
     SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
     FROM (
       SELECT jsonb_array_elements_text(accessories) AS elem
       UNION ALL
       SELECT 'harvest_rig' WHERE harvest_rig
       UNION ALL
       SELECT 'junk_collector' WHERE junk_collector
       UNION ALL
       SELECT 'claim_rig' WHERE claim_rig
     ) merged
   )
 WHERE harvest_rig OR junk_collector OR claim_rig;
