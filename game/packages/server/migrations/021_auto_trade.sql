-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §021_auto_trade; docs/BACKLOG.md §P4 “Hover auto-trade”; GAME_BOOK.md §7; DESIGN_GUIDE.md §3.5.
-- Auto-trade du survol étranger (GB §7, DG §3.5) : règles PAR COQUE
-- ({resource, belowT, buyT}, max 3 [TUNE-v1]) évaluées paresseusement —
-- l'événement auto_trade_check se planifie au franchissement du seuil le
-- plus proche (patron stock_edge appliqué à la coque).
ALTER TABLE ships ADD COLUMN auto_trade jsonb NOT NULL DEFAULT '[]';
