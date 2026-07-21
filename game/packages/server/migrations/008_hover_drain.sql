-- @spec All declarations and algorithms in this file implement: docs/SCHEMA.md §008_hover_drain; docs/BACKLOG.md §P3 “Hovering”; GAME_BOOK.md §7/§13; DESIGN_GUIDE.md §3.5.
-- 008_hover_drain — drains de loitering & échouage (GB §7/§13, DG §3.5) :
-- - le réservoir devient une quantité PARESSEUSE (amount dans ships.fuel,
--   taux + as_of en colonnes) : hovering/idle consomment en continu ;
-- - index des coques en survol par corps (agrégation du drain planétaire).
-- Le statut 'stranded' existe déjà dans le CHECK (001, re-posé en 007).
-- Retour arrière : DROP des 2 colonnes + DROP INDEX ships_hover.

ALTER TABLE ships
  ADD COLUMN fuel_rate_u_per_day double precision NOT NULL DEFAULT 0,
  ADD COLUMN fuel_as_of timestamptz;

CREATE INDEX ships_hover ON ships(hover_body_id) WHERE hover_body_id IS NOT NULL;
