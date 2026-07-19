-- Consentement 50/50 des stargates (canon GB §6 : « the price is split
-- between the two owners », DG §9.3 « both consent ») — patron des
-- offres manuelles : proposition épinglée du monde A (yard actif du
-- proposeur) vers le monde B d'AUTRUI ; l'acceptation paie LES DEUX
-- moitiés (chacune sur son monde) et lance le chantier. TTL 48 h
-- réelles [TUNE-v1], balayage paresseux.
CREATE TABLE stargate_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id uuid NOT NULL REFERENCES players(id),
  from_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  to_body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (from_body_id <> to_body_id)
);
CREATE INDEX stargate_proposals_to ON stargate_proposals (to_body_id)
  WHERE status = 'open';
