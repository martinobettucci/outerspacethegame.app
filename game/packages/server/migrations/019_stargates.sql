-- Stargates (GB §6, DG §9.3–9.4) : raccourci instantané entre deux
-- mondes-endpoints POSSÉDÉS (v1 même propriétaire — le partage 50/50
-- avec consentement inter-joueurs arrive avec son flux dédié, annoncé).
-- Le gate meurt avec l'un ou l'autre endpoint (CASCADE + purge à
-- l'annihilation). Péage « hard gate » configurable ; capacité
-- 1 vaisseau/tick/direction (horodatage par direction).
CREATE TABLE stargates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  b_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES players(id),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'active')),
  completes_at timestamptz,
  toll_resource text,
  toll_amount double precision NOT NULL DEFAULT 0,
  last_a_to_b timestamptz,
  last_b_to_a timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (a_body_id <> b_body_id),
  UNIQUE (a_body_id, b_body_id)
);
CREATE INDEX stargates_a ON stargates (a_body_id);
CREATE INDEX stargates_b ON stargates (b_body_id);
