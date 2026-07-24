-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §013_retool; docs/BACKLOG.md §P2 “Industry”; GAME_BOOK.md §9; DESIGN_GUIDE.md §5.1/§6.
-- 013 — Retool des industries (DG §5.1 : « re-targeting = 24 h retool »).
-- Nouveau statut de bâtiment `retooling` : la production s'arrête pendant
-- le rééquipement (le rebase ne compte que les industries ACTIVES), la
-- nouvelle recette est écrite immédiatement et s'éveille à l'échéance
-- (événement retool_complete). Le chemin instantané Industrialist et sa
-- fenêtre ≤ 1 switch/24 h vivent dans buildings.config (motif 004).
ALTER TABLE buildings DROP CONSTRAINT buildings_status_check;
ALTER TABLE buildings ADD CONSTRAINT buildings_status_check
  CHECK (status IN ('constructing', 'active', 'demolishing', 'retooling'));
