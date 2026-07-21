
## 2026-07-21 — W4 livré : vue de bord des sondes L2/L3

Livré conformément au plan : scope des sondes L2+ porté à 260 pc
(BASE_SKY + 200) dans visibleBodies, CONTINU y compris en transit
(position interpolée en SQL sur les colonnes de mission, clampée 0–1) ;
L1 reste 60 pc à l'arrêt ; l'intel par paliers ne bouge pas (R4). Halo
UI à la sélection d'une sonde L2+ hors transit (visuel télescope,
260 pc). Leçon E2E : 350 pc de trajet = 17,5 u = exactement le plein
de naissance → la sonde meurt À SEC à l'arrivée (règle v3 démontrée en
production de test) — trajet ramené à 250 pc ; capture « halo »
attendait le panneau idle (poll client 5 s).

Preuves : onboard-sight.test 4/4 (×3) ; balayage sériel 318/318 (40
fichiers, census vert) ; unit 55 ; client 21 ; E2E onboard-sight.spec
vert ; capture obs-01 OBSERVÉE (halo + sweep + panneau idle).
