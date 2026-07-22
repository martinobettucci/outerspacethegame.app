# MASTER PLAN — tout ce qui est FIGÉ et attend l'implémentation

> **Plan persisté (CLAUDE.md §5).** Demandé par le responsable le
> 2026-07-21 : l'inventaire TOTAL de ce qui a été validé et attend
> d'être codé, plus ce qui reste au stade de discussion. Sources de
> vérité : `JOURNAL.md` (décisions datées), `docs/BACKLOG.md` (statuts
> détaillés), `docs/POP_V2_PLAN.md` (population v2). Ce fichier est
> l'index d'exécution — tenu à jour à chaque chunk.

## Programme W — Flotte, sondes v3, accessoires, Crusader (VALIDÉ EN BLOC 2026-07-21)

Ordre proposé par dépendances. Chaque chunk : spec DG consolidée dans
le même commit, tests §15, captures §16, docs.

- [x] **W1 — Réservoir multi-carburant des sondes — LIVRÉ (2026-07-21)** (slot actif lazy + bascule à sec + pré-brûlage ordonné + scoop préserve-slots + API fuel-order + cercles=total ; intégration ships 8/8) : stocks séparés
  par type dans le jsonb `fuel`, ordre de consommation configurable PAR
  SONDE (UI patron auto-trade), drains/évaluations consommant type par
  type dans l'ordre. Fondation de W3. → JOURNAL 2026-07-21
- [x] **W2 — Moteurs typés à l'usinage — LIVRÉ (2026-07-21)** :
  `engine_type` FIGÉ au build (migration 028, backfill du type courant),
  défaut étoile natale, chantier outillé recipe `engine_<type>` (patron
  industrie, retool 24 h, instantané toute-Industrialist),
  refuel/transferts/vol contraints au moteur, plein de naissance typé
  moteur, UI outillage+retool+quille, DG §8.3 consolidé (matrice
  hors-diagonale [TUNE]-dormante → programme D). engines.test 5/5,
  E2E engines.spec vert, captures eng-01..03. → JOURNAL 2026-07-21
- [x] **W3 — Sondes L3 : ancrage & transfert — LIVRÉ (2026-07-21)** :
  migration 029 (probe_level 3 + colonnes transfert), gate pad L3,
  surcoût empilé [TUNE], ancrage openspace strict (receveur idle ou
  échoué-au-vide), type = moteur receveur (W2), 20 u/h-jeu, règlement
  au bord + annulation pro-rata, sonde→sonde interdit, saturation 1
  (hook accessoire W6), moveShip verrouillé, attaque-0 dérivé (P5).
  anchor-transfer.test 5/5, E2E anchor.spec vert, captures anc-01..03,
  DG §8.1 consolidé v3. → JOURNAL 2026-07-21
- [x] **W4 — Vue de bord des sondes L2/L3 — LIVRÉ (2026-07-21)** :
  scope 260 pc continu (y compris transit interpolé en SQL), halo UI à
  la sélection, intel par paliers inchangé (scan riche → R4).
  onboard-sight.test 4/4, E2E vert, capture obs-01. → JOURNAL 2026-07-21
- [x] **W5 — Champs climatiques stellaires + bouclier morphique —
  LIVRÉ (2026-07-21)** : (a) champ 0,5 × r_nova (S 20 / M ~31,7 /
  L ~50,4 pc, hot/cold/gas→radio), à l'arrêt +5 %/j additif (à quai
  exempt), traversée réglée au bord (plancher 1 HP), visualisé au clic ;
  (b) coque morphique temps-seul 24 h (migration 030), une chimie
  active, immobilisée pendant, fitShield supprimé. star-fields 3/3,
  wear 9/9, balayage 321/321, E2E shields réécrit vert, captures
  sh-00..03. → JOURNAL 2026-07-21
