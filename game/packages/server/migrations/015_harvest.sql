-- Récolte stellaire (GB §22, DG §8.8) : le rig est un accessoire monté à
-- l'atelier (booléen, patron colony_kit) ; une coque IDLE à ≤ 8 pc d'une
-- étoile récolte via un lien harvesting_star_id — son réservoir devient un
-- ledger paresseux à taux POSITIF, et le stock CACHÉ de l'étoile devient
-- paresseux lui aussi (amount/rate/as_of) pour porter Σ rendements et les
-- bords star_supernova (annihilation) sans tick par étoile.
ALTER TABLE ships ADD COLUMN harvest_rig boolean NOT NULL DEFAULT false;
ALTER TABLE ships ADD COLUMN harvesting_star_id uuid REFERENCES bodies(id);
ALTER TABLE bodies ADD COLUMN star_fuel_rate_u_per_day double precision NOT NULL DEFAULT 0;
ALTER TABLE bodies ADD COLUMN star_fuel_as_of timestamptz;
-- Stock INITIAL (caché) : seuil du flare ≤ 5 % (GB §22) — jamais exposé.
ALTER TABLE bodies ADD COLUMN star_fuel_initial double precision;
UPDATE bodies SET star_fuel_initial = star_fuel_stock WHERE body_type = 'star';

CREATE INDEX ships_harvesting ON ships (harvesting_star_id)
  WHERE harvesting_star_id IS NOT NULL;
