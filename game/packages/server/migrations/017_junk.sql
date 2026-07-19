-- Champs de junk (GB §22, DG §10.4) : UN champ max par cellule de 0,5 pc
-- (les apports fusionnent), tonnage à DÉCROISSANCE EXPONENTIELLE 10 %/j
-- évaluée à la lecture (0,9^jours — pas de taux linéaire, pas de bord :
-- le champ se dissipe). L'attribution (created_by) reste interne v1
-- (lecture télescope L3 : chunk intel vaisseaux).
CREATE TABLE junk_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_x integer NOT NULL,
  cell_y integer NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  amount_t double precision NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cell_x, cell_y)
);

-- Quota de dumps (5/jour RÉEL/coque [TUNE]) + collecteur + scoop 24 h-jeu.
ALTER TABLE ships ADD COLUMN junk_collector boolean NOT NULL DEFAULT false;
ALTER TABLE ships ADD COLUMN dump_day text;
ALTER TABLE ships ADD COLUMN dump_count integer NOT NULL DEFAULT 0;
ALTER TABLE ships ADD COLUMN last_junk_scoop timestamptz;