- [~] **W6 — Pipeline ACCESSOIRES & upgrades-items — CŒUR LIVRÉ
  (2026-07-21)** : catalogue GEAR 11 items (accessoire « advanced
  refueling system » = 2 ancrages W3 ; upgrades L2/L3 moteur/armure/
  réservoir BRANCHÉS, obs/weapon dormants P5), fabrication (migration
  031, hôte actif, balance d'items 50×mult AD réveillée), installation
  sur coque ENTREPOSÉE (item consommé à la commande, 12 h immobilisée,
  slots de coque, L3 remplace L2), API + UI. gear.test 6/6, balayage
  327/327 ; E2E gear.spec VERT + captures gr-01..03 observées
  (2026-07-21, pile décalée ATG_API_PORT=8081 — le 8080 est squatté par
  un service Windows étranger). **Restent** : (a) arbre ADN dédié des
  accessoires (v1 : gate = bâtiment hôte disponible) ; (b) achat/
  acheminement par cargo (marché des items) ; (c) ✔ rigs convertis en
  accessoires (erratum responsable 2026-07-22 — slots occupés, montage
  direct SUPPRIMÉ, migration 034) ; (d) obs/weapon effectifs (P5).
  → JOURNAL 2026-07-21/22
- [~] **W7 — Usinage partiel (usines L3) — CŒUR LIVRÉ (2026-07-21)** :
  work_orders (migration 032), 20 paliers de 5 % (rien d'avance), FIFO
  strict par usine, starved/reprise auto, naissance par les événements
  existants, vues avec paliers. work-orders.test 3/3, balayage 330/330.
  E2E work-orders.spec VERT + captures wo-01..02 observées
  (2026-07-21). **Reste** : BÂTIMENTS en usinage partiel (flux de
  placement = chantier propre, motif : main de cartes/tuiles/retool).
  → JOURNAL 2026-07-21
- [x] **W8 — Le CRUSADER — LIVRÉ (W8a–d 2026-07-21, W8e 2026-07-22)** : migration 033
  (stock/pop/infra + follow_ship_id, combat_l existants forcés en
  survol), naissance en survol + 25 % de pop source (proportions
  d'âges, cap 2 000, staff dégarni), amorçage oxygène/vivres au stock,
  infra figée écrite, atterrissage/entrepôt REFUSÉS. crusader.test 2/2.
  **W8b LIVRÉ (2026-07-21)** : crusader_daily quotidien au stock de
  bord (conso/horloges/oxygène-instantané/natalité L3/chômage vs 400
  emplois fixes/overcap 0,25), crusader.test 5/5. **W8c LIVRÉ (2026-07-21)** : docks volants 6/6/6 (amarrage ≤ 1 pc,
  réservoir gelé, équipages invités au stock du bord, voyage synchrone,
  API). **W8d LIVRÉ (2026-07-21)** : escorte en survol (bord paie le survol,
  équipages comptés, sync aux arrivées, API hover-crusader),
  crusader.test 8/8, balayage 338/338. **W8e LIVRÉ (2026-07-22, deux
  commits)** : migration 038 (work-orders de bord + crusader_items),
  fabricateGearAboard (ADN complet — tout hôte L3 d'office, paliers
  5 % au stock de bord, FIFO de bord, cap 450), équipement des coques
  AMARRÉES (install/uninstall au bord, gardes moveShip/undock),
  buildShipAboard (née amarrée, plein 25 % de bord, pas de
  Crusader-de-Crusader), PAS de markets (structurel) ; UI Crusader
  complète (panneau de bord, fabrication, quille, amarrage/escorte/
  appareillage, installation depuis le bord) ; chapitre Codex
  « Flying colony » GATÉ sur la possession (spoiler-free, chiffres
  live) ; crusader-fab.test 6/6, E2E crusader.spec + 5 captures
  observées. (le plus gros —
  dépend de W6/W7 et de pop v2) : ne se pose JAMAIS (GB à amender —
  intention première draft ; migration : les Crusaders à quai/entrepôt
  FORCÉS en hovering, effet immédiat) ; infra FIXE non
  modifiable (residential L3, usines L3 avec usinage partiel d'office,
  3 spaceports L3 — les vaisseaux y DOCKENT, 3 warehouses L3, ADN
  COMPLET, fabrique tout, PAS de markets) ; stocks fongibles =
  équivalent planète S (800 T [TUNE]), acheminés par cargos ; **fiche
  pop v2 COMPLÈTE à bord** (pyramide, natalité, chômage vs emplois
  fixes, efficience, mortalité, horloges — oxygène AU STOCK, cap 2 000
  [TUNE]) ; à la FABRICATION il naît en hovering et **25 % de la
  population de la planète source migre à bord** (proportions d'âges,
  staff source décrémenté) ; **flotte-suiveuse** : les vaisseaux en
  orbite consomment « comme au sol » sur SES ressources et SUIVENT ses
  déplacements (conso hovering). → JOURNAL 2026-07-21

## Programme W9 — Accessoires de conversion & coque métamorphose (VALIDÉ 2026-07-22)

- [x] **W9a — LIVRÉ (2026-07-22)** — Démontage/désassemblage + coque
  métamorphose d'office :
  commandes pipeline UNINSTALL (coque entreposée, temps [TUNE], l'item
  retourne à la balance du monde — refus si pleine) et DISASSEMBLE
  (item ENTREPOSÉ détruit, remboursement 50 % du coût de fabrication
  [TUNE-v1 interp]) ; GEAR += metamorphic_hull (workshop) INSTALLÉ
  D'OFFICE sans surcoût sur toute coque à slots à la construction
  (migration 035 backfill des coques existantes) ; morphShield (W5)
  EXIGE l'accessoire ; le démonter EFFACE l'adaptation active [interp
  annoncée]. → JOURNAL 2026-07-22
- [x] **W9b — Moteur d'ACTIFS (taxonomie définitive : continus
  mobiles/gourmands, BATCH immobiles/efficaces zéro-fuel,
  cell_decompressor livré) — LIVRÉ
  (2026-07-22, serveur + UI + E2E conversions.spec + captures)** : processus
  modulés par pas de 5 % (0–100 %), fonctionnent PARTOUT (survol,
  transit, arrêt), STARVATION d'un intrant → 0 % automatique ; deux
  modes — BATCH (électrolyse : montant sacrifié, pause/reprise) et
  CONTINU (vivarium) ; carburant de fonctionnement [TUNE] ;
  electrolyzer/_l2/enhanced, vivarium/enhanced. → JOURNAL 2026-07-22
- [x] **W9c — Familles de slots PARTAGÉES — LIVRÉ (2026-07-22,
  slotFamilyUsage/canFitGear + installGear ; GEAR_CATALOG.md fait
  foi)** : upgrades ET accessoires
  consomment la capacité de leur famille (HULLS.slots) — arbitrage
  upgrade-vs-accessoire ; grades ENHANCED fabriqués sur bâtiment hôte
  L3, le grade se fige À LA FABRICATION ; l'installation n'exige
  aucune techno (confirmé). → JOURNAL 2026-07-22
- [x] **W9d — Passifs (19 × 2 grades) — LIVRÉ (2026-07-22 : helpers
  passives.ts, effets CÂBLÉS dans drains/usure/survie/trajet
  (loadFrac DG §8.2)/conteneurs/pax/scan/intel/péage/réclamation/
  négoce/scoop/redéploiement/séjour, passives.test 8/8, chapitre
  Codex « Ship gear » + E2E + capture observée ; chiffres [TUNE]
  jusqu'à W9f)** : heat_recycler,
  cryo_larder, docking_clamps, signal_mirror, survey_suite,
  ballast_shielding, flare_dampers (cumulable morph), trim_vanes,
  berth_module, course_optimizer, cargo_netting, mooring_winch,
  bilge_purifier, stargate_caller, salvage_grapnel, haggler_matrix,
  ore_hopper, solar_sails, escape_thrusters. → JOURNAL 2026-07-22
- [x] **W9e — Actifs restants — LIVRÉ (2026-07-22, deux parties)**.
  Partie 1 : les 9 « recettes » — continus cell_cracker
  (soute-réservoir, sortie fuel au réservoir borné), arc_furnace,
  med_synth (bi-intrant), fab_bay (sortie hp_pct, bord de plein) ;
  batch electrolysis_vat, hydroponic_run, smelting_run,
  apothecary_still (+10 %), hull_patch_kit (+25 % HP max) ; moteur
  étendu aux sorties spéciales fuel/hp_pct ; actives.test 6/6, E2E
  batch UI + capture. Partie 2 : STANCES de déplacement ram_scoop
  (récolte de traversée CONTRE usure, réglée au départ) et
  gravity_sling (fenêtre 8 pc, vitesse contre dégâts) ; jump_primer
  (charge libre 1 h–10 j → boost ×1,5 pendant 3× la charge, UI
  durée) ; kedge_winch (5 pc sans carburant vers cible, MODE BOOST
  tout-brûlé 10 pc) ; deep_scan_pulse (instantané d'intel L3
  persisté — migration 037 player_body_intel, plancher dans
  bodyIntel) ; cryo_stasis_pod (stase 7 j : survie GELÉE, réveil
  10 min ; L2 autopilote : durée choisie, voyage en stase,
  irréveillable) ; actives2.test 7/7, E2E jump_primer + capture.
  GEAR_CATALOG.md : catalogue COMPLET ✔ ([TUNE] → W9f).
  → JOURNAL 2026-07-22
- [x] **W9g — Reprise des ateliers de RÉPARATION — LIVRÉ
  (2026-07-22)** : réparation au sol = DOCKÉ sur une planète (déjà
  canon), désormais payée en steel LÉGER OU LOURD — léger d'abord à
  0,1 T/HP, le lourd couvre le manque à 0,05 T/HP (barème dense
  [TUNE-proposé, à valider]) ; consommation normalisée en équivalent
  léger pour le tout-ou-rien ; le Crusader (jamais docké) se répare
  par fab_bay (W9e) ; DG §8.7 et Codex workshop mis à jour ;
  repair.test 7/7. → JOURNAL 2026-07-22
- [ ] **W9f — TOUR D'ÉQUILIBRAGE des accessoires** (campagne de
  simulation, BALANCE_LOG — exception sous-agents). PARQUÉS :
  probe_cradle, beacon_transponder, gyro_stabilizers,
  fermentation_vats (motifs au JOURNAL). → JOURNAL 2026-07-22

## Programme R — Restes figés d'avant les sondes L3

- [x] **R1 — Fold final de la main de cartes — PROUVÉ (2026-07-22)** :
  l'implémentation CSS du contrat (tranche nommée 64 px, dépliage au
  survol/focus-within/sélection, reduced-motion) datait du chunk AO —
  R1 livre les PREUVES manquantes : E2E card-hand-fold.spec (géométrie
  au pixel ±3, cible ≥44 px, premier-plan réel via elementFromPoint,
  clavier avec repli au blur, reduced-motion sans transition, viewport
  plancher 1280×800) + captures fold-01..03 observées. Géométrie non
  testable en unit (client sans DOM-lib — annoncé) ; computeCardStates
  reste couvert par CardHand.test.
- [x] **R2 — Application des caps `maxInstances` — LIVRÉ
  (2026-07-22)** : les 14 « single » de la table validée portent
  `maxInstances: 1` dans le canon partagé (12 ajoutés — telescope et
  clinic l'avaient) ; garde service placeBuilding inchangée (le refus
  `max_instances` vaut désormais pour tous) ; test anti-dérive
  Codex ⟺ canon (codexBuildings.test) ; preuve API sur un second
  workshop ; seed dev revalidé. Le Codex contextuel était déjà livré
  (V3).
- [ ] **R3 — Sprites de stock du HUD** : mêmes stubs que le ledger
  stats, TAILLE RÉDUITE adaptée à la densité (PlanetView).
- [~] **R4 — Pop v2, restes — 2/5 LIVRÉS (2026-07-22)** :
  ✔ cas « univers saturé » — SpawnSaturationError typée sur les trois
  branches d'épuisement de gen/spawn.ts → RegistrationError
  `universe_saturated` (rollback prouvé : aucun joueur fantôme) → API
  503 ; spawn-saturation.test 1/1 (mock documenté §15 : la saturation
  réelle est inexécutable localement, la classe d'erreur est la
  vraie). ✔ E2E visuel du spawn — spawn-visual.spec (350 exacts
  depuis STARTER_POP, grâce de colonie, ADN, main des premiers pas,
  flotte de naissance ; captures sp-01/02 observées ; la CAP de pop
  affichée varie par monde — non assertée). ✔ scan riche des
  sondes — CONSTAT 2026-07-22 : déjà livré par le chunk Q (projection
  d'intel) et PROUVÉ par intel.test (palier 4 = gisements chiffrés +
  techDna ; sonde sur site = deep sight ; +1 source scientifique) —
  la ligne était périmée. ↪ intel des VAISSEAUX L1/L2/L3 : REPOINTÉ
  vers P5/combat — les upgrades obs sont DORMANTS par décision (W6),
  l'intel de coque n'a pas de support avant leur réveil. RESTE (1) :
  gating fonctionnel des non-industries par staffing — PROPOSITION
  PERSISTÉE AU JOURNAL (non validée : change la boucle du joueur,
  arbitrage responsable requis).
- [x] **R5 — Stabiliser census — CORRIGÉ À LA RACINE (2026-07-22)** :
  cause = des ASSERTIONS ABSOLUES sur des agrégats GLOBAUX par
  conception (census DG §11.5 ; prix des pods dérivés du census) dans
  une base partagée entre suites. Correctifs : census.test passe en
  BASELINE + DELTA (l'or du starter neutralisé, un census de référence
  avant la fixture) ; pods.test surdimensionne le stock d'ore du cap
  quotidien (le contrat testé est le CAP, pas le barème du moment).
  Balayage sériel 375/375 ×2 consécutifs. (Erratum W2 : hover n'était
  PAS ordonno-dépendant — régression W1 seed-dépendante, corrigée.)
- [~] **R6 — Captures §16 — QUASI CLOS (2026-07-22)** : V1 halo/
  cercles + V2 panneau sondes + zoom galaxie −/+ produits par
  capture-sweep.spec (r6-01..03, observés) ; V3 chapitre Codex couvert
  depuis par les captures codex-01..07 (W9d) et cr-05 (W8e).
  RELIQUAT : la capture « key BuildingPanel » exige un hit-test de
  tuile PixiJS (hook DOM dans PlanetView.tsx — GELÉ par le chantier
  @spec du responsable) ; à reprendre quand le gel sera levé.
- [ ] **R7 — Quirk cap sondes** [TUNE-v1 à trancher] : le cap 5/j/pad
  compte les sondes VIVANTES nées aujourd'hui (une destruction
  rembourse un slot) — garder ou passer à un compteur de production
  strict ?

