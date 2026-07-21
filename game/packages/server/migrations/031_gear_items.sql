-- 031 : W6 — pipeline accessoires & upgrades-items (MASTER_PLAN W6,
-- JOURNAL 2026-07-21). Items NON-FONGIBLES : une ligne = un objet,
-- entreposé sur un monde (balance d'items des warehouses — 50 × mult,
-- chunk AD réveillé). Installation sur coque ENTREPOSÉE.
CREATE TABLE planet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planet_items_body ON planet_items (body_id);

ALTER TABLE ships ADD COLUMN accessories jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ships ADD COLUMN upgrades jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ships ADD COLUMN installing_item text;
ALTER TABLE ships ADD COLUMN install_started_at timestamptz;
