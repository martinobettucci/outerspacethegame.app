-- 004_landing_cargo — atterrissage & fret (GB §9/§13, DG §7) :
-- - le survol garde la référence du corps (hover_body_id) : « atterrir »
--   devient un acte explicite, distinct de l'arrivée (BUILD ≠ INSTALL,
--   arriver ≠ se poser) ;
-- - config jsonb par bâtiment : politique d'atterrissage du spaceport
--   (clé `landing` ∈ self|everyone, défaut self), slots de marché à venir.
-- Retour arrière : DROP des deux colonnes.

ALTER TABLE ships ADD COLUMN hover_body_id uuid REFERENCES bodies(id);
ALTER TABLE buildings ADD COLUMN config jsonb NOT NULL DEFAULT '{}';