## Programme D — Encore au stade de DISCUSSION (rien à coder sans décision)

Issus de GB §27 (P0.4) et des sessions récentes :

- [ ] Liste complète des permissions d'atterrissage (self/friends/
  neighbours — cas de grief) — **notera que W2 (moteurs) et l'échelle
  de docks confirmée réduisent le périmètre**.
- [ ] Table des effets de VOYAGE par type de carburant (au-delà de la
  matrice 1.0) — débloquée par W2, à chiffrer [TUNE].
- [ ] Trous noirs : puits pur vs comportements d'étoile.
- [ ] Supernova vs mondes possédés/achetés — décision de mitigation.
- [ ] Leviers anti-stagnation au-delà de l'épuisement.
- [ ] Cas limites de decay routes/stargates.
- [ ] Planètes artificielles : sous-items ouverts (caps pop/qualité,
  coût de déplacement).
- [ ] docs/MVP.md — la tranche verticale « one planet, solo ».
- [ ] Attaquabilité effective des sondes & attaque-0 pendant transfert
  → développés avec le COMBAT (P5).

## Réponses finales du 2026-07-21 (référence rapide)

1. Crusader : oxygène au stock, cap pop 2 000 [TUNE].
2. Naissance Crusader : hovering direct + migration de 25 % de la
   population source (proportions d'âges, staff décrémenté).
3. Usinage partiel : n'importe quelle usine L3.
4. Champ climatique stellaire : 0,5 × R_nova [TUNE] (R_nova = 40×∛mult
   → S 40 / M 63,5 / L 100,8 pc).
5. Combat M atterrit ; échelle docks confirmée (L1=S, L2=+M, L3=+L) ;
   seul le Crusader ne se pose jamais.
