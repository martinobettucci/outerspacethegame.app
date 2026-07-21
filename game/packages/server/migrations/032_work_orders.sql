-- 032 : W7 — usinage partiel des usines L3 (MASTER_PLAN W7, JOURNAL
-- 2026-07-21). Paiement par paliers de 5 % × 20 au lieu du paiement à
-- la commande, dès qu'une industrie L3 active existe sur le monde.
CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  factory_building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('ship', 'item')),
  payload jsonb NOT NULL,
  cost jsonb NOT NULL,
  steps_done integer NOT NULL DEFAULT 0,
  steps_total integer NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'starved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_orders_factory ON work_orders (factory_building_id, created_at);
