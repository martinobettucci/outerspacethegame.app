-- 005_market_trades — marché L1 taux fixe (GB §9/§13, DG §11.1) : journal
-- des échanges exécutés (les limites quotidienne/absolue d'un slot se
-- vérifient contre ce journal ; la config des slots vit dans
-- buildings.config, migration 004). Retour arrière : DROP de la table.

CREATE TABLE trades (
  id bigserial PRIMARY KEY,
  market_building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  body_id uuid NOT NULL REFERENCES bodies(id),
  trader uuid NOT NULL REFERENCES players(id),
  slot_index int NOT NULL,
  gave_resource text NOT NULL,
  gave_t double precision NOT NULL CHECK (gave_t > 0),
  got_resource text NOT NULL,
  got_t double precision NOT NULL CHECK (got_t >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trades_slot_day ON trades(market_building_id, slot_index, created_at);
