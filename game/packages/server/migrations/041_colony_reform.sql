-- @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §« Réforme colonisation anti-soft-lock »; docs/GAME_BOOK.md §18/§19.3/§12; docs/DESIGN_GUIDE.md §5/§6/§12; docs/SCHEMA.md §041_colony_reform; docs/PROD_MIGRATIONS.md §« Migrations en attente » (ligne 41).
-- 041 : réforme colonisation anti-soft-lock (décision responsable 2026-07-24).
-- Le premier colonisateur de CHAQUE monde est offert, une fois pour toutes
-- (spaceport L1 actif + colony_program déverrouillé). Ce drapeau persiste ce
-- don ; il SUIT la propriété (un monde conquis ayant consommé son gratuit
-- n'en reçoit jamais d'autre — « c'est la vie », GB §19.3).
--
-- Le reste de la réforme est CODE (spaceport jamais-masqué dans techtree.ts,
-- recette colonisateur au spaceport dans items.ts, colonize lisant item_cargo) :
-- l'ADN tech est une fonction pure de (DAG, seed) recalculée à la lecture,
-- donc aucun schéma à migrer pour cela.
--
-- Retour arrière : ALTER TABLE bodies DROP COLUMN free_colonizer_granted.
ALTER TABLE bodies
  ADD COLUMN free_colonizer_granted boolean NOT NULL DEFAULT false;
