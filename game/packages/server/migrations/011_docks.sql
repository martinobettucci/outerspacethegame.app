-- 011 — Docks de spaceport (GB §9/§14, DG §5.1/§8.6).
-- ships.docked_at : horodatage du DERNIER atterrissage. Nécessaire à
-- l'éviction de séjour (dwell) : l'événement dock_eviction ne doit évincer
-- que si le vaisseau est resté à quai sans interruption depuis SA propre
-- planification — un départ/retour replanifie une nouvelle éviction et
-- l'ancienne se périme par comparaison d'horodatage. Sert aussi à l'UI
-- (« à quai depuis »).
ALTER TABLE ships ADD COLUMN docked_at timestamptz;

-- Approximation de départ pour les flottes déjà à quai au moment de la
-- migration : aucune éviction rétroactive n'existe pour elles, la valeur
-- n'alimente que l'affichage.
UPDATE ships SET docked_at = now() WHERE status = 'docked';
