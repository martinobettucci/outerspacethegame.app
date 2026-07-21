-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §012_manual_offers; docs/BACKLOG.md §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §6.
-- 012 — Canal manuel (GB §9, DG §6 round 7) : offres d'achat manuelles
-- sur le stock browsable des warehouses PUBLICS. L'offre épingle le
-- vaisseau À QUAI de l'acheteur (ship_id) : le règlement à l'acceptation
-- est PHYSIQUE (stock planète ↔ soute de ce vaisseau, encore à quai).
-- La visibilité public/privé du warehouse vit dans buildings.config
-- (motif 004) — aucun schéma dédié.
CREATE TABLE manual_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ship_id uuid NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  get_resource text NOT NULL,
  get_t double precision NOT NULL CHECK (get_t > 0),
  give_resource text NOT NULL,
  give_t double precision NOT NULL CHECK (give_t > 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz
);

-- Boîte de réception du vendeur (offres ouvertes d'un monde).
CREATE INDEX manual_offers_body_open ON manual_offers (body_id)
  WHERE status = 'open';
-- Limites round 7 : fenêtre de créations 24 h par acheteur.
CREATE INDEX manual_offers_buyer_created ON manual_offers (buyer_id, created_at DESC);
