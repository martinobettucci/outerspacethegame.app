-- Claim rig (GB §6, DG §8.8) : réclamer une coque SANS propriétaire
-- (épave du survival-out) après 2 h de proximité — le rig est monté à
-- l'atelier, la réclamation est un événement salvage_claimed qui
-- RE-VÉRIFIE tout à l'échéance (proximité, immobilité, épave intacte).
ALTER TABLE ships ADD COLUMN claim_rig boolean NOT NULL DEFAULT false;
ALTER TABLE ships ADD COLUMN claiming_target_id uuid REFERENCES ships(id) ON DELETE SET NULL;
