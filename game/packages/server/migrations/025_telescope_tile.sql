-- 025 — Télescope unique sur tuile (décision responsable 2026-07-20).
--
-- Transition volontairement conservatrice : aucune instance joueur n'est
-- supprimée et aucune planète n'est agrandie. Une base legacy incompatible
-- doit être arbitrée explicitement (préproduction : resetDb autorisé).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM buildings
     WHERE key = 'telescope'
     GROUP BY body_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      '025_telescope_tile: plusieurs telescopes legacy sur une planete; aucun actif ne sera supprime automatiquement';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM buildings telescope
      JOIN bodies body ON body.id = telescope.body_id
     WHERE telescope.key = 'telescope'
       AND telescope.tile_index IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM generate_series(0, body.tiles - 1) AS slot(tile_index)
          WHERE NOT EXISTS (
            SELECT 1
              FROM buildings occupied
             WHERE occupied.body_id = body.id
               AND occupied.tile_index = slot.tile_index
          )
       )
  ) THEN
    RAISE EXCEPTION
      '025_telescope_tile: telescope legacy sans tuile libre; la planete ne sera pas agrandie automatiquement';
  END IF;
END $$;

-- Un télescope legacy compatible reçoit le plus petit index libre. Le
-- préflight garantit qu'il n'existe qu'une instance à placer par monde.
WITH free_slot AS (
  SELECT telescope.id AS building_id, min(slot.tile_index)::integer AS tile_index
    FROM buildings telescope
    JOIN bodies body ON body.id = telescope.body_id
    CROSS JOIN LATERAL generate_series(0, body.tiles - 1) AS slot(tile_index)
    LEFT JOIN buildings occupied
      ON occupied.body_id = body.id
     AND occupied.tile_index = slot.tile_index
   WHERE telescope.key = 'telescope'
     AND telescope.tile_index IS NULL
     AND occupied.id IS NULL
   GROUP BY telescope.id
)
UPDATE buildings telescope
   SET tile_index = free_slot.tile_index
  FROM free_slot
 WHERE telescope.id = free_slot.building_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM buildings
     WHERE (key = 'probe_pad' AND tile_index IS NOT NULL)
        OR (key <> 'probe_pad' AND tile_index IS NULL)
  ) THEN
    RAISE EXCEPTION
      '025_telescope_tile: contrat de tuile legacy invalide; probe_pad doit etre NULL et tout autre batiment doit occuper une tuile';
  END IF;
END $$;

ALTER TABLE buildings
  ADD CONSTRAINT buildings_tile_contract CHECK (
    (key = 'probe_pad' AND tile_index IS NULL)
    OR (key <> 'probe_pad' AND tile_index IS NOT NULL)
  );

CREATE UNIQUE INDEX buildings_one_telescope_per_body
  ON buildings (body_id)
  WHERE key = 'telescope';
