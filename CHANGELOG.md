# CHANGELOG

## [Non publié]

### Implémentation P1 (démarrée 2026-07-12 sur GO du responsable)

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
- Corpus de conception complet : `GAMEBOOK.md` (canon des règles),
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
