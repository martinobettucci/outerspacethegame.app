# CHANGELOG

## [Non publié]

### Codex — chapitre « Cargo & the hold » (2026-07-24)

- **Nouvelle exigence du responsable** : tout comportement de jeu fondamental
  DOIT être expliqué explicitement dans le Codex, pas seulement évoqué en
  passant. Les soutes des vaisseaux — une mécanique de base — n'avaient qu'une
  mention incidente dans « Ship gear ».
- **Chapitre dédié ajouté** (`codex/strings.ts`, `sections.tsx`) : la soute
  comptée en conteneurs (1 T d'un seul fongible **ou** 1 item par conteneur, les
  tonnes partielles arrondies au conteneur plein), la capacité comme propriété de
  coque (seules les coques cargo l'élargissent via l'upgrade de capacité), et la
  pénalité de charge (soute pleine = vaisseau plus lent et plus gourmand). Icône
  Lucide `Boxes`, deep-link GalaxyMap repointé sur ce chapitre.
- **Anti-dérive** : coefficients `LOAD_SPEED_PENALTY`/`LOAD_BURN_PENALTY` extraits
  en constantes nommées dans `@atg/shared` (`passives.ts`) et rendus EN DIRECT
  dans le Codex ; multiplicateur `UPGRADE_EFFECTS.cargo` idem. Tests : anti-dérive
  unitaire (`facts.test.ts`) étendu, e2e Codex (`codex.spec.ts`) mis à jour.

### Écran d'éveil — explication par politique (2026-07-24)

- **Ajout.** Sous la grille des six politiques de l'écran « Awaken a new
  Sovereign » ([`LoginScreen.tsx`](game/packages/client/src/screens/LoginScreen.tsx)),
  un panneau de détail explique la politique **sélectionnée** ; au **survol** ou
  au **focus clavier** d'une autre carte, le panneau prévisualise cette
  politique sans changer le choix, puis revient à la sélection. Devise + corps
  par archétype centralisés dans [`i18n/en.ts`](game/packages/client/src/i18n/en.ts)
  (`archetypeDescriptions`), fidèles à `docs/DESIGN_GUIDE.md` §4.1 (masques
  allow/deny + privilèges innés), sans spoiler de contenu non découvert.
- **UI.** Nouveau composant `.ls-archetype-detail` (thème par `data-archetype`,
  bordure gauche colorée, `aria-live="polite"`) — documenté dans
  [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
- **Tests.** [`LoginScreen.archetypes.test.ts`](game/packages/client/src/screens/LoginScreen.archetypes.test.ts)
  vérifie l'exhaustivité (les six politiques ont libellé + devise + corps non
  vides). Typecheck OK, 48 tests verts, build OK, vérif visuelle Playwright
  (desktop 1440×900 : panneau rendu/thémé, survol-vs-sélection confirmés).
- **Limite connue (préexistante, hors périmètre).** L'écran d'auth déborde
  horizontalement en < 900 px (déjà présent en mode login, pont deck 1000 px) ;
  le panneau ajouté épouse exactement la largeur de la grille (550 px) et
  n'aggrave pas ce débordement. Non corrigé ici : sans rapport avec la tâche.

### Réforme colonisation anti-soft-lock — spec & décision persistées (2026-07-24, docs seulement)

- **Cause racine identifiée (code tracé).** Fabriquer un colonisateur exige
  aujourd'hui un **workshop L2 actif**, mais l'ADN tech par monde masque le nœud
  workshop (~5 %) ou le plafonne à L1 (~20 % des restants) → **~24 % des mondes
  ne peuvent jamais coloniser**, starter compris (aucune garantie d'ADN L2 au
  spawn) — soft-lock potentiel dès le tour 1.
- **Décision responsable (2026-07-24).** (1) `spaceport_S` rejoint l'ensemble
  **jamais-masqué** ; (2) le **colonisateur** (accessoire = terraform core enfin
  réalisé) est fabriqué au **spaceport L1**, plus au workshop ; (3) **premier
  colonisateur gratuit par monde, une fois pour toutes** (spaceport L1 actif +
  `colony_program`), drapeau persisté `bodies.free_colonizer_granted` qui suit la
  propriété (monde conquis ayant consommé son gratuit → aucun autre) ; (4)
  colonisateurs suivants au coût **uniquement en 12 basiques biaisés aux
  gisements** ; (5) workshop L2 + terraform core + fitting retirés.
- **Documents écrits AVANT tout code (CLAUDE.md §5) :** GB §18/§19.3/§12, DG
  §5/§6/§12, [`docs/SCHEMA.md`](docs/SCHEMA.md) (migration 041), DAT (bloc
  colonisation), BACKLOG (unité dédiée), [`docs/PROD_MIGRATIONS.md`](docs/PROD_MIGRATIONS.md)
  (ligne 41), MANUAL_PLAN §6 (Codex spaceport/colonisation), [`docs/JOURNAL.md`](docs/JOURNAL.md).
- **Restant :** migration `041_colony_reform.sql`, code (`techtree.ts`
  jamais-masqué spaceport, `recipes.ts` recette colonisateur + retrait core,
  `colonize` sur `item_cargo`), tests unit/intégration/E2E, Codex, tour
  d'équilibrage [TUNE] — backlog `[ ]`, non encore livré.

### P0.3 — command deck icon-first, gestion en ouvrant l'objet (2026-07-23)

- Stock planète : catalogue COMPLET, zéros compris, groupé par famille avec
  icône-stub, quantité et flux ; même source dans le ledger de stats en
  variante compacte 15 px. Routes, recettes, coûts, rééquipement et travail
  de bâtiment portent les icônes des ressources concernées.
- Items : stub visuel stable par famille de slot, grade et état ; visible dans
  la recette, la file de fabrication, la balance du warehouse, la soute et le
  slot monté.
- Warehouse : `Open warehouse` ouvre un command deck avec grilles physiques
  engine/armor/fuel/obs/weapon/cargo/accessory, réserves S/M/L séparées,
  cellules vides explicites, file de fabrication iconographique et dossier
  de l'objet sélectionné (désassemblage confirmé).
- Vaisseau : la sélection rapide garde fuel, flux fuel, coque et flux coque ;
  `Open hull` ouvre les vrais slots de la coque, les boîtes de soute, la
  réserve locale et les instruments. L'accessoire/objet sélectionné pilote
  les actions installer/retirer/charger/décharger/activer/utiliser.
- Art : la baie n'embarque AUCUN faux vaisseau ni faux widget. Une plaque
  issue de la génération d'image intégrée montre seulement un hangar vide et
  son berceau ; le sprite
  live `category + size` reste une couche séparée au premier plan.
- Codex et `docs/DESIGN_SYSTEM.md` §5.1 alignés ; `CLAUDE.md` impose la lecture
  complète de la charte avant toute modification ou commit UI/UX.
- Preuves : typecheck client vert ; 24/24 tests client ; build Vite vert ;
  revue Playwright réelle à 1440×900, console 0 erreur après authentification,
  captures stock/stats/warehouse/coque observées.

### W7-bâtiments — l'usinage partiel s'étend aux BÂTIMENTS (2026-07-22)

- Sur un monde à industrie L3 active, **placement et montée de
  niveau** ne se paient plus d'avance : un work-order (migration
  **040**, kind `building`) débite 20 paliers de 5 % au stock ;
  `investedPaid` est cumulé **par palier** (PATCH 10-4 : la démolition
  ne rembourse que le réellement-payé — un chantier affamé démoli à
  5/20 rend 50 % de 5 paliers, rien de plus) ; l'ordre meurt avec la
  démolition. Marge d'1 s sur `construction_complete` (arrondis).
- Codex (chapitre Buildings) : paragraphe « partial machining ».
- Tests : building-partial.test 2/2 ; balayage sériel 382/382.
  **Le programme W7 est CLOS.**

### W6c-b1 — acheminement d'ITEMS par cargo (2026-07-22)

- **Migration 039** : `ships.item_cargo` (liste de clés). Un item en
  soute occupe **UN conteneur** (canon DG §7 « 1 T of one fungible,
  or 1 large item ») — la capacité TOTALE (fongibles + items) est
  désormais vérifiée par `containersUsedTotal` sur TOUS les flux
  (chargement, marchés, canal manuel, auto-trade, scoop de junk,
  sorties de conversions, pénalité de charge au départ).
- **Commandes** : charge/décharge À QUAI — monde possédé (lignes
  planet_items) ou Crusader (balance de bord) ; balance pleine →
  REFUS (le fret ne désassemble jamais) ; POST /ships/:id/item-cargo.
- **UI** : « Item hold » dans le panneau vaisseau, chargement par
  sélecteur depuis la balance du monde à quai, déchargement ;
  compteur de conteneurs incluant les items.
- Tests : item-cargo.test 4/4 (consommation de ligne, capacité totale
  bloquant fongible ET fret, refus balance pleine, §10, aller-retour
  Crusader) ; balayage sériel 380/380 ; E2E item-cargo.spec avec
  warehouse bâti par les vraies commandes (captures observées).

### R4 (partiel) — univers saturé typé ; spawn prouvé visuellement (2026-07-22)

- **Univers saturé** : l'épuisement du placement de spawn (poche de
  Fermi, wild, starter bonus) lève désormais une `SpawnSaturationError`
  typée → inscription refusée avec le code **`universe_saturated`**
  (HTTP 503) et AUCUN joueur fantôme (rollback prouvé par test) —
  fini le 500 brut sur un état de jeu légitime.
- **Spawn visuel** : E2E dédié — population de départ exacte
  (STARTER_POP live), grâce de colonie, ADN de départ, main des
  premiers pas, flotte de naissance (personnel + First hauler) ;
  captures observées. La cap de population affichée varie par monde
  (popCap(size, quality)) — constaté et non asserté.

### R1 — le fold de la main de cartes PROUVÉ (2026-07-22)

- Contrat du chunk AO (BACKLOG « Card hand v2 ») prouvé par E2E
  dédié : tranche NOMMÉE de 64 px au repos (géométrie mesurée ±3 px,
  cible ≥ 44 px), dépliage au survol/focus clavier/sélection avec
  passage au PREMIER PLAN réel (elementFromPoint), repli au blur,
  reduced-motion sans transition, viewport plancher 1280×800 ;
  captures fold-01..03 observées. Aucun changement de code UI —
  l'implémentation existait, les preuves manquaient.

### R2 + R5 — politique d'instances appliquée ; flaky de sweep éradiqués (2026-07-22)

- **R2** : les **14 bâtiments « single »** de la table validée
  (2026-07-20) portent désormais `maxInstances: 1` dans `@atg/shared`
  (12 ajoutés : workshop, residential, lab, obs_station,
  research_center, diplomatic_district, casino, commerce_district,
  faction_hq, stargate_yard, terraformer, artificial_planet_yard) —
  le refus backend `max_instances` de placeBuilding vaut pour tous ;
  test anti-dérive Codex ⟺ canon ; preuve API sur un second workshop ;
  seed dev revalidé (resetDb vert).
- **R5** : cause racine des flaky census/pods identifiée — assertions
  ABSOLUES sur des agrégats GLOBAUX par conception (census DG §11.5,
  prix des pods dérivés) en base de test partagée ; correctifs
  baseline+delta (census) et stock de cap surdimensionné (pods).
  Balayage sériel 375/375 ×3 consécutifs.

### W8e (UI + E2E + Codex) — le Crusader jouable à l'écran (2026-07-22)

- **Panneau Crusader** (GalaxyMap) : population de bord (C/A/S), stock
  du bord et balance d'items EN DIRECT, fabrication à bord (sélecteur
  sur tout le catalogue GEAR — usinage d'office), pose de quille
  (catégorie/taille/nom).
- **Coques voisines** : boutons Amarrage / Escorte quand un de VOS
  Crusaders est à ≤ 1 pc, Appareillage, et INSTALLATION d'un item
  depuis la balance de bord pour une coque amarrée.
- **Codex** : nouveau chapitre **« Flying colony »** — GATÉ sur la
  possession d'un Crusader (règle spoiler-free appliquée à la LISTE
  des chapitres) ; chiffres LIVE (cap 2 000, soute 800 T, migration
  25 %, 400 emplois, docks 6/6/6, balance 450) ; anti-dérive testé.
- **API client** : dockCrusader/hoverCrusader/undockCrusader,
  fabricateAboard, buildShipAboard ; endpoint de TEST
  `/test/spawn-crusader` (fixture E2E §15 — la naissance réelle reste
  couverte par crusader.test).
- Tests : codex client 23/23 ; E2E crusader.spec 1/1 (5 captures
  observées : panneau, balance, amarrage, quille à bord, chapitre
  Codex) ; E2E codex.spec inchangé vert (chapitre invisible sans
  Crusader) ; balayage sériel 374/375 (pods flaky de sweep — passe
  seul, famille R5).

### W8e (cœur serveur) — le Crusader FABRIQUE À BORD (2026-07-22)

- **Migration 038** : work-orders de BORD (`body_id` nullable +
  `ship_id` FK ships, CHECK l'un-ou-l'autre) ; `ships.crusader_items`
  (balance d'items du bord, carte clé → compte).
- **Items** : `fabricateGearAboard` — ADN COMPLET (canon) : tout hôte
  réputé actif L3, grades enhanced fabricables d'office ; usinage
  partiel D'OFFICE (paliers de 5 % payés sur `crusader_stock`, FIFO
  strict par Crusader, starved/reprise auto) ; balance de bord
  itemCapacity([3,3,3]) = 450 [TUNE] ; l'item naît dans
  `crusader_items`.
