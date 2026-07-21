
## 2026-07-21 — W7 cœur livré : usinage partiel des usines L3

Livré conformément au plan : table work_orders (migration 032), gate =
une industrie L3 active (hasL3Factory), affectation à l'usine la moins
chargée, FIFO strict par usine (un palier ne court que pour le plus
ancien ordre inachevé de son usine), paliers de 5 % atomiques (rien
n'est débité si UNE ressource manque), starved + retry à la cadence du
palier [TUNE-v1 annoncé — WORK_ORDER_RETRY_HOURS reste le levier],
reprise auto, 20e palier → ship_built/item_fabricated (voie existante).
Vues : pendingShipBuilds + inventaire d'items affichent « (n/20) ».

LIMITES ANNONCÉES (§25) : BÂTIMENTS en usinage partiel = chantier
propre (flux de placement main-de-cartes/tuiles), listé au
MASTER_PLAN ; E2E + captures §16 en attente du port 8080 (R6) — même
motif que W6.

Preuves : work-orders.test 3/3 (×3) ; balayage sériel 330/330 (43
fichiers) ; unit 55 ; build monorepo vert.
