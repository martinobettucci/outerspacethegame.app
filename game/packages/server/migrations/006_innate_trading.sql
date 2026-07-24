-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §006_innate_trading; docs/BACKLOG.md §P4 “Merchant-planet innate trading”; GAME_BOOK.md §9; DESIGN_GUIDE.md §11.2.
-- 006_innate_trading — l'exception du monde marchand (GB §9) : une planète
-- sous gouvernance Mercantile échange survie + carburant SANS bâtiment de
-- marché. La config (offres innées + planchers keep-for-self) vit sur le
-- corps lui-même : c'est une propriété de GOUVERNANCE, pas d'un bâtiment.
-- Retour arrière : DROP de la colonne.

ALTER TABLE bodies ADD COLUMN config jsonb NOT NULL DEFAULT '{}';

-- Le journal des échanges sert AUSSI au commerce inné : pas de bâtiment
-- dans ce cas (market_building_id NULL, slot_index = -1).
ALTER TABLE trades ALTER COLUMN market_building_id DROP NOT NULL;