- **Équipement des coques AMARRÉES** : install/uninstall sur une coque
  docked au Crusader — item et coût pris sur le bord, immobilisation
  12 h (moveShip ET undock refusés pendant un chantier d'équipement),
  démontage rendu à la balance de bord (pleine → désassemblage 50 %
  au stock de bord).
- **Coques construites à bord** : `buildShipAboard` (chantier réputé
  L3 outillé tout moteur), coque née AMARRÉE si un dock de sa taille
  est libre — sinon en escorte —, plein de naissance 25 % puisé au
  stock de bord, métamorphose d'office ; le Crusader ne fabrique PAS
  de Crusader (pas de source de migration à bord — arbitrage
  responsable requis, annoncé).
- **API** : POST `/ships/:id/fabricate`, POST `/ships/:id/build-ship` ;
  vue flotte : `followShipId` + fiche `crusader` (stock, items, pop).
  PAS de markets à bord (aucune surface — structurel).
- Tests : crusader-fab.test 6/6 ; balayage sériel 375/375. UI + E2E :
  chunk suivant (plan W8e-4 au JOURNAL).

### W9g — réparation d'atelier payable en acier LOURD (2026-07-22)

- La réparation au sol (coque DOCKÉE, workshop actif — inchangé) se
  paie désormais en steel **léger OU lourd** : le léger est prélevé
  d'abord (0,1 T/HP), le lourd couvre le manque au barème dense
  **0,05 T/HP** ([TUNE-proposé, à valider par le responsable]) ;
  tout-ou-rien conservé (consommation normalisée en équivalent léger).
- Le Crusader (jamais docké) se répare par **fab_bay** (W9e) — DG §8.7
  consolidé, Codex workshop mis à jour.
- Tests : repair.test 7/7 (lourd seul → servi à −9,6 T/j ; les deux à
  sec → arrêt) ; balayage sériel 369/369.

### W9e (partie 2) — les 6 actifs couplés au déplacement et au temps (2026-07-22)

- STANCES (continus à débit nul — le throttle est un réglage lu par
  moveShip) : **ram_scoop** (traversée d'un champ stellaire du TYPE
  MOTEUR : +0,5 u/pc × runPct crédités au réservoir CONTRE une usure
  de traversée 0,5 HP/pc ×2 — enhanced ×1,5 ; réglée au départ comme
  le pré-brûlage), **gravity_sling** (départ ≤ 8 pc d'une étoile :
  vitesse ×(1 + runPct/200 %) contre 10 HP × runPct, enhanced ÷2).
- **jump_primer** : charge LIBRE (1 h–10 j, gratuite, à l'arrêt) →
  boost vitesse ×1,5 pendant 3 × la charge (enhanced ×4,5) — champ
  « Duration » dans l'UI, état « Jump boost — until » affiché.
- **kedge_winch** : 1 j → 5 pc SANS carburant vers une cible (x, y) ;
  MODE BOOST (< 1 u restant) : tout est brûlé, 10 pc.
- **deep_scan_pulse** : 12 h → instantané d'intel **L3 PERSISTÉ**
  (migration **037** `player_body_intel`) du corps sous scan le plus
  proche ; plancher appliqué dans bodyIntel (la connaissance acquise
  ne se périme pas — v1 annoncée).
- **cryo_stasis_pod** : stase 7 j — survie (et vieillissement) GELÉE,
  coque immobile, réveil à la demande en 10 min (bouton « Wake ») ;
  L2 (enhanced) : AUTOPILOTE cryostatique — durée choisie, le voyage
  part en stase, irréveillable avant le terme.
- Tests : actives2.test 7/7 ; E2E jump_primer UI (captures) ;
  balayage sériel 368/368. **Le catalogue GEAR_CATALOG.md est
  désormais COMPLET (✔ partout, chiffres [TUNE] → W9f).**

### W9e (partie 1) — les 9 actifs « recette » (2026-07-22)

- CONTINUS : **cell_cracker** (la soute-réservoir — 0,1 cell/h à
  100 % → 40 u moteur/cell, < 50 du batch ; carburant crédité au
  RÉSERVOIR, borné au plein → starvation), **arc_furnace** (2 junk →
  1 steel_l), **med_synth** (1 eau + 0,5 phosphore → 1 med_1,
  bi-intrant), **fab_bay** (auto-réparation 1 %/h × runPct à l'acier
  de SOUTE + fuel — bord de PLEIN de coque → 0 % ; la voie de
  réparation du Crusader, W9g).
- BATCH (+10 % de rendement, 12 h, zéro fuel) : **electrolysis_vat**
  (20 eau → 22 O2 + 22 H), **hydroponic_run** (10 O2 → 22 food_1),
  **smelting_run** (20 junk → 11 steel_l), **apothecary_still**
  (10 eau + 5 phosphore → 11 med_1), **hull_patch_kit** (1 T steel_l
  → +25 % des HP MAX, borné au plein).
- Moteur : sorties SPÉCIALES `fuel` (au réservoir, bornée) et
  `hp_pct` (réparation, bornée) pour les DEUX modes ; bords de plein
  planifiés ; grades enhanced auto (GEAR → 69 accessoires).
- Tests : conversions unit 6/6, actives.test intégration 6/6, E2E
  batch UI hull_patch_kit (capture observée) ; l'UI Active gear
  générique couvre les nouveaux actifs sans changement.

### W9d (partie 2) — les 19 effets passifs CÂBLÉS + chapitre Codex « Ship gear » (2026-07-22)

- Effets branchés dans les systèmes réels : drains de survol
  (heat_recycler ; solar_sails = survol GRATUIT à portée d'étoile),
  usure (flare_dampers ÷ champ/flare, cumulable morphose ;
  ballast_shielding ÷ junk), survie (bilge_purifier drain,
  cryo_larder capacité + provisions, escape_thrusters seuil d'alarme
  de fuite), trajet (**pénalité de charge DG §8.2 livrée** : plein =
  vitesse −15 %/burn +50 %, trim_vanes divise ; course_optimizer
  −10 % burn), conteneurs (cargo_netting, partout : charge, vue
  flotte, conversions), pax (berth_module), scan (signal_mirror
  20 → 60/100 pc en SQL), intel (survey_suite +1 palier),
  péage de gate (stargate_caller), réclamation (salvage_grapnel),
  négoce inné (haggler_matrix), scoop (ore_hopper), redéploiement
  (mooring_winch), séjour à quai (docking_clamps).
- Codex : nouveau chapitre **« Ship gear »** (fabrication/grades,
  passif/continu/batch, démontage/désassemblage) — chiffres LIVE de
  `@atg/shared` (UNINSTALL_HOURS, refund 50 %, L3 enhanced, ×1,5,
  pas de 5 %) ; deep-link GalaxyMap → Ship gear ; nouvelles
  constantes nommées RUN_PCT_STEP / ENHANCED_FABRICATOR_LEVEL.
- Tests : `passives.test.ts` intégration 8/8 (fixtures SQL §15),
  facts.test anti-dérive étendu, E2E codex.spec mis à jour (capture
  observée) ; balayage sériel 353/355 (2 échecs = census flaky R5
  connu, passe seul).

### W9d (partie 1) — catalogue des 19 passifs + helpers d'effets (2026-07-22)

- GEAR : les **19 passifs** validés entrent au catalogue (× grades
  enhanced auto — **51 accessoires** au total), familles de slots
  réparties (fuel/obs/armor/engine/cargo/accessory), gates thématiques
  (refinery, lab, spaceport, telescope, research_center,
  military_district, obs_station, shipyard, residential, warehouse,
  waterworks, stargate_yard, workshop, commerce_district, smelter,
  fuelcell_plant) ; type ItemSlot étendu à `cargo`.
- `passives.ts` : les 19 effets en helpers PURS testés (multiplicateurs
  std/enhanced) + **loadFracPenalty** (la pénalité de charge DG §8.2,
  jamais implémentée, arrive avec trim_vanes — partie 2).
- Tests : shared 207 (passives 2 + items élargis), balayage sériel
  345/347 (census ×2 = flaky R5), build vert.
- **Partie 2 (suite immédiate)** : câblage des 19 effets à leurs
  systèmes (drains, docks, scan SQL, intel, junk, champs, loadFrac,
  pax, burn, conteneurs, redéploiement, survie, péages, réclamation,
  négoce, scoop, solar sails, alarme de fuite) + tests d'intégration.

### W9c — familles de slots PARTAGÉES (2026-07-22)

- Upgrades ET accessoires consomment désormais la capacité de LEUR
  famille (`HULLS.slots`) : helpers purs `slotFamilyUsage`/`canFitGear`
  (un upgrade qui REMPLACE un niveau inférieur ne coûte pas de slot
  supplémentaire), `installGear` branché dessus — l'arbitrage
  upgrade-vs-accessoire du système de builds est en place. Le catalogue
  faisant foi vit dans **docs/GEAR_CATALOG.md** (statuts ✔/⏳/💬).
- Tests : shared items 5, gear.test 10/10 (×3), balayage sériel
  347/347, build vert. Les familles non-accessory se peupleront en
  W9d/W9e (heat_recycler, cell_cracker…).

### Taxonomie DÉFINITIVE des actifs (décision responsable 2026-07-22) — refactor W9b

- **CONTINUS** (correction : électrolyse ET vivarium) : mobiles
  (partout), modulables 5 %, intrants tirés de la SOUTE au fil de
  l'eau, BRÛLENT du carburant, starvation → 0 %.
- **BATCH** : intrants consommés À L'ACTIVATION, coque À L'ARRÊT et
  IMMOBILISÉE pendant un temps de procédé figé, ZÉRO carburant brûlé
  (plus efficaces) ; abandon = intrants PERDUS [interp annoncée].
  Premier item : **cell_decompressor** (validé — 1 fuel_cell → 24 h →
  +50 fuel du type moteur, borné au réservoir effectif ; enhanced :
  procédé ÷1,5) ; **cell_cracker** (continu, fuel_cells→carburant)
  validé pour W9e — la soute devient réservoir compact.
- UI : continus = throttle ; batch = « Start process » (coque tenue) /
  « Abort (inputs lost) » + échéance affichée.
- Tests : shared 7, conversions.test réécrit 7/7 (×3 — continu au fil
  de l'eau + starvation, batch immobilisation/terme/+50 fuel/abandon),
  balayage sériel **347/347**, E2E conversions.spec adapté VERT, build
  vert.

### W9b — moteur d'ACTIFS + électrolyseurs + vivarium (serveur) (2026-07-22)

- Actifs de conversion (défs partagées `conversions.ts`) : réglage
  0–100 % par PAS DE 5, fonctionnent PARTOUT (survol, transit, arrêt),
  STARVATION d'un intrant/carburant → 0 % AUTOMATIQUE ; deux modes —
  BATCH (électrolyse : eau SACRIFIÉE au lancement depuis la soute,
  production au BORD `conversion_edge`, pro-rata aux ajustements,
  lancement refusé si la soute ne peut accueillir la production
  totale) et CONTINU (vivarium : O2 de soute + carburant → nourriture,
  horizon de matérialisation 24 h-jeu [TUNE]).
- Catalogue : electrolyzer (20 T/h à 100 %), electrolyzer_l2
  (RÉVERSIBLE : O2+H → eau), vivarium (5 T/h, 0,5 T O2/T) + grades
  ENHANCED (débit ×1,5, fabrication bâtiment hôte L3, coût ×2, le
  grade se fige à la fabrication) ; `fabricatorMinLevel` branché.
- Migration 036 (`ships.conversions`), route POST /ships/:id/conversion,
  vue flotte, timeScale injecté au worker (baseHandlers(timeScale)).
- Tests : shared conversions 3 + items 3, intégration
  conversions.test.ts 5/5 (×3), balayage sériel 343/345 (census ×2 =
  flaky R5), unit 55, build vert.
- **UI de bord livrée (suite du chunk)** : section « Active gear » par
  accessoire monté (throttle 0–100 % pas de 5, batch, inverse pour les
  réversibles, état starved/batch restant) ; E2E conversions.spec VERT
  (électrolyse UI : batch sacrifié, sorties au bord) + captures
  cv-01..02 observées. Prochain : W9c familles partagées.

### W9a — coque métamorphose d'office + démontage/désassemblage (décisions responsable 2026-07-22)

- Nouveaux items GEAR : **metamorphic_hull** (accessoire, workshop) —
  INSTALLÉ D'OFFICE sans surcoût sur toute coque à slots (spawn +
  chantier ; migration 035 backfille l'existant) ; **sans lui, pas de
  bouclier morphique** (la morphose W5 l'exige ; le démonter EFFACE
  l'adaptation active). Catalogue prêt pour W9b/W9c : electrolyzer,
  electrolyzer_l2, vivarium (mécaniques à venir).
- **Démontage** (`/ships/:id/uninstall`) : coque entreposée, 6 h [TUNE],
  l'accessoire retourne à la balance d'items ; balance pleine ou sans
  warehouse → DÉSASSEMBLÉ sur place, 50 % du coût rendu [interp
  annoncée] ; les rigs démontés éteignent leur booléen d'effet.
- **Désassemblage** (`/planets/:id/items/disassemble`) : un item
  entreposé est détruit contre 50 % du coût de fabrication [TUNE-v1].
- Conséquence canon assumée : le cargo_s (1 slot accessoire) naît PLEIN
  — monter un rig exige d'ARBITRER (démonter la métamorphose) ; les
  parcours E2E le font par les vraies commandes.
- Tests : shared items 3 (15 items dont 8 accessoires), gear.test
  10/10 (×3), wear fixture adaptée, balayage sériel 340/340, unit 55,
  E2E gear+shields+harvest+junk+claim 5/5 sériels, build vert.

### Erratum W6 (décision responsable 2026-07-22) : les rigs SONT des accessoires

- Harvest rig, junk collector et claim rig rejoignent le pipeline
  d'items : fabriqués au WORKSHOP (coûts des rigs historiques, 24 h
  [TUNE]), entreposés (balance d'items), INSTALLÉS sur coque entreposée
  et **occupant un slot accessoire** (une cargo_s n'a qu'UN slot : elle
  choisit). L'installation écrit le booléen d'effet hérité (une seule
  vérité d'effet, l'objet dans accessories[]).
- Migration 034 : les rigs posés sont backfillés dans accessories[]
  (comptage de slots honnête ; coques héritées sur-remplies tolérées,
  annoncé).
- SUPPRESSION du montage direct : services fitHarvestRig/
  fitJunkCollector/fitClaimRig, routes et boutons UI retirés — la seule
  voie est le pipeline. Codex : rôle du workshop mis à jour.
- Instrumentation §15 : /test/grant-item (jamais en prod) + helper E2E
  installRigViaPipeline (entrepôt → install réel → quai) ; specs
  harvest/junk/claim réécrits dessus et VERTS (3/3, sériel).
- Tests : shared items 3 (11 items dont 4 accessoires), gear.test 7/7
  (rig par pipeline = booléen écrit + slot débordé refusé), balayage
  sériel 335/337 (census ×2 = flaky R5 connu), client 21, build vert.

### W8d — le Crusader : flotte-suiveuse (MASTER_PLAN W8, 2026-07-21)

- Escorte en SURVOL du Crusader (`hoverAtCrusader`, ≤ 1 pc, v1 vos
  coques) : réservoir GELÉ, le bord PAIE le survol de chaque suiveur
  (déduction quotidienne fuel_<moteur> dans crusader_daily, partielle
  si le stock manque [TUNE-v1 annoncé]) ; équipages des suiveurs
  comptés aux têtes du bord ; TOUT ce qui suit (amarré OU en escorte)
  arrive AVEC lui (sync aux arrivées — philosophie lazy, annoncé) ;
  fin d'escorte/appareillage par undock ou départ direct. API
  hover-crusader.
- Tests : crusader.test.ts 8/8 (×3), balayage sériel **338/338**
  (census vert cette passe), build vert. **Reste W8e** (fabrication à
  bord ADN complet + usinage partiel d'office, UI, E2E).

### W8c — le Crusader : docks VOLANTS (MASTER_PLAN W8, 2026-07-21)

- Amarrage au Crusader (3 spaceports L3 figés → **6 S / 6 M / 6 L**,
  balances séparées) : les deux à l'arrêt à ≤ 1 pc, v1 entre VOS
  coques ; sondes/personnel/Crusader exclus. À bord : réservoir GELÉ,
  équipage nourri par l'hôte — les équipages invités PÈSENT sur le
  stock du bord (crusader_daily, « comme au sol »).
- Les invités amarrés VOYAGENT avec l'hôte (position synchronisée à
  l'arrivée) ; appareillage par undock dédié ou départ direct (moveShip
  efface l'amarrage). API dock-crusader / undock-crusader.
- Tests : crusader.test.ts 7/7 (×4), balayage sériel 335/337 (census
  ×2 = flaky R5), build vert. **Restent W8d (flotte-suiveuse des
  coques en SURVOL) et W8e (fabrication à bord, UI, E2E).**

### W8b — le Crusader : la fiche pop v2 VIVANTE à bord (MASTER_PLAN W8, 2026-07-21)

- Événement `crusader_daily` (armé à la naissance, quotidien tant que
  le bord vit) : règlement au STOCK de bord (pas de taux lazy à bord
  v1 [interp annoncée]) — consommation food/water/OXYGÈNE (mêmes
  formules POP_NEEDS/1000 que le sol), horloges de mort eau 3 j /
  vivres 10 j (linéaires à échéance, levées au ravitaillement),
  oxygène à sec = mort INSTANTANÉE de tout le bord (même canon que les
  climats hostiles), vieillissement 3 âges, natalité residential L3
  (0,24 × actifs × M_growth, ρ = couverture du jour, efficience neutre
  0,7 [TUNE-v1 annoncé]), chômage vs emplois FIXES (400 [TUNE], grâce
  3 j, γ = 0,02), surcapacité parabolique 0,25 (cap 2 000) ; morts
  réparties proportionnellement, compteurs demo tracés.
- Tests : crusader.test.ts 5/5 (×6 — un jour à bord fait croître le
  bord et consomme l'oxygène ; pénurie d'eau pose l'horloge 3 j puis
  la lève au ravitaillement ; oxygène à sec éteint tout et arrête
  l'horloge), balayage sériel 333/335 (census ×2 = flaky R5 connu),
  unit 55, build vert.
- **Restent (W8c→W8e)** : docks volants, flotte-suiveuse, fabrication à
  bord, UI/E2E.

### W8a — le Crusader : schéma & naissance (MASTER_PLAN W8, 2026-07-21) — en cours

- Migration 033 : `crusader_stock`/`crusader_pop`/`crusader_infra`
  jsonb + `follow_ship_id` (fondation W8d) ; **les combat_l existants à
  quai/en entrepôt sont FORCÉS en survol** (décision responsable).
- Naissance : le Crusader naît EN SURVOL (jamais à quai) — **25 % de la
  population source migre à bord** (proportions d'âges exactes via
  `crusaderMigrants`, cap 2 000 [TUNE], compteurs planète décrémentés,
  staff dégarni si les actifs restants ne couvrent plus les postes
  [interp]) ; oxygène/vivres d'amorçage puisés au stock (100/50/50 T
  [TUNE-v1], partiel annoncé — à bord on respire AU STOCK) ;
  infrastructure FIGÉE écrite (residential L3, usines L3, 3 spaceports
  L3, 3 warehouses L3, ADN complet, pas de markets — descriptive v1,
  effets activés par W8b→W8e).
- Interdictions : `landShip` et `warehouseShip` REFUSENT le Crusader
  (« ne se pose jamais ») ; il vole normalement.
- Tests : crusader.test.ts 2/2 (×3), warehouse.test adapté (balance L
  prouvée au cargo_l), balayage sériel 330/332 (census ×2 = flaky R5
  connu, passe seul), unit 55 + shared 199, build vert.
- **Restent (W8b→W8e)** : fiche pop v2 vivante à bord, docks volants,
  flotte-suiveuse, fabrication à bord, UI/E2E.

### E2E W6/W7 passés + pile dev décalable (2026-07-21, autorisation responsable)

- Le port 8080 est squatté par un service Windows étranger (WSL réseau
  miroir, intuable côté WSL) : la pile dev/E2E est désormais DÉCALABLE
  — `ATG_API_PORT` pour le proxy Vite (défaut 8080 inchangé),
  Playwright lance l'API sur 8081.
- **W6** : gear.spec.ts VERT (fabrication au panneau workshop,
  entreposage, installation UI, accessoire monté) + captures gr-01..03
  observées — le reste « E2E R6 » de W6 est levé.
- **W7** : work-orders.spec.ts VERT (mine L3 par vraies commandes,
  rien débité à la commande, paliers « (n/20) » visibles, item né,
  total débité exact) + captures wo-01..02 observées — le reste
  « E2E R6 » de W7 est levé. (Leçon AO : revealCard obligatoire sur les
  cartes empilées.)

### W7 — usinage partiel des usines L3 (MASTER_PLAN W7, 2026-07-21) — cœur livré

- Dès qu'UNE industrie L3 ACTIVE existe sur le monde : les commandes
  buildShip et fabricateGear ne paient RIEN d'avance — table
  work_orders (migration 032), 20 paliers de 5 % du coût, un palier =
  durée totale/20, affectation à l'usine L3 la moins chargée, FIFO
  STRICT par usine (ordre d'insertion BDD), palier impayable →
  `starved` + retry à la cadence du palier [TUNE-v1 annoncé], reprise
  AUTO ; 20e palier → événement terminal EXISTANT (ship_built /
  item_fabricated). Sans usine L3 : chemin historique intact.
- Vues : pendingShipBuilds et l'inventaire d'items agrègent les ordres
  avec leurs paliers « (n/20[, starved]) ».
- Tests : work-orders.test.ts 3/3 (×3), balayage sériel 330/330 (43
  fichiers), unit 55, build vert.
- **RESTES ANNONCÉS** : BÂTIMENTS en usinage partiel (flux de placement
  = chantier propre, MASTER_PLAN) ; E2E + captures §16 (port 8080 — R6).

### W6 — pipeline accessoires & upgrades-items (MASTER_PLAN W6, 2026-07-21) — cœur livré

- Catalogue partagé `items.ts` (GEAR, 11 items exhaustifs) :
  1 accessoire (« advanced refueling system » → 2 sondes ancrées, W3) +
  5 familles d'upgrades × L2/L3 (moteur ×1,15/×1,30, armure ×1,3/×1,6,
  réservoir ×1,5/×2 BRANCHÉS ; obs/weapon fabricables mais DORMANTS
  jusqu'au combat P5, annoncé).
- Fabrication (migration 031, table planet_items) : bâtiment hôte ACTIF
  (workshop/shipyard/weapon_foundry), coût au stock, temps [TUNE],
  balance d'items des warehouses RÉVEILLÉE (50 × mult — chunk AD) ;
  bord item_fabricated → ligne non-fongible.
- Installation : coque ENTREPOSÉE uniquement, item consommé à la
  commande, coût + 12 h [TUNE] d'immobilisation (retrieve refusé
  pendant), bord item_installed idempotent ; slots de la coque (canon,
  pas de rnd), upgrades 1/famille, un niveau supérieur REMPLACE (l'ancien
  n'est pas rendu [TUNE-v1]).
- Effets câblés partout : vitesse (moveShip + péage W5), réservoir
  effectif (refuel/transferts/ancrage/vue flotte), HP max (armure),
  2 ancrages (accessoire).
- API planets/:id/items (GET/POST) + ships/:id/install ; UI : section
  « Gear fabrication » des panneaux hôtes, menu d'installation sur coque
  entreposée, chips équipement.
- Tests : unit items 3, intégration gear.test.ts 6/6 (×3), balayage
  sériel 327/327 (42 fichiers), client 21, build vert.
- **E2E gear.spec.ts ÉCRIT mais NON exécuté ni captures §16 : le port
  8080 est repris par l'environnement du responsable (motif R6) — chunk
  en [~] jusqu'au passage E2E.** Restes W6c au MASTER_PLAN (arbre ADN
  dédié, marché/acheminement des items, conversion des rigs).

### W5 — champs climatiques stellaires & coque morphique (MASTER_PLAN W5, 2026-07-21)

- **Champs stellaires** : chaque étoile diffuse son climat sur
  **0,5 × r_nova** [TUNE] (S 20 / M ~31,7 / L ~50,4 pc ; hot→hot,
  cold→cold, gas→radio [interp]). À l'arrêt dans l'espace sans
  l'adaptation appariée : +5 % HP max/j PAR champ (additif) ; à quai :
  exempt [interp] ; sondes concernées. TRAVERSÉE en transit : péage
  réglé au bord (longueur d'intersection ÷ vitesse, plancher 1 HP) —
  géométrie pure `segmentCircleCrossingPc` testée. Champ PUBLIC,
  visualisé au clic sur l'étoile (disque teinté par type).
- **Coque morphique** (le bouclier n'est plus un accessoire) :
  adaptation = réécriture moléculaire SUR PLACE, TEMPS SEUL (24 h-jeu
  [TUNE], migration 030), aucun atelier, aucun coût, une chimie active
  à la fois, coque immobilisée pendant la morphose (moveShip refuse),
  grandfather des multi-boucliers hérités ; fitShield (workshop L2 +
  coût) SUPPRIMÉ, route /ships/:id/shield → morphose.
- Effets W5 assumés dans les suites : scoop d'une sonde = traversée du
  champ (péage au bord démontré), près d'une étoile en flare le péage
  DOUBLE (flare + champ), le rallumage laisse le champ.
- Tests : unit wear 17 (géométrie + rayons + mapping), intégration
  star-fields.test 3/3 (×3) + wear.test 9/9 (morphose, fixtures posées
  hors champ pour rester déterministes) + ships/harvest ajustés,
  balayage sériel 321/321 (41 fichiers), client 21, E2E shields.spec
  réécrit (champ visualisé, −4 HP/day, morphose sur place, moveShip 409
  pendant, péage éteint) vert ×2 + captures sh-00..03 observées (§16).
- Docs : DG §8.8 accessoires → coque morphique + section champs
  stellaires ; PROD_MIGRATIONS 030.

### W4 — vue de bord des sondes L2/L3 (MASTER_PLAN W4, 2026-07-21)

- `visibleBodies` : une sonde L2+ porte un ciel de bord de **260 pc**
  (télescope L1 embarqué), CONTINU « où qu'elle soit » — y compris EN
  TRANSIT (position interpolée en SQL sur la mission) ; L1 reste 60 pc
  à l'arrêt, vaisseaux 20 pc. L'intel par paliers ne bouge pas (le scan
  riche des sondes reste R4, annoncé).
- UI : sélectionner une sonde L2+ à l'arrêt affiche le halo de scan
  (même visuel que le télescope planétaire, rayon 260 pc).
- Tests : intégration onboard-sight.test.ts 4/4 (×3), balayage sériel
  318/318 (40 fichiers), unit 55, client 21, E2E onboard-sight.spec.ts
  vert (leçon v3 : 350 pc = plein de naissance exact → sonde perdue à
  sec ; trajet 250 pc) + capture obs-01 observée (halo + panneau idle).

### W3 — sondes L3 : ancrage & transfert (MASTER_PLAN W3, 2026-07-21)

- Sonde **L3 = L2 + tanker** (migration 029) : gate pad L3, surcoût
  empilé +40 ore +25 silicon [TUNE] ; ancrage à UNE de vos coques, les
  DEUX à l'arrêt en openspace (receveur `idle` ou échoué au vide — le
  sauvetage tanker), ≤ 1 pc ; type donné = MOTEUR du receveur (W2) ;
  débit 20 u/h-jeu [TUNE], règlement au BORD (`fuel_transfer_complete`
  idempotent), annulation PRO-RATA ; sonde→sonde interdit ; 1 sonde
  ancrée par receveur (accessoire W6 → 2) ; paire ancrée = cible valide
  attaque 0 (hook P5, flag dérivé) ; moveShip verrouillé des deux côtés.
- API POST /ships/:id/anchor-transfer + /anchor-cancel ; vue flotte :
  bloc `transfer` (sonde) + `anchoredProbeId` (receveur) ; UI galaxie :
  section « Tanker anchor (L3) » (cibles ≤ 1 pc, montant, annulation).
- DG §8.1 : paragraphe sondes consolidé v3 complet (120 pc/j, réservoir
  70 u, multi-fuel W1, scoop, niveaux L1/L2/L3 — il datait du pré-v3).
- Tests : intégration anchor-transfer.test.ts 5/5 (stabilité ×4),
  balayage sériel 314/314 (39 fichiers, census vert), unit 55 + client
  21, E2E anchor.spec.ts vert ×4 (ADN pad L3 requis, carbon granté) +
  captures anc-01..03 observées (§16 — resynchronisation du panneau au
  poll de 5 s constatée et attendue par le spec).

### W2 — moteurs typés à l'usinage (MASTER_PLAN W2, 2026-07-21)

- `ships.engine_type` FIGÉ au build (migration 028, backfill du type
  courant ; NULL pour sondes multicarburant et coque personnelle) ;
  défaut = étoile natale, plein de naissance 25 % du type MOTEUR.
- Le chantier naval s'outille par le patron industrie : recipe
  `engine_<type>`, retool 24 h [TUNE] (instantané toute-Industrialist),
  chantier en pause pendant le rééquipage ; poser une quille exige un
  chantier outillé pour le moteur demandé.
- Contraintes serveur : refuel = `fuel_<moteur>` uniquement, transferts
  refusés entre moteurs différents, une coque typée ne vole que sur SON
  carburant (le pré-brûlage ordonné W1 reste réservé aux sondes).
- UI panneau chantier : outillage courant (« natal star (default) » ou
  type), sélecteur + « Retool engines », libellé de route de production
  dédié ; la quille part avec le moteur du chantier.
- Correction W1 (régression seed-dépendante) : un réservoir mono-type À
  SEC garde son type (`{gas: 0}` ne retombe plus sur `cold`) — les
  échecs de `hover.test` au balayage étaient CE bug, pas de
  l'ordonno-dépendance (R5 recentré census).
- Tests : intégration `engines.test.ts` 5/5 (stabilité ×5), harvest et
  survival adaptés au type moteur, balayage sériel 309/309 (2e passe ;
  1re passe : census ×2, chantier responsable R5), unit 55 + client 21,
  E2E `engines.spec.ts` vert + captures eng-01..03 observées (§16).
- Docs : DG §8.3 consolidé (v1 implémentée), PROD_MIGRATIONS 025→028
  (025–027 manquaient — réparé), MASTER_PLAN/BACKLOG/JOURNAL.

### Spawn §2.2b — pocket luck & frontière latente (directive responsable 2026-07-20)

- **Pocket luck** : le spawn tire d'abord la luck sur le flux de poche
  (ordre figé) — starters 1 / 2 (1 %) / 3 (0,1 %), sauvages proches
  2 / 3 (1 %) / 4 (0,1 %), seuils littéraux (`luckCount`). Chaque starter
  SUPPLÉMENTAIRE naît **colonisé + dotation complète propre** (pop 350 en
  pyramide stable, stock ×U(1.0–1.3), 150 u de fuel, savoir T0, lié 45 j,
  `is_starter`, taux rebasés) à 18–60 pc du centre hors R_nova ; vaisseaux
  et pilote restent uniques, dockés au primaire.
- **Frontière latente** : chaque inscription sème 1–3 mondes bonus à
  U(800–4000) pc de la poche (plancher 800 > scope starter max 660),
  acceptés UNIQUEMENT hors de la visibilité COURANTE de tous les joueurs
  (`isPointVisibleToAnyPlayer`, même règle que /galaxy ; K = 8 tentatives
  puis **skip silencieux** — l'encombrement auto-étrangle le flux, voulu).
  Richesse spatiale ρ_eff = 0,25 + 0,75·clamp((d_centre−20k)/80k) figée
  dans `bodies.config.bonus.rhoEff` : qualité/taille mélangées vers le
  profil riche, tuiles moitié haute, 4–8 gisements ×(1+2ρ), **bâtiments
  abandonnés** (pool par PRÉDICAT de catalogue — sur tuile, apolitique à
  tous niveaux, non-industrie : clinic/depot/obs_station/spaceport/
  stargate_yard/telescope/warehouse/workshop —, tuiles ≥ 2, `active` avec
  workforce 0, inertes sans propriétaire, hérités à la colonisation),
  stocks résiduels ρ·U(40–200) T, **étoile propre à 25 %** (stock
  ×(1+2ρ), géométrie de poche, même invariant d'invisibilité).
- **ADN enrichi** : `planetTechAvailability(seed, richness)` — seuils de
  conservation relevés et plafonds +1 probabilistes via le flux SÉPARÉ
  `tech-dna-bonus` ; les mondes standards restent identiques octet pour
  octet (testé). Le serveur sert désormais l'ADN **effectif**
  (`worldTechAvailability`) : richesse bonus (config) + union des clés de
  bâtiments debout, plafond ≥ niveau hérité — une ruine L3 reste montable
  L3 chez son colonisateur.
- **Seed** : compte `lucky-N@atg.local` (N balayé déterministiquement —
  N = 26 avec l'UNIVERSE_SEED par défaut) démontre le multi-starter par le
  VRAI flux ; log du nombre de starters et de mondes bonus. Vérifié en
  base dev : 2 starters + 1 monde bonus (« Umrux », poison Nox, ρ 0,25).
- **Tests** : unit shared `techtree-bonus` (stabilité octet, superset par
  seed, monotonie, bornes) ; unit serveur `bonus-rolls` (seuils exacts,
  fréquences 30 k, ρ_eff, profils riches, prédicat + snapshot du pool,
  caps maxInstances, stocks bornés) ; intégration `spawn-luck` (e-mail
  chanceux scanné → 2 starters dotés, mondes bonus conformes AUX ROLLS
  EXACTS, invariant d'invisibilité par requête directe, étoile 25 %,
  saturation → skip via sonde injectable, ADN union servi par
  planetDetail après prise de possession) ; `spawn.test` rendu luck-aware.
  Suite intégration complète 302/302 verte ; E2E `latent-frontier` vert
  (galaxie d'un compte neuf = poche seule, capture observée §16).

### Contrat de clôture — file AO reprise après BD (spec avant code)

- Décision propriétaire synchronisée : un seul télescope par planète,
  désormais posé sur une tuile (`usesTile: true`, `maxInstances: 1`) et géré
  par le panneau bâtiment standard. `probe_pad` reste l'infrastructure sans
  tuile ; la refonte P3 des sondes et la politique globale d'instances restent
  hors de ce chunk.
- Le fold AO final est mesurable : tranche nommée de 64 px (cible pointeur
  ≥44 px), carte complète au survol/focus/sélection, comportement intact en
  reduced-motion.
- Le verrou pods des comptes <45 jours doit être visible avant clic avec sa
  date d'ouverture calculée serveur ; la vérification POST reste autoritative.
- Les stats nettes signées par ressource/jour sont déjà livrées par BC et
  entrent dans le balayage de non-régression de cette clôture.

### Correctif majeur — cartes déverrouillées devenues invisibles (bug probe)

- **Bug** (signalé responsable 2026-07-20) : certaines cartes, une fois
  DÉVERROUILLÉES, disparaissaient de la main sans aucun moyen de les
  construire (`probe_pad` en exemple). Cause : le filtre de la main
  (`CardHand`, directive 2026-07-19) ne gardait que `placeable` +
  `unlockable` et jetait tout `blocked`. Or `blocked` confondait deux cas
  distincts : le blocage PRÉ-unlock (hors-ADN, masque, prérequis, unlock
  trop cher — qui appartient légitimement à l'arbre « Technology DNA ») et
  le blocage POST-unlock (pas de tuile libre, `maxInstances`, placement trop
  cher). Un bâtiment déjà déverrouillé mais momentanément impossible à poser
  basculait donc en `blocked` et sortait de la seule surface où on peut le
  construire — l'arbre tech ne fait que déverrouiller, pas poser. `probe_pad`
  y tombe typiquement : son unlock (ore 15 + carbon 10) peut vider le stock
  sous son coût de pose (ore 8 + carbon 5), le rendant invisible juste après
  l'unlock.
- **Correctif** : `CardState` porte désormais un booléen `unlocked` qui
  sépare les deux familles de blocage. Le filtre de la main garde `placeable`,
  `unlockable` ET tout `blocked` déverrouillé. Une carte déverrouillée mais
  bloquée reste visible, désaturée (`data-blocked`), avec sa raison AFFICHÉE
  (icône d'alerte + libellé, jamais un grisé muet, §4/§18) ; dès que la
  contrainte se lève, le bouton « Place » réapparaît. Le catalogue pré-unlock
  continue de vivre exclusivement dans l'arbre « Technology DNA ».
- **Tests** : `CardHand.test.tsx` (nouveau, 4 cas) verrouille le contrat —
  probe_pad finançable → `placeable` dans la main ; probe_pad déverrouillé
  mais trop cher → `blocked`+`unlocked`, RESTE dans la main ; probe_pad non
  déverrouillé → `blocked`+`unlocked:false`, filtré ; mine déverrouillée sans
  tuile libre → reste dans la main. E2E `game-flow` (« vue planète »)
  actualisé : l'invariant devient « chaque carte porte une action OU sa
  raison visible », jamais rien de muet. Le scénario dédié
  `card-hand-regression.spec.ts` matérialise aussi le plafond `maxInstances`
  du télescope et vérifie que la carte bloquée reste visible avec sa raison ;
  capture `cardreg-telescope-maxed-visible.jpeg` inspectée à 1440×900.

### Carte galaxie — zoom molette retiré, contrôles − / + ajoutés

- **Problème** : le zoom à la molette entrait en conflit avec le zoom de
  page des navigateurs (Microsoft Edge en particulier détourne la molette),
  rendant la navigation de la carte inutilisable.
- **Changement** : l'écouteur `wheel` de la carte galaxie est **retiré**
  (plus aucun zoom molette). Le zoom passe désormais par des **contrôles
  explicites `−` / curseur / `+` en bas à gauche** de la vue, plus le
  clavier (`+` / `-`) déjà présent. Les boutons et le curseur pilotent la
  caméra LIVE (`sceneRef`), bornes 0.15–8, avec libellés ARIA et focus
  clavier visible ; le miroir React `zoomLevel` garde le curseur synchrone
  avec le zoom clavier. Vérifié : typecheck vert ; E2E + visuel à rejouer
  port 8080 libre (dev server du responsable actif — déjà en HMR).

### Correctif UI — panneau de bâtiment figé au changement de sélection

- **Bug** : en passant d'un bâtiment à un autre, le panneau affichait la
  **workforce** et le **run %** du bâtiment PRÉCÉDENT. Le backend est bien
  par bâtiment (colonnes `buildings.workforce`/`run_pct`, optimum par
  bâtiment) ; c'était l'UI qui ne suivait pas : `BuildingPanel` initialise
  ces valeurs via `useState(building.*)`, qui ne se relit qu'au montage, et
  l'instance était réutilisée d'une sélection à l'autre.
- **Correctif** : `key={b.id}` sur `<BuildingPanel>` (PlanetView) — le
  panneau se remonte à chaque bâtiment sélectionné, ré-initialisant tous ses
  états locaux (workforce, run %, slot marché, confirmation de démolition)
  depuis le bâtiment courant. Vérifié : typecheck vert ; vérification E2E +
  visuelle à rejouer port 8080 libre (dev server du responsable actif).

### Population v2 — médicaments optionnels pondérés par âge

- **Décision responsable du 2026-07-20** : la médecine reste facultative et
  vendable en surplus, mais son burn démographique est distinct des rations
  de survie : actifs 1×, enfants 1,25×, seniors 1,5× [TUNE-v1], sur une base
  de 0,1 T/1 000 têtes pondérées/jour. Mitigation maladie jusqu'au bord exact
  du stock zéro (ou fourniture live couvrant tout le besoin), aucune
  mitigation sur flux partiel à zéro, aucun stock négatif et aucune horloge
  de mort. Contrat persisté avant implémentation dans GAME_BOOK §10,
  DESIGN_GUIDE §3.2-v2, POP_V2_PLAN, BACKLOG, BALANCE_LOG et JOURNAL.
- **Implémentation** : `MEDICINE_AGE_WEIGHTS` et
  `medicineWeightedHeads(C/A/S)` séparent le burn médical des rations de
  survie C/S×0,6. Le rebase passe les deux charges à `computeRates` ; le
  `pop_daily` utilise un prédicat partagé de couverture complète. Une réserve
  positive paie le plein débit jusqu'à son `stock_edge`, un flux live complet
  maintient le bonus à stock zéro, un flux partiel est brûlé sans mitigation,
  et le surplus conserve un débit `planet_stock` positif. L'ancien helper v1
  `habitability()` a été corrigé : la médecine ne nourrit jamais la natalité.
- **Preuves dédiées** : unit shared (poids, starter 413,5, couverture) et
  server (réserve, flux partiel/complet, surplus), intégration PostgreSQL sur
  quatre mondes identiques (stock/à-sec/épuisé/lab), Codex anti-dérive + E2E
  avec capture `codex-03-population-medicine.jpeg` inspectée à 1440×900.
- **DoD final** : shared 178/178, server unit 42/42, client 15/15,
  intégration PostgreSQL 290/290, typecheck et build production verts. Le
  balayage Playwright complet passe 39/39 en 32,2 min (base recréée, un
  worker, zéro retry), puis le scénario Codex final 1/1 sur une seconde base
  recréée. Sept captures sont observées, dont la règle médicale finale et le
  viewport minimum 1280×800 ; aucune migration n'était requise.

### Player Codex — tranche 1 implémentée (P2.codex, shell + 3 chapitres)

- **Manuel joueur in-game (commit 2a4990e)** : bouton « Codex » sur le rail de
  navigation (accessible depuis chaque écran) ouvrant un overlay dialog
  (`useDialogFocus` — piège de focus, Échap, retour de focus) deep-linké sur le
  chapitre correspondant à l'écran courant. Trois chapitres spoiler-free :
  gisements & minage de trace (avec l'asymétrie « à sec = 0 pour toujours » ≠
  « jamais eu = trace pour toujours »), population (trois âges, natalité,
  rations, oxygène hostile, médecine optionnelle par âge, horloges de mort,
  sur-capacité), efficacité & emploi (courbe E(u), optimum qui dérive, le
  chômage tue, frein de stockage). Tous les
  chiffres et courbes rendus EN DIRECT depuis `@atg/shared` (`facts.ts`,
  `EfficiencyCurve` réutilisé, pyramide via `stableSplit`) — un test unitaire
  (`facts.test.ts`, 7/7) lie chaque valeur à sa constante source. Textes dans un
  namespace `codex/strings.ts` dédié (déviation de concurrence documentée : le
  `i18n/en.ts` partagé était sous édition parallèle). Vérifs : typecheck + vite
  build OK, vitest 11/11 à la livraison initiale, 7 captures désormais
  observées (§16), dont la règle médicale exacte et le viewport minimum.
  L'E2E dédié (`e2e/tests/codex.spec.ts`) est revalidé post-médecine dans le
  balayage complet **39/39**, puis seul **1/1**, sur bases recréées (un worker
  déterministe, zéro retry).

### Player Codex — plan persisté (P2.codex, avant tout code — CLAUDE.md §5)

- **Spec du manuel joueur in-game (`docs/MANUAL_PLAN.md`)** : décision du
  responsable actée (2026-07-20) de doter le jeu d'un Codex accessible depuis
  chaque écran, distinct du canon développeur (aucune référence interne),
  **spoiler-free** (on explique les *systèmes*, jamais le contenu à découvrir),
  *reference before strategy* (guides de stratégie différés tant que
  l'équilibrage bouge). Contrainte architecturale centrale : **anti-dérive** —
  le Codex ne possède aucun chiffre, toutes les valeurs sont rendues en direct
  depuis les constantes `@atg/shared` que la simulation elle-même utilise
  (`TRACE_MINING_T_PER_DAY`, `EFFICIENCY_*`, `UNEMP_*`, épochs `popv2`…), textes
  centralisés dans le namespace typé `codexEn` (migration future vers
  `t.codex.*` documentée), courbes tracées depuis les vraies fonctions
  partagées ;
  un test unitaire liera chaque valeur documentée à sa constante vivante.
  Première tranche validée : coquille de livraison + 3 mécaniques
  (gisements/minage de trace, population v2, efficacité/emploi). Documents
  impactés committés avant code : MANUAL_PLAN.md, BACKLOG (§P2.codex + garde-fou
  DoD permanent), DAT (composant Codex), DESIGN_SYSTEM (§5). Le défaut
  d'intégrité documentaire relevé au passage est désormais corrigé : tous les
  chemins vivants pointent vers le vrai fichier `GAME_BOOK.md` (les anciens
  messages de commit restent naturellement immuables).

### Implémentation P1 (démarrée 2026-07-12 sur GO du responsable)

- **Population v2 — manifeste C/A/S, extinction et mémoire démographique
  (chunk BD — DG §3.2-v2 j/k, GB §10/§12)** : migration 024 ajoute au
  vaisseau les cohortes enfants/actifs/seniors avec contrainte
  `settlers = C + A + S`. L'embarquement choisit chaque catégorie sans garde
  morale, limite les comptes aux cohortes réelles et réduit le staff au
  prorata des actifs restants ; le péage de route déterministe ventile ses
  morts au plus fort reste et alimente l'historique du monde d'origine.
  Toute voie atteignant P=0 passe par une transition d'extinction unique :
  propriété, starter, offres innées, horloges et gouverneurs hôtes sont
  retirés, tandis que bâtiments, techs, stocks et gisements restent ; un
  monde sauvage ne produit jamais. La recolonisation repart du manifeste
  livré exact avec compteurs remis à zéro et grâce neuve. L'intel palier ≥3
  expose morts/départs C/A/S, et le seed valide la pyramide réelle
  C/A/S 64/191/95. UI d'embarquement, labels accessibles et scénarios
  extinction→recolonisation/intel livrés ; quatre captures 1440×900 inspectées.
  DoD final sur PostgreSQL local recréé : shared 176/176, server unit 38/38,
  client unit 15/15, intégration 289/289, typecheck et build verts, E2E complet
  39/39 en 29,8 min (un worker déterministe, zéro retry).
- **Population v2 — clinique, ledger démographique et alarmes de survie
  (chunk BC — DG §3.2-v2 h/i, GB §10)** : la clinique devient le 29e
  bâtiment (carte, nœud T2 politics-free, coûts [TUNE-v1], stubs complets
  L1–L3 base/hot/cold) et réduit l'indice de maladie de 10/20/35 %. La page
  stats est désormais alimentée par un calcul serveur unique partagé avec le
  tick démographique : pyramide C/A/S, part consommatrice inactive, emploi,
  chômage, Ē, maladie brute/effective, facteurs de natalité, flux NETS signés
  par ressource et emplois/optimum/u/E de chaque bâtiment. Les stocks de
  survie exposent une projection stable/à-sec/compte à rebours avec date de
  perte totale ; l'oxygène hostile annonce sa mort instantanée longtemps à
  l'avance. Le générateur d'assets couvre maintenant 597 entrées ×3, y
  compris la ressource `junk` auparavant absente de son manifeste.
- **Population v2 — emploi universel & le chômage tue (chunk BB — DG
  §3.2-v2 e/f/g, Round 9)** : TOUS les bâtiments emploient (table
  BASE_JOBS exhaustive, 29 types) sur un optimum qui DÉRIVE
  avec la population — jobsOptimal = base × [1/2,4/5] ×
  clamp(√(P/2000), 1, 2) : négligence = érosion (« point qui shifte »).
  **E_planet est SUPPRIMÉ** (planetMultiplier = G ; planetEfficiency
  des vues = Ē staff-pondéré) ; la main-d'œuvre assignable = les ACTIFS
  (fin du 60 % × pop). Starter à 350 habitants (pyramide stationnaire —
  naître SOUS sa capacité d'emploi, Round 9). Mortalité de chômage :
  tolérance 7 %, grâce 3 j consécutifs (migration 023), inerte pendant
  la grâce de colonie 14 j ; puis morts γ(τ−7 %)×P frappant toute la
  pyramide ET décrémentant le staff de chaque bâtiment (vagues,
  momentum). Embarquer des settlers prélève des actifs. Interp annoncée
  [TUNE-v1] : la FONCTION des bâtiments non-industriels reste binaire
  (active/inactive) — le gating fonctionnel par staffing viendra.
  Instrumentation §15 : /test/grant-population (mûrir un monde).
- **Population v2 — cœur démographique (chunk BA — DG §3.2-v2, GB §10
  v2, Round 9 / guide v0.10)** : la population devient TROIS ÂGES
  (enfants —20 j→ actifs —60 j→ seniors —~30 j→ †, pyramide stationnaire
  18,2/54,5/27,3), matérialisés par le pop_daily v2 (la croissance
  logistique v1 est RETIRÉE). Natalité UNIQUEMENT via residential actif
  (0,12/0,18/0,24 par actif/j [TUNE]) × M_growth = (0,5 + 0,5·Ē) ×
  M_life — les flux de vie sont LOCAUX : vivre d'imports ne nourrit
  jamais la croissance (canon). Rations pondérées (enfants/seniors
  ×0,6) ; OXYGÈNE respiré au stock sur climats hostiles seulement
  (temperate = ambiant), 0,6 T/1000/j [TUNE], provision de 20 T ajoutée
  au kit colonial. Horloges de mort planétaires : famille à sec + besoin
  non servi ⇒ échéance FIXE (eau 3 j, vivres 10 j — morts linéaires
  quotidiennes puis mort TOTALE à l'échéance par pop_clock, levée si le
  stock revient) ; oxygène = mort INSTANTANÉE (vérifiée au bord de stock
  exact ET au quotidien). Maladie v2 : parabole de sur-cap (1,2·o²,
  morts 0,25·o²·P [TUNE]) avec crochet clinique (bâtiment au chunk BC).
  Compteurs morts/exodés par catégorie persistés. Migration 022 (pyramide +
  backfill, horloges, compteurs). Les dépendances alors annoncées ont ensuite
  été livrées dans l'ordre : emploi/popScale/E_planet/chômage (BB),
  clinique/UI (BC), puis embarquement catégoriel/extinction/intel (BD).
- **Anti-softlock du démarrage (chunk AN — GB §19 « starter knowledge »,
  décision responsable du 2026-07-19 après playtest)** : l'ouverture
  « télescope d'abord » pouvait consommer la dotation AVANT l'unlock de
  la mine — zéro revenu, remboursement de démolition insuffisant :
  impasse définitive. Trois leviers cumulés : (1) le starter naît avec
  les QUATRE savoirs T0 jamais-masqués déjà débloqués (telescope,
  probe_pad, depot, mine — la pose reste payante ; colony_program reste
  un unlock payant) ; (2) dotation relevée `{ore 100, carbon 44,
  silicon 28, hydrogen 24, oxygen 20, food 32, water 32}` [TUNE] avec
  contrainte de plafond DOCUMENTÉE ET TESTÉE : roll max ×1.3 + 150 u de
  fuel ≤ frein de stockage 0.7 × 800 T − 40 T (jamais pré-freiné —
  « new colonies start healthy ») ; (3) onboarding : bandeau « First
  steps » sur le starter tant qu'aucune mine n'est posée, description du
  programme colonial (objectif de milieu de partie), tooltip d'effets
  sur chaque carte de la main. Canon amendé : GAME_BOOK §19 (starter
  knowledge), DESIGN_GUIDE §2.2 (valeurs + plafond). Aucune migration.
- **Auto-trade du survol étranger (chunk AM)** : le canon « if food <
  20, buy 200 food best effort » est jouable. Jusqu'à 3 règles par coque
  ({ressource, seuil, quantité} [TUNE-v1]) ; en survol d'un monde
  d'AUTRUI, quand le réservoir de destination (tank pour le carburant du
  type embarqué, provisions pour les familles food/water, soute sinon)
  passe sous le seuil, la coque rachète au PREMIER slot fixe actif dont
  le monde VEND la ressource — contrepartie payée depuis la SOUTE,
  encaissée au stock du monde, borne de prix ≤ 3 T par tonne reçue
  [TUNE-v1 interp du « 3× census median » — la médiane de prix census
  n'existe pas encore], caps physiques respectés, trade journalisé
  (slot −3). Déclenchement PARESSEUX : auto_trade_check posé au
  whenReaches du seuil le plus proche (check immédiat si déjà dessous),
  armé aux vraies entrées en survol (arrivée, undock, relocate §15).
  Migration 021. UI : section « Auto-trade (foreign hover) » repliable
  du panneau vaisseau (3 lignes règle + Apply).
- **Consentement 50/50 des stargates (chunk AL)** : le flux canon
  inter-joueurs (« the price is split between the two owners — both
  consent »). Une PROPOSITION s'épingle depuis un monde à yard ACTIF
  vers le monde d'AUTRUI (rien n'est débité à la proposition — patron
  des offres manuelles, TTL 48 h réelles [TUNE-v1], balayage paresseux) ;
  seul le propriétaire CIBLE répond ; ACCEPTER re-vérifie tout, paie LES
  DEUX moitiés (125 cells + 200 steelH + 50 cristal chacun, chacune sur
  SON monde, cristal résolu par SON climat) et lance le chantier
  (propriétaire d'écriture = proposeur). Les DEUX propriétaires
  d'endpoints sont EXEMPTS de péage (co-payeurs [interp]). Migration
  020. UI : « Propose to a foreign world » dans la section Stargates
  (mondes étrangers visibles), inbox « Gate proposals » sur le monde
  cible (Accept & pay half / Decline).
- **Stargates v1 (chunk AK)** : le raccourci SÛR du réseau (GB §6).
  Chantier au stargate_yard ACTIF (coût 250 cells + 400 steelH + 100
  cristal du climat [TUNE], 48 h de jeu [TUNE-v1], 1 chantier concurrent
  par niveau, paire unique) — v1 : les DEUX endpoints appartiennent au
  bâtisseur (le partage 50/50 avec consentement inter-joueurs, canon,
  arrive avec son flux dédié — annoncé). Traversée INSTANTANÉE, zéro
  carburant : péage « hard gate » depuis la SOUTE pour les
  non-propriétaires (encaissé au stock du monde d'entrée [interp]),
  capacité 1 vaisseau/tick/direction [TUNE], sortie DISPERSÉE U(0–15) pc
  par hash seedé (shipId, tick — déterministe, anti-camping). Le gate
  MEURT avec l'un ou l'autre endpoint (cascade + purge à l'annihilation
  par supernova). Le vaisseau personnel ne traverse que vers SES mondes
  (GB §21). Migration 019. UI : section Stargates du panneau yard
  (build, liste, péage), bouton bleu « Traverse gate » sur le panneau
  vaisseau, gates visibles sous scope (/galaxy).
- **Claim rig & salvage (chunk AJ)** : les épaves du survival-out
  (owner NULL, « no honor » — GB §6) sont désormais RÉCLAMABLES. Le
  claim rig (atelier L2, 25 steelL + 5 gold [TUNE]) permet, immobile à
  ≤ 1 pc [TUNE-v1] d'une épave sans propriétaire, de lancer une
  réclamation de 2 h de jeu [TUNE] — l'événement salvage_claimed
  RE-VÉRIFIE tout à l'échéance (partir ou dériver annule ; une épave
  déjà réclamée est refusée) puis transfère : l'épave devient une coque
  IDLE possédée, sans équipage (la re-crewer exige un quai — remorquage
  et transfert d'équipage en proximité : P4, annoncé). Les épaves sont
  visibles au radar « Wrecks » (/galaxy, mêmes scopes de vision).
  Migration 018.
- **Champs de junk (chunk AI)** : larguer du fret dans le vide (survol/
  idle/échoué, 5 fois par jour réel et par coque [TUNE]) dépose un champ
  de junk dans une CELLULE de 0,5 pc — un champ max par cellule, les
  apports fusionnent, décroissance exponentielle 10 %/jour évaluée à la
  lecture. INTERDIT à moins de 50 pc de tout starter (anti-grief canon) ;
  à ≤ 5 pc d'un trou noir le fret disparaît sans trace (puits canon).
  S'attarder dans une cellule à junk use la coque (15 HP/j par 30 T
  [TUNE-v1 interp], aucun bouclier n'atténue — la traversée de transit
  arrive avec l'interception P5). Les épaves de supernova deviennent du
  junk (carcasse 10/20/40 T [TUNE-v1] + fret répandu). Collecte : junk
  collector d'atelier L2 (15 steelL + 5 silicon [TUNE]), UN scoop de
  30 T par 24 h-jeu [TUNE-v1, discrétisation annoncée du 30 T/day] dans
  la limite des conteneurs — le junk est une RESSOURCE (nouveau tier
  « salvage », 31e entrée du catalogue) destinée au recycleur.
  Migration 017. UI : formulaire Dump, ligne de champ + hasard, boutons
  collecteur/Collect ; champs visibles sous scope dans /galaxy.
- **Réparation d'atelier (chunk AH)** : à quai de SON monde à workshop
  ACTIF, une coque endommagée regagne 5 % de ses HP max par heure ×
  mult(1/2/4 selon le niveau — le MEILLEUR atelier sert [TUNE-v1]),
  l'acier étant facturé au stock planétaire proportionnellement (0,1 T
  de steelL par HP rendu [TUNE-v1], tout-ou-rien famille — acier à sec
  ⇒ la réparation s'arrête au recompute, patron fuel/survie). Le bord
  hull_repaired coupe l'acier au plein. L'usure et la réparation se
  COMPENSENT (net) sur les mondes hostiles. Mondes d'autrui : aucun
  service (politique whom-to-serve — P4). UI : ligne verte « under
  repair — the workshop bills steel per HP » sous la jauge de coque.
- **Usure de coque & boucliers (chunk AG)** : opérer sans le bouclier
  apparié en environnement hostile coûte 5 % des HP max/jour [TUNE] par
  source (cumul additif) — monde chaud/froid sous la coque, zone ≤ 5 pc
  d'un trou noir ou d'une étoile en flare (radio) — plus les dégâts de
  proximité du harvest rig (d < d_safe, D_max×((5−d)/5)², aucun bouclier
  ne les atténue [TUNE-v1]). Un PÉAGE canon, jamais une mort : plancher
  1 HP ; tempéré jamais ; bâtiments jamais ; transit/entrepôt/colonies
  exempts [TUNE-v1]. HP de coque PARESSEUX (migration 016, motif fuel),
  rebase en piggyback de tous les points d'état (les spreads périmés de
  six call sites ont été corrigés au passage). Trois boucliers d'atelier
  (workshop L2, 15 steelL + 5 cristal apparié [TUNE], radio → nox
  [interp]). UI : jauge de coque + ligne d'usure ambrée + boutons de
  montage. Poison-harvest : dormant (aucune récolte de gisement poison
  n'existe encore, annoncé).
- **Récolte stellaire & Starfall (chunk AF)** : le harvest rig
  (accessoire d'atelier, 20 steelL + 5 crystal + 5 gold [TUNE]) se monte
  à quai ; une coque IMMOBILE à ≤ 8 pc d'une étoile du même type de
  carburant récolte au gradient canon R_max × (1 − d/d_max)² (120 u/j,
  d_max 8 pc [TUNE]), net de l'entretien idle — deux ledgers paresseux
  (réservoir ↑, stock CACHÉ de l'étoile ↓, jamais exposé). Réservoir
  plein → le gréement se replie (bord harvest_full) ; départ = arrêt
  automatique. FLARE ≤ 5 % du stock initial : la seule jauge de
  l'univers, chip danger visible sous scope. SUPERNOVA à stock nul :
  annihilation STRICTE dans R_nova (coques détruites avec équipages
  host-fate ; mondes réduits en cendre — annihilated, jamais
  recolonisables ; le starter généré À R_nova exactement reste SAUF,
  canon), classe L → trou noir, S/M → plus rien. Migration 015.
  Restent (annoncés) : dégâts de coque sous d_safe (chunk usure/climate
  shields), junk d'épaves (chunk salvage), attribution télescope L3.
- **Avitaillement de survie & survol nourri par le monde (chunk AE)** :
  en survol de SON monde, le stock planétaire nourrit l'équipage (canon
  GB §7) — familles food (food_1→3) et water consommées APRÈS la survie
  de la population, tout-ou-rien par famille, l'horloge de la coque
  restant exempte tant que le monde SERT ; monde à sec → bascule
  automatique, les provisions de bord paient (patron fuel, décision au
  recompute planétaire). Nouveau `POST /ships/:id/provision`
  (avitaillement sur SES mondes — à quai, en survol ou échoué) qui
  remplit food et water à la capacité de coque (survivalCrewDays × 0.01
  × équipage) depuis le stock ; bouton Provision dans le panneau
  vaisseau. **Deux régressions latentes corrigées** : le recompute
  planétaire et l'arrivée de transit rebasaient la survie avec une ligne
  `ships` partielle et écrasaient les provisions à zéro (verrouillé par
  deux tests de régression).
- **Entrepôt de véhicules (chunk AD)** : balances S/M/L SÉPARÉES par
  monde possédé — tampon au sol 2 M + 2 S (jamais de L), chaque warehouse
  ACTIF ajoutant 6 S/4 M/2 L × multiplicateur de niveau (L1 ×1, L2 ×2,
  L3 ×3). Entreposer (à quai sur SON monde ; personnel/sonde exclus)
  coûte zéro entretien — drains carburant ET survie désarmés — et LIBÈRE
  l'équipage : seul point de sortie du lien permanent (GB §12), le
  ré-embarquement restant possible AU warehouse. Redéploiement en
  1/3/6 h par taille [TUNE] ÷ échelle via l'événement `ship_retrieved`,
  dock libre exigé au lancement, un seul redéploiement à la fois. Vues :
  `retrievesAt` (flotte), `vehicles {capacity, stored}` (planète) ; UI
  panneau vaisseau (boutons Warehouse/Retrieve, minuteur) et balances
  affichées sur le bâtiment warehouse. Balances d'items (50/niveau) et
  blocage d'usine : dormants sans usines d'unités (annoncé) ; parking
  allié P4.
- **Preuve E2E du rattrapage hors-ligne (chunk AC)** :
  offline-catchup.spec.ts — le Souverain lance un spaceport en chantier
  et une quille de Cargo S, une mine extrait à taux réel ; DÉCONNEXION,
  120 s d'absence réelle (≈ 10 j-jeu d'événements) ; au retour : le
  spaceport est ACTIF, le vaisseau est NÉ à quai (worker, échelle
  ×7200), et le stock lazy vaut témoin + taux × Δt_réel à ±0,05 T près
  (zéro dérive — l'exactitude 1e-9 est prouvée en intégration
  colony-loop ; ici la preuve UTILISATEUR de bout en bout, GB §15/DG
  §1). Captures off-01/02 observées. Items backlog « sim core » et
  « Offline catch-up correctness E2E » soldés.
- **Horloges de survie & derelict (chunk AB)** : migration 014
  (`owner_id` nullable, réservoir de survie PARESSEUX
  survival_rate/as_of, `flee_armed` défaut vrai). Drain 0,01 T/j de food
  ET water PAR membre d'équipage [TUNE] partout où l'équipage vit à bord
  (survol étranger/sauvage, idle, TRANSIT — l'horloge de mort du vol —,
  échoué) ; exempt : à quai/entrepôt (l'hôte nourrit [TUNE-v1]), survol
  de SON monde (le chemin stock-planète comme le fuel reste à brancher
  [TUNE-v1 annoncé]), colonizing, derelict, probe/personal ; l'horloge
  ne S'ARME que si des provisions existent [TUNE-v1 annoncé — l'Arche
  porte ses vivres en soute ; le hauler de spawn (2/2) vit la boucle].
  Rebase de survie en PIGGYBACK de chaque rebase de drain + départ en
  transit + changement d'équipage. Alarme à 25 % de la capacité de coque
  (survivalCrewDays × 0,01 × équipage [TUNE-v1 interp]) : politique
  auto-flee-home ARMÉE par défaut (anti-extorsion DG §3.5), désarmable —
  la coque prend la route du monde possédé le plus proche À PORTÉE du
  réservoir (handler factory timeScale). survival_out : équipage MORT
  (host-fate canon), coque DERELICT dépouillée (owner NULL — disparue de
  la flotte, épave salvageable ; claims avec les items P4, hijack P5).
  UI : bouton « Assign pilot » étendu aux coques cargo/combat
  (complétude — il n'existait que sur les civils), section « Crew
  survival » (jauge, taux, politique, bascule). Instrumentation §15 :
  POST /test/ship-survival. Tests : 3 blocs unit shared + 7 intégration
  (statuts/exemptions, bords planifiés, §10, flee armé/désarmé à portée
  déterministe, out idempotent) + E2E survival.spec.ts (jauge → drain
  sauvage → bascule → expiration → épave disparue), captures sv-01…03
  observées. Une régression réelle attrapée par les tests : les coques
  équipées SANS provisions mouraient au départ — d'où la garde.
- **Texturation de l'UI (chunk AA, demande du responsable)** :
  `game/scripts/genUiTextures.mjs` — quatre fonds tuilables TRÈS bas
  contraste générés par gpt-image-2 (ui-panel tissage carbone, ui-card
  plaques rivetées, ui-shell strates stellaires, ui-veil nébuleuse),
  archives PNG pleines dans docs/design/prototypes, assets webp 512²
  (2–24 Ko). Intégrés en couche INTERMÉDIAIRE des fonds existants
  (gradients par-dessus, alphas abaissés 0.97→~0.9) sur : panneaux de
  commande et cartes du deck (planet-panels), panneau galaxie,
  inspecteur et plaque planète (scenes), rail (shell), voile modal.
  Ce n'est PAS un remplacement d'art de jeu — texturation de chrome
  uniquement ; lisibilité §22 vérifiée à la vision (sonde jetable,
  3 captures : modale+deck, vue planète, panneau galaxie).
- **Textures de sol générées par climat (chunk Z, demande du
  responsable)** : `game/scripts/genSoil.mjs` — pipeline reproductible
  OpenAI Images (gpt-image-2, clé `OPENAI_KEY` du .env local, JAMAIS
  commitée) → 4 sols 1024² (temperate mousse sombre, hot terre craquelée
  braise, cold permafrost veiné, poison boue chartreuse), archives PNG
  pleines dans docs/design/prototypes (convention CLAUDE.md), assets
  servis en webp 768² (~130–180 Ko, ffmpeg). La vue planète pose la
  texture en TilingSprite MASQUÉE par le contour organique du chunk X,
  sous le mouchetis/rim (accents conservés) ; texture absente → repli
  procédural intact. §16 : sonde jetable sur la vraie stack, captures
  des 4 climats observées (climat forcé en base dev entre les prises).
- **Retool 24 h & overfill-on-delivery (chunk Y)** : migration 013
  (statut de bâtiment `retooling`). Rééquipage d'une industrie (DG §5.1
  « re-targeting = 24 h retool » [TUNE]) : la nouvelle recette est
  écrite immédiatement mais la production S'ARRÊTE (le rebase ne compte
  que les industries actives) jusqu'à `retool_complete` ; gouvernance
  TOUTE Industrialist (DG §4.1) = retool INSTANTANÉ, ≤ 1 switch par
  fenêtre de 24 h (au-delà : retool standard [TUNE-v1 interp] ; fenêtre
  dans buildings.config) ; les réductions de durée du monde-forge
  (−25/40/50 %) attendent la spécialisation (annoncé) ; validation de
  recette RÉUTILISÉE (max-1-extracteur/gisement avec auto-exclusion).
  **Alignement canon §3.3b** : « swaps/deliveries may overfill
  (physics) ; only production halts at cap » — les SIX refus de cap
  historiques sont levés (décharge de fret, taux fixe, hospitalité
  innée, swap AMM, route AMM, acceptation manuelle) : la livraison
  atterrit TOUJOURS, le frein/halt de production absorbe le trop-plein
  (les deux tests qui verrouillaient l'ancien comportement strict ont
  été retournés en preuves d'overfill). UI : bouton Retool (industries
  actives) rouvrant le sélecteur de recette, badge/minuteur
  « Retooling · recette », notices instantané vs pause. Tests : 5
  intégration retool (minuté avec production coupée puis éveil,
  instantané + fenêtre occupée/libérée, §10 directs, gisement pris) +
  2 tests amendés overfill + E2E retool.spec.ts (instantané puis 24 h
  minutées à ×7200), captures ret-01…03 observées.
- **Routage cells-étoile, double-fee & nudge triade (chunk V)** :
  composition pure partagée `ammRouteQuote` (la sortie de la jambe 1
  nourrit la jambe 2, chaque jambe prélève les frais de SON pool — le
  « double fee » canon est démontré en test contre un pool direct
  équivalent). Serveur : POST /planets/:id/amm-route = MEILLEURE
  EXÉCUTION give→get sur les pools de LA planète — candidats directs
  (frais simples) ET routes à deux jambes via un intermédiaire commun,
  seules les routes EXÉCUTABLES concourent (whitelist par jambe,
  propriétaire exempt ; limites quotidienne/absolue de chaque slot),
  départage déterministe, règlement ATOMIQUE (l'intermédiaire ne touche
  jamais la soute, journal `trades` par jambe, commissions maison par
  jambe au stock, delta net §3.3b) ; une route peut traverser deux
  bâtiments de marché du même monde [interp annoncée : la place de
  marché est planétaire] ; verrous marchés (id croissant) → corps →
  vaisseau. Nudge triade (DG §11.2) : `planetDetail.triadNudge` — monde
  à marché ACTIF sans AUCUNE paire FOOD (fixe ou AMM) dans la portée
  TÉLESCOPE du propriétaire (CTE de scope réutilisée ; la vision des
  coques n'entre pas — canon « telescope range » ; l'hospitalité innée
  n'est pas une paire [interp]). UI : formulaire « Route swap (best
  execution) » du vaisseau à quai (notice avec intermédiaire et « 2×
  frais »), hint triade dans le panneau marché. docs/SUGGESTIONS.md créé
  (demande du responsable : journal des propositions de l'agent).
  Tests : 2 blocs unit shared + 7 intégration (quote composée exacte,
  journal ×2, intermédiaire jamais en soute, direct-meilleur gagne,
  éligibilité par jambe, §10, nudge propre/étranger-visible/hors-portée/
  null) + E2E route.spec.ts (nudge visible → route via cells → paire
  food/cells éteint le nudge), 3 captures observées, 21/21 E2E ; les
  specs AMM/route posent désormais un depot (le roll de TAILLE du
  starter fait varier la franchise de stockage — flake diagnostiqué).
- **Pools AMM du marché L2 (chunk U)** : AUCUNE migration (les pools
  vivent dans `buildings.config.slots`, motif 004). Maths pures
  partagées : produit constant x·y = k, spot = ry/rx, frais sur la jambe
  d'ENTRÉE — 25 bp LP accumulés DANS la réserve (k croît, la valeur
  revient au retrait) + 25 bp maison au stock planétaire [TUNE round
  4a] ; marché L3 → jambe LP 20 bp (canon) ; le RATIO du dépôt initial
  EST le prix (« seeding is a pricing decision »). Serveur : seed
  (marché L2+ ACTIF, propriétaire, slot libre, jambes déduites
  PHYSIQUEMENT du stock, gate mercantile porté par le level-up),
  liquidité v1 PROPRIÉTAIRE (add proportionnel préservant le prix ;
  remove pct — 100 % vide et LIBÈRE le slot, les slots portent des
  TROUS null) — les LP visiteurs, liens de conquête et retrait garanti
  arrivent avec les shares P4 (annoncé) ; échange bidirectionnel à quai
  (jambe au choix, whitelist propriétaire-exempt, limites
  quotidienne/absolue contre le journal `trades`, conteneurs DG §7,
  stockage en delta net §3.3b) ; le slot AMM se protège (re-seed et
  taux-fixe refusés) et executeTrade refuse les slots AMM. Les réserves
  COMPTENT au cap de stockage (DG §3.3b ligne 172 : pooledT injecté dans
  computeRates, storageUsedT, contrôles de cap) et au census (« stocks +
  cargo + pools + escrow » : compartiment `ammPoolT` dédié dans
  aggregateCensus, meta.sources +'amm_pools'). Le spot n'est JAMAIS un
  oracle (pods = census, inchangé). UI : section « AMM pool (L2+) » du
  panneau marché (seed avec PRIX INDUIT affiché avant l'engagement,
  ligne de pool réserves/spot/frais, add/remove), carte « AMM x ⇄ y »
  du vaisseau à quai (jambe au choix, Swap, notice avec spot après).
  Tests : 5 blocs unit shared (k exact sans frais, croissance de k par
  la jambe LP, dérive du spot, L3, gardes) + 9 intégration (physicalité
  du seed, stockage inchangé au seed, quote partagée = règlement à
  1e-9 près, jambe inverse, whitelist/limites, liquidité, census
  neutre + compartiment) + E2E amm.spec.ts (Mercantile réel : L2 par
  level-up gouverné, seed 60/30 → spot 0.5, swap 3 T → spot 0.4537,
  retrait 100 % → stock restitué), 4 captures observées, 20/20 E2E.
- **Sol de terrain par climat + slots discrets (chunk X — demande du
  responsable)** : la vue planète pose désormais les tuiles sur une DALLE
  DE TERRAIN organique par climat (référence : prototype 02-iso-colony)
  — contour perturbé par bruit STABLE par planète (chaque monde a sa
  silhouette), rim/épaisseur sombres, mouchetis procédural en trois
  teintes de la rampe climatique (tempéré vert forêt, hot ocre-rouille,
  cold bleu-acier, poison vert acide) ; l'aura et l'ombre s'adaptent à
  l'étendue de la grille. Les slots de tuiles deviennent FANTÔMES
  (alpha 0.2, coutures fines) : révélés au survol (alpha 1 + teinte),
  PULSÉS quand une carte est armée (les tuiles libres restent lisibles
  pendant la pose ; statique si prefers-reduced-motion), quasi effacés
  sous un bâtiment (le sprite possède la scène) ; les falaises par tuile
  disparaissent (la dalle porte le relief). Le losange interactif
  148×74 est INCHANGÉ (contrats pointeur et E2E). LIMITE signalée :
  aucun canal fal.ai dans cette session (hôtes bloqués par le proxy,
  aucune clé FAL_KEY/OPEN_AI_KEY provisionnée) — rendu PROCÉDURAL v1,
  les textures générées remplaceront ce rendu quand une clé sera
  disponible (JOURNAL). Vérifié : game-flow 12/12 (pose et panneaux par
  clic de tuile intacts) + docks/gouvernance/colonisation/manuel 4/4 ;
  §16 : 4 climats observés (sonde jetable sur la vraie stack, comptes
  réels re-teintés en base de dev).
- **Gouvernance v1 (chunk W)** : AUCUNE migration (les liaisons `npcs`
  suffisent). Module partagé pur : exigences par taille S 0 / M 1 / L 3
  (canon GB §11, caps d'installation identiques), G = 1.0 pleinement
  gouverné, 0.5 sous l'exigence (canon pour les grands, généralisé aux
  moyens [TUNE-v1 interp]), +2 % × tier de rareté (échelle 1-based du
  chunk R) du gouverneur INSTALLÉ le plus faible [TUNE]. Le vaisseau
  personnel parqué compte comme UN gouverneur temporaire (GB §21 —
  satisfait l'exigence, masque déjà en place, ne porte ni ne dilue le
  bonus [TUNE-v1 interp]) : un starter moyen tourne à plein tant que le
  Sovereign anchor reste à quai, et tombe à ×0.5 s'il décolle. G injecté
  dans le SNAPSHOT de production (planetMultiplier = E × G — les débits
  de TOUTES les industries suivent, testé exactement ×0.5). Installation
  PERMANENTE (grade gouverneur = rareté ≥ rare, PNJ possédé non hébergé,
  §10 directs testés ; AUCUN chemin de retrait n'existe, par conception)
  ; préview CANON-OBLIGATOIRE (archétypes, masque résultant, nœuds
  PERDUS, G — lecture seule, candidats validés comme à l'installation) ;
  interp chunk N AMENDÉE : le pilote fondateur d'une colonie ne prend un
  siège permanent que s'il est de grade gouverneur — sinon il survit NON
  hébergé (un common squatterait à jamais le siège unique d'un monde
  moyen). UI : section Gouvernance (badge sièges + G coloré, rangées de
  gouverneurs, avertissement demi-efficacité, install avec préview puis
  confirmation TYPÉE du nom de la planète — patron de permanence du
  design system). Instrumentation §15 : POST /test/grant-npc (les rolls
  de pods sont seedés par playerId — non précomputables en E2E).
  Tests : 5 blocs unit shared + 8 intégration (G sur débits réels,
  parqué/décollé, caps, grade, §10, préview sans mutation, grand monde
  3 sièges + bonus min-tier) + E2E governance.spec.ts (starter moyen
  trouvé par l'API, ×1 → ×0.5 visible, préview, bouton inerte sans le
  nom exact, permanence sans le vaisseau), 4 captures observées —
  gov-04 montre l'hospitalité mercantile (chunk L) s'activer à
  l'installation du merchant. Suites : shared 113, serveur 32 + 157,
  E2E 20/20.
- **Canal manuel (chunk T)** : migration 012 (`manual_offers` — l'offre
  épingle le vaisseau à quai de l'acheteur). Visibilité du warehouse
  public/privé (`buildings.config`, défaut PRIVÉ [TUNE-v1] — jamais de
  fuite accidentelle ; réglée par la vraie commande, §10 direct testé) ;
  browse du stock browsable À QUAI uniquement (canon « commerce dock » —
  le survol ne suffit pas, contrairement à l'hospitalité innée) sur un
  monde à ≥ 1 warehouse ACTIF public : montants seuls, jamais les taux
  (intel opérationnel) ; v1 annoncé : l'« item » = ressource fongible du
  pool planétaire (inventaires PAR entrepôt, véhicules et objets avec
  les enchères P4), alliés en orbite = factions P4, contre-offre =
  décliner + nouvelle offre. Offres « à n'importe quel prix » en bundle
  explicite (je prends X de A, je paie Y de B, give > 0 [TUNE-v1
  interp]) avec limites round 7 : 1 OUVERTE par (acheteur, monde,
  ressource), 20 créations/24 h/compte, expiration 48 h RÉELLES [TUNE]
  (balayage paresseux, aucun événement) ; retrait par l'acheteur.
  Résolution par le PROPRIÉTAIRE : décliner, ou accepter avec règlement
  PHYSIQUE — vaisseau épinglé encore à quai, paiement en soute, place
  conteneurs, stock suffisant, stockage en delta NET (§3.3b : l'overfill
  toléré tant que l'échange n'aggrave pas) ; journal trades slot −2 ;
  verrous offre → corps → vaisseau. Instrumentation §15 :
  POST /test/relocate-ship (poches de spawn disjointes — le vol
  inter-poches n'est pas déterministe v1 ; l'atterrissage reste le VRAI
  chemin docks). UI : select de visibilité (panneau warehouse), section
  « Public warehouse » du panneau vaisseau à quai (stock défilable,
  formulaire d'offre, retrait), boîte « Manual offers » du monde vendeur
  (Accept/Decline). Tests : 4 blocs unit shared + 15 intégration + E2E
  manual.spec.ts à DEUX comptes (public → browse → offre → refus doublon
  VISIBLE → acceptation → fret à bord — l'éviction de dock du chunk S a
  été neutralisée par le réglage dwell 720 h : les systèmes
  interagissent comme conçu), 5 captures observées, 19/19 E2E.
- **Docks de spaceport (chunk S)** : migration 011 (`ships.docked_at` —
  horodatage du dernier atterrissage, garde d'éviction + affichage).
  Module partagé pur : comptes CUMULATIFS par niveau (L1 = 2 S ; L2 =
  +2 M ; L3 = +2 L [TUNE]), une coque ≤ son dock, faisabilité GLOUTONNE
  par débordement (S→M→L) ; exemptions canon : personnel, sonde,
  Combat-S ; docks réservés « pour soi » (0–2 [TUNE], défaut 0)
  soustraits du pool VISITEURS plus petits d'abord [TUNE-v1 interp,
  JOURNAL]. Serveur : `landShip` verrouille CORPS avant vaisseau (les
  atterrissages d'un même monde se sérialisent), applique politique puis
  capacité à TOUS (propriétaire compris) dès qu'un spaceport actif
  existe — exception bootstrap [TUNE-v1] : SON monde SANS spaceport
  accueille toujours (le starter naît sans bâtiment) ; refus distincts
  « aucun dock ≥ taille » vs « docks saturés » ; Combat-S se pose
  PARTOUT (politique et sauvage ignorées [interp annoncée — le
  sanctuaire/siège arbitrera en P5]) ; TOUT visiteur d'un monde possédé
  reçoit une éviction de séjour `dock_eviction` (dwell 1–720 h, défaut
  24 h [TUNE], le plus généreux des ports actifs prévaut) — handler
  idempotent gardé par `docked_at` (un re-atterrissage périme l'ancienne
  éviction), renvoi au survol réservoir armé ; les coques nées à quai
  (chantier) peuvent SURCHARGER les docks (annoncé : les docks bornent
  l'atterrissage, pas la production). Réglages spaceport `dwellHours` /
  `reservedForSelf` (PATCH settings, bornes serveur, spaceport
  uniquement, propriétaire uniquement — refus directs §10 testés) ;
  `planetDetail.docks` agrégé (total/occupées par taille/visiteurs/
  réservés/dwell). UI : panneau spaceport — ligne d'usage des docks,
  champs séjour + réservation, notice de refus visible. Tests : 10 unit
  shared + 12 intégration (capacité, structurel vs saturé, exemptions,
  réservations, éviction + péremption, sauvage/Combat-S, bornes §10)
  + E2E docks.spec.ts (usage → réglages → overfill chantier → refus
  saturé VISIBLE → L2 → débordement S en dock M), 5 captures observées.
- **Réparation E2E post-synchronisation (session 36)** : la refonte UI
  (étiquettes-boutons « Inspect X », index de contacts) avait cassé 6
  specs sur 17 — nouvel helper `galaxyLabel`, sélection vaisseaux/
  destinations par l'index de contacts (chemin clavier canonique — les
  clics-sprite au pixel près restent couverts par mouvement/hover),
  comptes FIXES (market, chantier) : la tuile du bâtiment historique se
  lit désormais par l'API au lieu d'un pixel codé en dur, census :
  grant sur GOLD (aucun consommateur continu — l'ore d'un +500 se noyait
  dans les usines de l'univers dev à ×7200), 2 workers Playwright max
  (contention CPU). Suite finale : **18/18**.
- **Pods de recrutement (chunk R)** : migration 010 (journal
  `pod_openings` — cap quotidien ET impact de prix). Module partagé pur :
  `price_r = max(5, B × (S_r/S̄)^0.7)` (B = 40 [TUNE]), S̄ = moyenne
  trimée pondérée par l'offre sur les offres NON NULLES [TUNE interp,
  JOURNAL] ; tables canon rareté 62/24/10/3.4/0.6, rôles uniformes (6),
  peuples 60/30/10 ; rolls individuels À L'OUVERTURE : baseline +4 %/tier
  × U(0.5, 1.5) sur la stat archétype-pertinente (catalogue EXHAUSTIF par
  rôle — seule `settler_risk_reduction` a déjà son consommateur, les 5
  autres clefs attendent leurs chunks [TUNE-GAP]) ; RNG SEEDÉ au moment
  de génération (seed = universe:pod:joueur:index d'achat, sérialisé par
  le verrou de la ligne joueur — reproductible, testé à l'identique).
  Serveur : barème dérivé du DERNIER census MOINS les tonnes payées
  depuis le snapshot (« purchases count into supply immediately ») ;
  ouverture payée PHYSIQUEMENT depuis le stock d'un monde possédé
  (co-location, rebase des taux) ; refus : compte < 45 jours (canon,
  403), cap 10/jour (409), monde d'autrui, stock insuffisant, aucun
  census. PNJ créé lié au compte 60 jours (`account_bound_until` —
  l'héritage strictest-bind au transfert d'hôte arrive avec les
  enchères/NFT P4, annoncé). Instrumentation §15 : POST /test/age-account
  (le compte COURANT seulement — la règle des 45 jours se démontre sans
  attendre 45 jours). UI : onglet Recruitment de l'écran Market (barème
  dans le sélecteur, monde payeur, bouton accent « Open pod », carte de
  révélation rôle/rareté colorée/peuple/stat, roster complet avec
  liaisons) ; GET /pods/prices + POST /pods/open (401 anonymes testés).
  8 unit partagés + 6 intégration (prix exact après impact, cap,
  déterminisme du roll, refus directs §10) + E2E ×2 (refus « trop
  jeune » VISIBLE puis ouverture après vieillissement), suites
  94/32/122/17 vertes, captures pod-01/02 observées (l'impact de prix
  est visible à l'écran : 115,64 → 115,29 T après l'achat).
- **Correctif : re-clamp de la récurrence census au boot du worker** : un
  worker à AUTRE échelle de temps (runDev à TIME_SCALE=1 sur la base de
  dev partagée) peut réclamer un `census_run` et replanifier le suivant à
  +6 h réelles — la chaîne unique est alors gelée pour les workers
  rapides (E2E à 7200). Chaque worker ramène désormais au boot tout
  census pendant au-delà de SON intervalle (UPDATE idempotent,
  auto-guérison dans les deux sens). Observé après le test from-scratch.
- **Correctif « from scratch » (signalement du responsable, testé Node
  22 ET 24)** : sur un clone frais, `runDev`/`resetDb`/tout lancement
  manuel échouaient en `ERR_MODULE_NOT_FOUND` — les exports de
  `@atg/shared` pointent sur `dist/`, jamais construit avant `tsx`. Le
  défaut était masqué sur les machines où un build avait déjà eu lieu
  (et donc attribué à Node 24 — reproduit à l'identique sous Node 22).
  `runDev.sh` et `resetDb.sh` construisent désormais `@atg/shared`
  d'abord ; README : prérequis (Node ≥ 22 vérifié sur 22 et 24, pnpm,
  Docker) + note pour les lancements manuels. Vérifié de bout en bout
  sur clone frais sous Node 24.18 : runDev complet (build, DB,
  migrations, seed, API /health, inscription HTTP, client 200) et
  suites 86/32/116 vertes.
- **Intel télescope par paliers 0–4 (chunk Q)** : module partagé PUR
  (`intel.ts` — intelTierFromSources, projection par LISTE BLANCHE
  stricte par palier, estimation de population à 2 chiffres [TUNE-GAP]) ;
  barème planétaire [TUNE-GAP proposé] : 0 = le corps n'existe pas pour
  l'observateur (404, jamais d'oracle d'existence) ; 1 « silhouette »
  (ciel de base/scan vaisseau/télescope L1) ; 2 « développement »
  (tuiles, population estimée, spaceport ouvert/fermé, paires de marché,
  offres innées — keepFloor jamais publié) ; 3 « stratégique »
  (bâtiments clef/niveau/statut, défenses, PRÉSENCE des gisements sans
  tonnage — DG §11.3) ; 4 « deep sight » (qualité, gisements détaillés,
  ADN tech — le seed ne sort JAMAIS) via +1 scientifique (gouvernance du
  monde source, plafonné +1 — DG §4.1) ou sonde à portée [TUNE-GAP].
  Indice = MEILLEUR télescope couvrant (couverture = scope additif).
  FUITE CANON CORRIGÉE : /galaxy ne publie plus la qualité des mondes
  non possédés. GET /bodies/:id/intel (session requise) ;
  GET /planets/:id INCHANGÉ : owner-only même à palier 4 (le détail
  opérationnel n'est pas de l'intel). UI : panneau du corps étranger par
  paliers (badge Intel L{n}/Deep sight, blocs Development/Strategic/
  Deep sight, rangées cadenas Lucide « ce qui manque ») + bouton Level
  up dans le panneau Infrastructure (les télescopes L2/L3 étaient
  inatteignables à l'écran — gap réel corrigé). 11 unit partagés (listes
  blanches EXACTES par palier) + 8 intégration (montée L1→L4, +1
  gouverneur scientifique, sonde, refus directs §10, fuite fermée) + E2E
  échelle complète sur un monde sauvage de SA poche (le vérificateur de
  spec avait signalé la garantie voisin 150–240 pc comme non ancrée sur
  l'observateur — parcours re-conçu déterministe), suites 86/32/116/16
  vertes, captures int-01..04 observées.
- **Census global de l'offre (chunk P)** : migration 009
  (`census_snapshots` + amorçage idempotent du premier `census_run`) ;
  événement RÉCURRENT auto-replanifié dans la file events (aucun cron —
  patron pop_daily : dédoublonnage puis re-INSERT), cadence
  CENSUS_PER_DAY (défaut 4×/jour [TUNE], GB §13 « admin-configurable »,
  divisée par TIME_SCALE ; le worker ré-amorce la chaîne au boot,
  idempotent) ; agrégation PURE et honnête des DEUX sources existantes —
  stocks planétaires (évalués lazy à l'instant du snapshot, min 0) +
  soutes (tous statuts) ; gisements EXCLUS (non extraits ≠ offre) ;
  pools AMM et escrow d'enchères rejoindront la somme avec leurs chunks
  (manque ENREGISTRÉ dans meta.sources de chaque snapshot) ; un census
  mesure l'état COURANT (nowMs, pas dueAt — pas de rattrapage de
  snapshots du passé après une panne). Publication (DG §11.5) : totaux
  GLOBAUX par ressource UNIQUEMENT — GET /census/latest (session
  requise, 401 anonyme) ne renvoie JAMAIS de ventilation
  planète/entrepôt/source (assertion négative testée sur le JSON
  sérialisé). UI : bouton Market du rail ACTIVÉ → écran Market, onglet
  Census (bandeau horodatage + cadence, phrase canon « Global totals
  only », table sémantique EXHAUSTIVE des 31 ressources groupées par
  tier, zéros affichés, états chargement/erreur/vide) ; Trading/Auctions
  désactivés AVEC la raison. Correctif d'infrastructure E2E : le
  teardown du worker tue désormais son GROUPE de processus (detached) —
  les workers zombies des runs passés réclamaient les événements avec de
  VIEUX intervalles (6 h au lieu de 3 s). 5 unit + 3 intégration
  (agrégat lazy exact, récurrence dédoublonnée, exactement-une-fois,
  401/aucune ventilation) + E2E complet, suites 75/32/108/15 vertes,
  capture cen-01 observée.
- **Drains de loitering, échouage & ravitaillement (chunk O)** : migration
  008 — le réservoir devient une quantité PARESSEUSE
  (`fuel_rate_u_per_day` + `fuel_as_of`, montant dans `ships.fuel`) ;
  hovering ET idle consomment 0.2/0.4/0.8 u/j (S/M/L [TUNE], GB §7
  « both consume ») ; exemptions canon : personal (GB §21), probe,
  docked/warehoused/colonizing/stranded/derelict. Survol de SON monde :
  le stock planétaire paie (« resupply round-trips » — besoin injecté
  dans computeRates après la survie de la population, tout-ou-rien par
  ressource [TUNE-v1]) ; monde à sec, monde d'autrui, sauvage ou vide :
  le réservoir paie, bord `ship_fuel_out` (purge + replanification,
  patron stock_edge) → statut `stranded`, réservoir figé à 0, aucun
  départ. Récupération : POST /ships/:id/refuel (monde POSSÉDÉ sous la
  coque — à quai, en survol ou échoué ; cap réservoir) et
  /ships/:id/transfer-fuel (entre VOS coques, ≤ 1 pc [TUNE-GAP], même
  type [TUNE-v1], instantané [TUNE-v1], verrous par id croissant).
  L'auto-chargement au départ passe au PLEIN réservoir [TUNE-v1 — charger
  le trajet exact échouerait la coque au premier survol] et rebase le
  monde quitté (correctif : le rebase manquait après l'auto-chargement).
  Découverte d'architecture consignée : TIME_SCALE n'accélère QUE les
  événements — la dérive lazy court en jours réels (l'E2E échoue la coque
  par l'instrumentation /test/ship-fuel, 1e-6 u → bord en ~0,4 s). UI :
  jauge de réservoir + taux, chip danger « Stranded — out of fuel »,
  boutons Refuel et Transfer fuel (cible + unités). Correctif de test au
  passage : `IN (...)` sans ORDER BY dans ships.test.ts (ordre de heap
  non garanti). 15 unit shared + 12 intégration (refus directs §10) +
  E2E strand→sauvetage→plein ×2, suites complètes vertes (75/27/105/14),
  captures hov-01..04 observées.
- **Colonisation v1 : la deuxième planète (chunk N)** : migration 007
  (`ships.settlers/settlers_origin_body_id/colony_kit`, statut
  `colonizing`, table `settler_routes` — accumulateur fractionnaire par
  route). Fitting colonie (Civil M/L, programme `colony_program`
  déverrouillé + workshop L2 actif ; coût = fitting + terraform core +
  PROVISIONS 30 nourriture + 30 eau [TUNE interp — le stock d'amorçage ne
  tient pas dans les 2 conteneurs d'un Civil M, JOURNAL]) ; embarquement
  de settlers (spaceport actif requis, caps pax 200/800/3000, garde 60 %
  de workforce restante, une seule origine par cargaison) ; péage de
  trajet DÉTERMINISTE (base 5 % − réductions des pilotes liés,
  accumulateur par route « no free sub-20 cohorts », quantifié 1e-9
  contre la poussière IEEE) ; colonisation (survol d'un monde sauvage
  non-poison, ≥ 200 settlers, anti-course, événement 72 h) ;
  établissement : propriété, population = settlers livrés, coque
  convertie en depot L1 + spaceport L1 (tuiles 0/1), provisions +
  carburant déchargés, PNJ liés au monde, « the ship is spent » ; grâce
  de colonie 14 j (badge UI + API — l'enforcement arrive avec la
  conquête). Équipage : assignation d'un pilote PNJ (permanente, GB §12).
  Au passage : le réservoir d'une coque neuve naît TYPÉ sur l'étoile
  natale (l'auto-chargement partait sur `cold` à tort) ; le rail apprend
  la nouvelle colonie quand la coque « colonizing » disparaît
  (refreshMe). UI : section Settlers du panneau vaisseau (embark/
  disembark, kit, pilote, Colonize, compte à rebours), section Programs
  (vue planète), badge de grâce. 7 unit + 9 intégration (péage exact,
  établissement complet, refus directs) + E2E parcours complet ×2
  (péage vérifié à l'unité près via le roll réel du pilote), captures
  col-01..05 observées.
- **Chantier naval (chunk M)** : construction de coques (GB §14, DG §381)
  — L1 construit S+M, L2 = M en masse (−25 %), L3 construit L (gate
  serveur) ; coût payé au lancement, événement ship_built → le vaisseau
  naît À QUAI, réservoirs et soute vides ; propriété à l'achèvement = le
  propriétaire ACTUEL du monde (une conquête capture les chantiers) ;
  temps S/M/L = 12/24/72 h [TUNE-GAP proposé] ; MIN_CREW différé (annoncé,
  lifecycle NPC) ; UI : section « lay a keel » + file d'attente dans le
  panneau du chantier. Instrumentation §15 : endpoint /test/grant activé
  par ATG_TEST_ENDPOINTS=1 (E2E uniquement, jamais en production).
  3 unit + 6 intégration + E2E ×2 chemins, captures 36–38 observées.
- **Hospitalité du monde marchand (chunk L)** : migration 006
  (`bodies.config` + journal `trades` sans bâtiment) ; sous gouvernance
  TOUTE mercantile (re-vérifiée à chaque achat), survie + carburant se
  vendent SANS bâtiment de marché — périmètre exhaustif (eau, oxygène,
  3 nourritures, 3 carburants), plancher keep-for-self jamais entamé,
  hospitalité accessible EN SURVOL (pas de droit d'atterrissage requis
  [TUNE-v1 interp]) ; seed : le voisin mercantile publie son offre via la
  vraie commande (contrat §8). UI : section Hospitality (vue planète) +
  achat dans le panneau vaisseau sur place. 3 unit + 7 intégration + E2E,
  captures 33–35 observées.
- **Marché L1 à taux fixe (chunk K)** : migration `trades` (journal des
  échanges) ; slots = niveau du marché (canon GB §9, vérifié serveur),
  slot directionnel — le marché ACHÈTE `give` et paie en `get` au taux
  posté (le taux est le prix, aucun frais séparé en taux fixe [TUNE-v1]),
  re-tarification ≤ 1/min (DG §11.1), limites quotidienne/absolue
  vérifiées contre le journal, whitelist (propriétaire exempt),
  consultation des offres à quai seulement ; physicalité complète : soute
  à quai ↔ stock planétaire, cap de stockage et conteneurs vérifiés des
  deux côtés, rebase après échange ; UI : formulaire « Trade slot » dans
  le panneau du marché, offres + échange dans le panneau vaisseau à quai.
  Correctif de déterminisme au passage : ordre TOTAL de la flotte
  (personal/cargo/civil/combat puis created_at, id) — created_at seul
  flippait l'éventail des marqueurs après un UPDATE de ligne. 6 unit +
  12 intégration + E2E boucle complète, captures 30–32 observées.
- **Atterrissage & fret (chunk J)** : migration `ships.hover_body_id` +
  `buildings.config` ; le survol garde le corps sous la coque et atterrir
  devient un acte EXPLICITE (GB §9) — mondes possédés toujours accueillants
  [TUNE-v1], monde étranger = spaceport actif avec politique `everyone`
  (v1 self|everyone, réglée par la commande de réglages du bâtiment,
  friends/neighbours avec les factions), monde sauvage et sondes refusés ;
  fret à quai sur monde possédé : 1 conteneur = 1 T d'un fongible, tonnes
  partielles monopolisent leur conteneur (DG §7 exact), stock vérifié,
  cap de stockage refusé explicitement, rebase des bords de frein après
  transfert ; UI : soute du vaisseau (manifeste + conteneurs), boutons
  Land/Undock, formulaire load/unload, politique d'atterrissage dans le
  panneau spaceport. AUCUNE limite de docks en v1 (annoncé — comptes par
  niveau au backlog). 7 unit + 9 intégration + E2E boucle complète,
  captures 26–29 observées.
- **La Silence se brise : ping, ping-back & canaux (chunk I)** : migration
  `pings`/`channels`/`messages` (canal canonique par couple : paire triée +
  contrainte SQL unique) ; sendPing (cible = monde POSSÉDÉ visible dans le
  ciel de l'émetteur — vérifié serveur via visibleBodies, quota 20/j
  [TUNE], 1 hail en attente par couple), pingBack (seul le destinataire ;
  ouvre ou retrouve LE canal), messages 1↔1 avec membership vérifiée
  (refus d'un tiers testés par requêtes directes) ; écran Comms (hails
  entrants avec Ping back accent, canaux, chat pollé 3 s, formulaire),
  bouton Ping sur un monde étranger de la carte galaxie ; l'infrastructure
  sans tuile (télescope, probe pad) se construit désormais via l'UI
  (construction directe, panneau « Infrastructure » dans la vue planète —
  le flux tuile la rejetait) ; correctif de déterminisme du test market L2
  (l'ADN du starter roulait market absent/plafonné dans ~20 % des univers
  → seed pur dédié, patron « Capworld »). 5 unit + 5 intégration + E2E
  bi-navigateur (télescope → ping → ping-back → échange), captures 19–25
  observées.
- **Vol libre & sondes (chunk H)** : migration missions (segment, statut
  idle), moveShip (position interpolée pure, pré-brûlage v1 documenté,
  auto-chargement du réservoir sur monde possédé, personnel = mondes
  possédés seulement — refus canon testé), sondes (pad actif, cap 5/j/pad,
  vision 60 pc à l'arrivée : la sonde LÈVE LA SILENCE, testé sur le starter
  du voisin), vision = union planètes+télescopes+sondes+vaisseaux ; UI
  carte : marqueurs de flotte en éventail, lignes de transit pointillées,
  envoi au clic (ETA + fuel), lancement de sonde. 45 intégration + 7 E2E.

- **Renderer : animations + passe de lumière v1 (chunk G)** : sprites GIF
  animés (pixi.js/gif, cache d'ArrayBuffer, une source par sprite — la
  cascade destroy ne corrompt plus les reconstructions) ; extraction des
  sources émissives des light maps (binning ≤ 3), halos ADDITIFS qui
  débordent sur tuiles et sprites voisins (propagation ASSET_PIPELINE §3),
  filtre WebGL de relief bump (normale par gradient, 4 sources locales +
  ambiante + lumière clé) ; correctif de précision GLSL (highp) trouvé en
  interceptant le link WebGL. Décision P0.4 renderer VALIDÉE → [x].
- **Niveaux, démolition & page stats (chunk F)** : montée de niveau en
  place (coût du palier, plafond de profondeur de l'ADN du seed, politique
  de niveau par intersection — market L2 refusé à un industrialiste,
  production coupée pendant le chantier, re-staffing requis à L2) ;
  démolition avec remboursement 50 % crédité au lancement (confirmation en
  deux temps), tuile et gisement libérés à l'issue — un extracteur en
  démolition ne réserve plus son gisement (décision documentée) ; page
  stats planète canon §10 (chaque unité : u, E, débit, facteur limitant +
  lignes planète/stockage). 39 tests d'intégration, 6 E2E, captures
  observées.
- **Boucle colonie vivante (chunk E)** : cœur de production pur et
  déterministe (extraction ×E×runPct×frein, recettes, point fixe de
  partage des intrants à sec, minage de trace exempt, consommation de
  survie par familles) ; rebase aux événements de bord (stock_edge aux
  seuils 0.7/0.85/1.0 du frein, deposit_dry DÉFINITIF, pop_daily
  quotidien : H, maladie, croissance logistique) ; recette obligatoire à
  la pose (canon « une industrie mint une chose »), max 1 extracteur par
  gisement, workforce ≤ 60 % pop, réglages workforce/cadence par bâtiment ;
  UI : choix de recette, débits +/− par ressource, date de tarissement
  projetée, panneau bâtiment (facteur limitant, courbe, réglages) ;
  rattrapage hors-ligne prouvé (zéro dérive). TIME_SCALE documenté
  (instrumentation dev/test).
- **Tranche verticale jouable (chunk D)** : API de jeu (register/login/
  logout avec sessions httpOnly hachées, /me, /galaxy avec brouillard par
  scope, /planets/:id lazy-évalué réservé au propriétaire, unlock/build
  transactionnels avec coûts, masque de gouvernance, tuiles, événement de
  chantier) ; client complet (écran d'éveil, HUD groovy-dark, carte galaxie
  three.js pan/zoom + sprites + brouillard, vue planète isométrique PixiJS
  + overlays climat + chantiers, main EXHAUSTIVE des 28 cartes avec chips
  de coûts et raisons de blocage, courbe d'efficacité signature) ;
  correction « départ sain » (pop initiale = 0,6 × popCap, le 1 200 du
  guide = cas small-F) ; autorisations vérifiées par requêtes directes.
- **Génération d'univers + spawn starter (chunk C)** : rolls déterministes
  DG §2.1 (planète, starter, étoile avec stock caché + R_nova, gisements,
  noms), poche de Fermi DG §2.2 avec toutes ses garanties (étoile S à
  40 pc, 2 planètes sauvages ≤ 60 pc, voisin 150–240 pc, starter tempéré
  D–F ≥ 10 tuiles, gisements garantis, stock ×U(1.0–1.3), 150 u de fuel
  assorti, pop 1 200, vaisseau personnel + Cargo-S, pilote commun avec roll
  individuel, bind compte 45 j) ; inscription registerPlayer (scrypt natif,
  transaction unique) ; seed de dev = vrai flux applicatif, 2 comptes démo,
  idempotent ; base de test dédiée atg_test (plus de contamination du seed).
- **Noyau de simulation (chunk B)** : schéma baseline PostgreSQL
  (001_baseline.sql — joueurs/sessions, corps, gisements, stock lazy,
  bâtiments, unlocks, NPC, vaisseaux, file d'événements) + docs/SCHEMA.md +
  PROD_MIGRATIONS.md ; évaluation paresseuse (value, rate, t0) ; file
  d'événements SKIP LOCKED idempotente (concurrence testée) ; worker qui
  traite les échéances ; RNG seedé de génération (SeededStream, flux par
  label).
- **Catalogue de contenu COMPLET dans @atg/shared** (règle de complétude) :
  30 ressources, 28 bâtiments (coûts/niveaux/politiques/effets), 6 unités
  sol + cartes, 9 coques + personnel + sonde, 16 recettes + 9 items dérivés,
  arbre tech 35 nœuds (DAG, masque de seed, masques de gouvernance) ;
  formules E(u)/frein §3.3b/population/maladie ; écarts non chiffrés par le
  guide listés visiblement (TUNE_GAPS / TECH_TUNE_GAPS).
- Vérifié : 34 tests shared + 8 unit / 7 intégration serveur (vraie base).

- Décisions P0.4 tranchées et documentées (JOURNAL session 30, DAT §2) :
  tick worker en **TypeScript (Node 22)** ; renderer isométrique **PixiJS v8**
  (validation micro-prototype de la passe de lumière à venir).
- Scaffolding du monorepo `game/` (pnpm workspaces : `@atg/shared`,
  `@atg/server`, `@atg/client`, `@atg/e2e`) : Fastify (`/health`, `/ready`),
  migrateur SQL transactionnel (`schema_migrations`), squelette du tick
  worker, client React+Vite avec tokens « groovy dark » et états
  chargement/succès/erreur, E2E Playwright avec captures JPEG observées.
- Environnement de dev conteneurisé : `docker-compose.dev.yml` (Postgres 16,
  image surchargeable `ATG_DB_IMAGE`), scripts `runDev`/`stopDev`/`resetDb`,
  variables documentées dans `game/.env.example`.
- Vérifié : builds 3 paquets, tests unitaires 2/2, intégration (vraie base)
  2/2, E2E 2/2, captures observées conformes au design system.

### Préproduction 2026 — refonte de la conception

- Enregistrement de `CLAUDE.md` (conventions de travail + spécificités projet).
- Mise en conformité documentaire : `README.md`, `CHANGELOG.md`, `docs/DAT.md`,
  `docs/BACKLOG.md`, `docs/DESIGN_SYSTEM.md`.
- Corpus de conception complet : `GAME_BOOK.md` (canon des règles),
  `GAME_BIBLE.md` (lore), `DESIGN_GUIDE.md` v0.3 (spécification mécanique
  chiffrée), `BALANCE_LOG.md` (boucle d'équilibrage par simulation, 3 tours,
  55 correctifs), `JOURNAL.md` (journal des décisions).
- Design system FINALISÉ v1 (« groovy dark », identité pixel-sprite) validé
  par 4 prototypes d'interface générés (gpt-image-2) et observés
  visuellement ; prototypes archivés dans `docs/design/prototypes/`.
- Pipeline d'assets spécifié (`docs/ASSET_PIPELINE.md`) : tailles canoniques,
  calques transparents universels, bump/light maps avec propagation lumineuse,
  contrat de nommage/swap ; 255 stubs générés + prop sheet HTML vérifié ;
  itération HTML→gpt-image-2 validée (prototypes 05–06). Desktop/tablette
  uniquement.
- Décisions responsable : unités sol **512×256** (posées comme des bâtiments) ;
  props hors cartes en **GIF animés** avec companions bump/light synchronisés
  (stubs régénérés : 1 602 GIF + 126 PNG) ; **règle de complétude** inscrite
  dans CLAUDE.md ; tour d'équilibrage 4 lancé sur le catalogue complet.
- Tour 7 CLOS (guide v0.8) : topologie de marche viable ; etoile-cellules
  = fait de design ; anti-DoS docks ; rate-limit offres ; census global seul.
- Tour 6 CLOS (guide v0.7) : planchers fongibles derives par simulation
  (franchise S 800/M 1000/L 1200 T, frein unilateral, reserves AMM comptees),
  docks par niveau, regle d'impound, doctrine anti-raid par gate ; M9-M10.
- WAREHOUSE (spec responsable) : entrepot vehicules+items en balances
  separees, parking allie, docks = debit de commerce, equipage liberable en
  warehouse (amendement paragraphe 12), freeze NFT en warehouse uniquement,
  usines bloquees si plein -> GAMEBOOK + DESIGN_GUIDE v0.6 + stub batiment ;
  tour 6 lance (dont etude des planchers fongibles par simulation).
- Tour 5b de CONFIRMATION passé : v0.5.1 (escrow rendu avant pillage,
  verrou de siège = combat actif seul, hors-ligne ≠ garnison) ; tour 5 CLOS.
- Tour 5 TERMINÉ : la clef de voûte « construire ≠ installer » tient ;
  production d'unités spécifiée (military_district), verrou de siège,
  pillage des items, upkeep suiveur → DESIGN_GUIDE v0.5 ; moniteur M8.
- Correction canon du responsable : **construire ≠ installer** (clef de voûte
  de l'économie) — unités sol et objets = items portables produits là où la
  politique le permet, installés n'importe où ; patch « turret_light
  apolitique » annulé ; GAMEBOOK §9 amendé ; tour 5 de vérification lancé.
- Tour d'équilibrage 4 TERMINÉ (économie + militaire du catalogue) : 15
  constats, 15 correctifs → DESIGN_GUIDE v0.4 ; règle boucliers↔climat
  tranchée ; coûts T2+ complets ; moniteurs M6–M7.
- Catalogue de contenu COMPLET : 27 bâtiments avec effets par niveau
  (DESIGN_GUIDE §5.1), 6 types d'unités sol (§10.1), upgrades par coque selon
  les règles de slots ; 576 stubs (×3) couvrant tout + galerie auto-générée ;
  canon « tout peuple, tout rôle » ; tour d'équilibrage 4 planifié (valeurs
  catalogue non simulées, note d'honnêteté au BALANCE_LOG).
- Abandon acté de l'approche « moteur de jeu on-chain » au profit d'une
  architecture PostgreSQL autoritaire avec pont NFT opt-in (documenté, aucun
  code applicatif écrit).

## [Publié]

### Déployé en production, historique (avant 2026)

- Site vitrine Jekyll (whitepaper, pages economics/mechanics) déployé via
  `gh-pages`. Contenu antérieur à la refonte de conception 2026 ; réconciliation
  prévue au backlog (P0).
