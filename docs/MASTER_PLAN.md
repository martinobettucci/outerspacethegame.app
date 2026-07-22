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
- [~] **W8 — Le CRUSADER — W8a LIVRÉ (2026-07-21)** : migration 033
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
  crusader.test 8/8, balayage 338/338. Reste W8e (fabrication à bord
  ADN complet + usinage partiel d'office, UI, E2E). (le plus gros —
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
- [~] **W9b — Moteur d'ACTIFS + électrolyseurs + vivarium — SERVEUR
  LIVRÉ (2026-07-22, restent UI de bord + E2E)** : processus
  modulés par pas de 5 % (0–100 %), fonctionnent PARTOUT (survol,
  transit, arrêt), STARVATION d'un intrant → 0 % automatique ; deux
  modes — BATCH (électrolyse : montant sacrifié, pause/reprise) et
  CONTINU (vivarium) ; carburant de fonctionnement [TUNE] ;
  electrolyzer/_l2/enhanced, vivarium/enhanced. → JOURNAL 2026-07-22
- [ ] **W9c — Familles de slots PARTAGÉES** : upgrades ET accessoires
  consomment la capacité de leur famille (HULLS.slots) — arbitrage
  upgrade-vs-accessoire ; grades ENHANCED fabriqués sur bâtiment hôte
  L3, le grade se fige À LA FABRICATION ; l'installation n'exige
  aucune techno (confirmé). → JOURNAL 2026-07-22
- [ ] **W9d — Passifs (19 × 2 grades, effets BRANCHÉS)** : heat_recycler,
  cryo_larder, docking_clamps, signal_mirror, survey_suite,
  ballast_shielding, flare_dampers (cumulable morph), trim_vanes,
  berth_module, course_optimizer, cargo_netting, mooring_winch,
  bilge_purifier, stargate_caller, salvage_grapnel, haggler_matrix,
  ore_hopper, solar_sails, escape_thrusters. → JOURNAL 2026-07-22
- [ ] **W9e — Actifs restants** : arc_furnace, med_synth, ram_scoop,
  gravity_sling, fab_bay (+enhanced). → JOURNAL 2026-07-22
- [ ] **W9g — Reprise des ateliers de RÉPARATION (décision 2026-07-22,
  après W9)** : réparation au sol = DOCKÉ sur une planète, payée en
  steel LÉGER OU LOURD (barème léger/lourd [TUNE à proposer]) ; le
  Crusader (jamais docké) se répare par l'accessoire ACTIF fab_bay
  (W9e). → JOURNAL 2026-07-22
- [ ] **W9f — TOUR D'ÉQUILIBRAGE des accessoires** (campagne de
  simulation, BALANCE_LOG — exception sous-agents). PARQUÉS :
  probe_cradle, beacon_transponder, gyro_stabilizers,
  fermentation_vats (motifs au JOURNAL). → JOURNAL 2026-07-22

## Programme R — Restes figés d'avant les sondes L3

- [ ] **R1 — Fold final de la main de cartes (chunk AO)** : contrat
  précisé au BACKLOG l.90 (tranche nommée 64 px au repos, cible ≥44 px,
  dépliage au survol/focus/sélection, reduced-motion) + tests
  géométriques + captures 2 viewports.
- [ ] **R2 — Application des caps `maxInstances`** (politique
  d'instances VALIDÉE — table single/multiple au BACKLOG l.92) ; le
  Codex contextuel est déjà livré (V3).
- [ ] **R3 — Sprites de stock du HUD** : mêmes stubs que le ledger
  stats, TAILLE RÉDUITE adaptée à la densité (PlanetView).
- [ ] **R4 — Pop v2, restes** : gating fonctionnel des non-industries
  par staffing [TUNE-v1] ; E2E visuel du spawn ; cas « univers
  saturé » ; scan riche des sondes (ADN/gisements, intel
  scientifique) ; intel des VAISSEAUX L1/L2/L3 (chunk flotte).
- [ ] **R5 — Stabiliser census** : ×2 flaky au balayage (totaux
  GLOBAUX/lazy — passent souvent, chantier responsable) : isoler par
  fenêtre/univers dédié. (Erratum W2 : hover n'était PAS
  ordonno-dépendant — régression W1 seed-dépendante, corrigée.)
- [ ] **R6 — Captures §16 en attente de port 8080** : V1 halo/cercles,
  V2 UI sondes, V3 chapitre Codex, zoom galaxie, key BuildingPanel.
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
