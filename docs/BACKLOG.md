# BACKLOG — ATG / Across The Galaxies

> Statuses (CLAUDE.md §5): `[ ]` not started · `[~]` in progress or
> insufficiently verified · `[x]` done **and fully verified** (Definition of
> Done, CLAUDE.md §17).
>
> **Functional reference rule (owner directive):** every implementation unit
> cites its canon sections — `GB §x` = GAMEBOOK.md, `DG §y` = DESIGN_GUIDE.md
> (v0.9.2). **The unit's Definition of Done INCLUDES verifying the delivered
> behavior against the cited sections** (rules conformity review + the §15
> tests + §16 visual checks). An item with no reference may not start.
>
> Every implementation unit requires its own unit test + E2E test, plus an
> API/integration test when it touches API/DB/services/authz (CLAUDE.md §15).
> **P1+ must not start without explicit owner instruction — preproduction.**

---

## P0 — Préproduction (current phase)

### P0.1 Design canon
- [x] GAMEBOOK.md — reconciled rule canon (27 sections; conflicts resolved)
- [x] JOURNAL.md — decision log, rebuildable history (10 sessions)
- [x] Archaeology sweeps — all branches of all 3 repos + 2021/2022 artist briefs salvaged
- [x] GAME_BIBLE.md — lore canon (the Silence, three peoples, places, substances, tone)
- [x] DESIGN_GUIDE.md — full mechanical spec, formulae, `[TUNE]` convention (now v0.9.2 after 8 balance rounds)
- [x] Balance loop — 3 rounds, 7 simulated campaigns, 55 patches, verdict SATISFACTORY (BALANCE_LOG.md)

### P0.2 Standards & repository compliance (CLAUDE.md)
- [x] Register CLAUDE.md + « Spécificités du projet » local block
- [~] Reconcile repo to standards — README/CHANGELOG/DAT/BACKLOG written; verification pending owner review
- [ ] Reconcile legacy Jekyll site content with 2026 canon (whitepaper & economics pages contradict current design)

### P0.3 Art direction & design system
- [x] UI prototypes via OpenAI Images `gpt-image-2` (galaxy map · iso colony + card hand · market · governance) — `docs/design/prototypes/01–04`
- [x] Visual review of prototypes (vision pass vs tokens; findings & 4 canon corrections logged in DESIGN_SYSTEM §11)
- [x] docs/DESIGN_SYSTEM.md — **FINAL v1**: groovy-dark, darkened P2Enjoy palette, pixel-sprite identity adopted, prototype-validated
- [x] docs/ASSET_PIPELINE.md — sizes canon (planets 128/256/512, stars 2048, buildings & ships 512×256, portraits 512×1024, cards 512²+HTML), universal overlay-layer mechanic, bump+light companion maps, light-propagation engine requirement, naming/swap contract, desktop/tablet only
- [x] Stub set generated (85 assets ×3 files, labeled, `generate_stubs.py`) + manifest.json
- [x] HTML prop sheet (`docs/design/props/index.html`) — exact-size DOM contract, overlay toggles, light demo; captured headless & visually verified
- [x] HTML-fed gpt-image-2 iteration validated (prototypes 05 card, 06 layered-lighting north-star)
- [x] FULL stub catalog (576 assets ×3 = 1 728 files): 27 buildings ×3 lvl ×climat, per-hull ship upgrade sets (slot rules), 15 ground units, 18 portraits (full peoples×roles matrix), 42 cards, 30 resources, weather on every climate×size + auto-generated gallery.html
- [~] Sprite/asset production plan — manifest + specs done; artist schedule & 2022-PSD reuse audit remaining
- [x] Ground-unit sprite size settled by owner: **512×256, placed like buildings**
- [x] Formats settled by owner: **non-card props = animated GIF** (frame-synced bump/light companions); card art = PNG — pipeline + stubs regenerated (1 602 GIF + 126 PNG)

### P0.4 Remaining design opens (GAMEBOOK §27)
- [x] Decide tick-worker language (TS vs Python) with documented trade-off → DAT — **TypeScript (Node 22)**, JOURNAL session 30, DAT §2
- [x] Decide isometric renderer (Pixi vs canvas) via micro-prototype → DAT — **PixiJS v8 VALIDÉ par le micro-prototype sur la vraie vue planète** (JOURNAL session 30) : GIF animés (pixi.js/gif), halos additifs de propagation depuis les light maps, filtre WebGL de relief bump — captures + vidéo observées
- [x] Climate ↔ ship shields rule — SETTLED round 4 (usure déterministe sans bouclier ; temperate toujours sûr ; bâtiments exempts)
- [ ] Full landing-permission option list (self/friends/neighbours grief cases)
- [ ] Fuel-type travel effects table (cold/hot/gas beyond the tuning matrix)
- [ ] Black-hole mechanics detail (pure sink vs star-like behaviours)
- [ ] Supernova vs owned/purchased planets — mitigation decision
- [ ] Anti-stagnation levers beyond depletion (new regions, discovery cycles)
- [ ] Route/stargate decay edge cases beyond destination-death
- [ ] Artificial-planet open sub-items (pop/quality caps confirmation, movement cost tuning)
- [x] **Balance Round 5 + 5b — build≠install** : CONFIRMÉ (guide v0.5.1) — production d'unités (military_district + 6 cartes), verrou de siège (événement de combat actif seulement), pillage incluant items entreposés + escrow rendu avant pillage, upkeep suiveur (hors-ligne ≠ garnison), unités mintables ; import défense 7 j/13,7 j vs grâce 14 j ; moniteurs M1–M8
- [x] **Balance Round 4 — content breadth**: 2 campaigns (économie + militaire), 15 constats, tous patchés → DESIGN_GUIDE v0.4 (fees en bp, cap remises −50%, coûts T2+ complets, matrice de ciblage unités, slots de garnison pondérés, HP bâtiments ×10, turret_light apolitique, règle boucliers climat) ; moniteurs M6–M7 ajoutés
- [x] **Balance Round 6 — warehouse & planchers fongibles** : CLOS (guide v0.7) — franchise de base S 800/M 1000/L 1200 T (obligatoire : starter sur-plafond au spawn sinon), frein unilatéral (jamais punir le stock bas), docks 2S/+2M/+2L, impound trahison d'allié, ventes avec équipage auto-libéré, doctrine anti-raid par gate ; moniteurs M9–M10 ; slot L au tampon : TRANCHÉ session 22 (aucun L gratuit — la production lourde exige un warehouse)
- [x] **Balance Round 7 — topologie de marché & canal manuel** : VIABLE (guide v0.8) — étoile-cellules physiquement obligatoire, triade d'hospitalité, anti-DoS docks (dwell 24 h + browse orbital allié), rate-limit d'offres, census global uniquement
- [x] Postgres schema draft (docs/SCHEMA.md) derived from DESIGN_GUIDE — écrit ET appliqué (001_baseline.sql, vérifié par tests d'intégration sur vraie base)
- [ ] MVP specification (docs/MVP.md) — the solo-planet vertical slice, acceptance criteria

## P1 — Fondations techniques (**GO responsable donné le 2026-07-12** — JOURNAL session 30)

- [~] Monorepo/app scaffolding + containerized dev env (Compose: Postgres, API, worker, client; runDev/runStaging/runProd) → GB §1; DAT §2/§6 — dev opérationnel et vérifié (build + unit + intégration + E2E + captures observées) ; **reste : Compose staging/prod** (avec le premier déploiement)
- [~] Migrations framework + baseline schema from docs/SCHEMA.md + PROD_MIGRATIONS.md → GB §1; DAT §3 — runner transactionnel + 001_baseline appliqué + PROD_MIGRATIONS créé ; tests intégration OK ; preuve E2E complète au premier parcours P2
- [~] Deterministic sim core: tick 60 s, event queue, lazy (value, rate, t0) evaluation, seeded-hash generation-RNG, offline catch-up → GB §15; DG §1 — file d'événements (SKIP LOCKED, idempotence, concurrence testée), evalLazy/whenReaches/rebase, SeededStream (34 tests shared + 15 server) ; rattrapage hors-ligne prouvé en intégration (zéro dérive) ; reste la preuve E2E de bout en bout (P2)
- [ ] Spatial index (grid hash) + segment-circle interception solver → GB §2/§6; DG §9.2
- [ ] Policy/instruction engine core (declarative rulesets + evaluator; manual-first override; stackable conditions; predefined strategy library) → GB §15; DG §9.2/§3.5
- [~] Auth + account lifecycle (starter spawn, account-bind 45 d, new-account combat shield + voids, receive-cap) → GB §19; DG §2.2/§18 — registerPlayer + spawn + bind 45 j + sessions/login/logout API (cookie httpOnly, hash de jeton) FAITS et testés (intégration + E2E) ; restent : bouclier combat 14 j + voids, receive-cap (avec le combat P5)
- [~] Seed contract: starter-system generator = reproducible dev seed demonstrating every P2 feature → GB §19; DG §2.2; CLAUDE.md §8 — seed = vrai flux registerPlayer, 2 comptes démo (voisin garanti 150–240 pc vérifié : 159,6 pc), idempotent ; la couverture « every P2 feature » suivra les livraisons P2
- [ ] Observability baseline (structured logs, health/readiness, correlation ids; no secrets) → CLAUDE.md §20
- [ ] CI: unit + integration + Playwright E2E + visual-capture harness → CLAUDE.md §15/§16

## P2 — MVP « one planet, solo » (chaque unité = mécanique GAMEBOOK)

- [~] Universe gen: bodies, seeds-as-DNA, planet rolls (size/climate/quality/tiles), star rolls (type, hidden stock, R_nova) → GB §2/§3/§22; DG §2.1 — rolls déterministes (planète/starter/étoile/gisements/noms) implémentés + testés ; restent : ceintures denses hors poches (P3 carte), poids étoile S/M/L à équilibrer
- [~] Starter spawn: Fermi pocket, guarantees (star ≤40 pc, 2 uninhabited ≤60 pc, neighbor 150–240 pc), starter planet (≥10 tiles, deposits garanties, stock, pop 1200, fuel 150 u, pilot, Cargo-S), supernova-safe → GB §19/§22; DG §2.2 — toutes les garanties implémentées et testées en intégration ; restent : E2E visuel (chunk D) + cas « univers saturé »
- [~] Isometric planet view: tile grid, climate variants, GIF sprites + overlays, bump/light WebGL pass, light propagation → GB §17/§26; ASSET_PIPELINE §2–3 — grille iso, sprites GIF ANIMÉS, overlays climat, passe de lumière v1 (halos additifs = propagation aux tuiles/sprites voisins ; filtre WebGL bump + 4 sources locales + ambiante) LIVRÉS et observés ; restent : réglage fin sur art réel (les stubs ont des bump plats), lumières inter-sprites au-delà des halos
- [x] Card hand UI: construction cards, unlock/place phases, demolish 50 %, costs chips → GB §9/§18; DG §5/§6 — main EXHAUSTIVE (28 cartes), phases unlock/place, chips de coûts, états avec raison, démolition 50 % (confirmation 2 temps, remboursement crédité, tuile/gisement libérés) — unit+intégration+E2E+captures observées
- [~] Tech tree runtime: global DAG, seed mask (tiers %), never-gated set (telescope/probe/depot/mine/colony), unlock = permanent knowledge, production needs live infra → GB §18; DG §5 — DAG 35 nœuds + masque de seed + jamais-masqués + unlock permanent + masques de gouvernance testés (unit + API + E2E) ; reste : « production needs live infra » (industrie, chunk E)
- [~] Building catalog complet (28) avec effets par niveau + coûts + 1 tuile + adaptations climat → GB §9/§25; DG §5.1 — catalogue data complet, montée de niveau en place (coûts par palier, plafond ADN du seed, politique de niveau par intersection, production coupée pendant chantier), overlays climat ; restent : effets non-industriels branchés à leurs systèmes (docks P4, scope P3, garnison P5…)
- [~] Industry: one-recipe queues, throughput ladder, retool 24 h, refinery→cells, fuelcell_plant line, max 1 extracteur/gisement → GB §9; DG §6/§3.3 — recette unique choisie à la pose, débits par niveau, max 1 extracteur/gisement, recettes cellules (nox ×4), point fixe des intrants — testés unit+intégration+E2E ; restent : retool 24 h, montée de niveau des bâtiments
- [x] Mining + trace mining, deposit depletion + projected-dry-date UI → GB §3; DG §3.3 — extraction ×E×runPct×frein, trace 2 T/j exempte d'efficacité, tarissement DÉFINITIF par événement, date projetée affichée — unit+intégration+E2E+captures observées (niveaux L2/L3 relèvent de l'item montée de niveau)
- [~] Fungible storage: base allowance S/M/L, depot ladder + level costs, one-sided brake, halt at cap, overfill-on-delivery, fuel shares cap → GB §9; DG §3.3b — franchise S/M/L, frein unilatéral (constantes par morceaux, seuils 0.7/0.85/1.0), halt au cap, fuel dans le cap — testés ; restent : niveaux de dépôt (montée de niveau), overfill-on-delivery (aucun flux de livraison encore)
- [~] Population sim: logistic growth, H (food/water gate, med boost), illness index, crowding → GB §10; DG §3.2 — matérialisation quotidienne (pop_daily) : croissance logistique, H (porte vivres/eau, boost médecine), maladie, consommation par familles — testée en intégration (nourri +24/j vs famine) ; E2E impossible à échelle réelle (1 jour = 1 jour), preuve d'intégration documentée
- [~] Efficiency engine: asymmetric bell E(u), per-domain/per-resource u, E_planet, G, runPct; curve UI + live dot + limiting factor + planet stats page → GB §10; DG §3.4 — E(u) par unité (workforce) et par planète, runPct, courbe + point vivant + facteur limitant explicites — testés/vérifiés visuellement ; reste : G (gouvernance v1) — la page stats agrégée est LIVRÉE (unités + planète + stockage, u/E/facteur limitant, E2E + captures)
- [ ] Governance v1: masks (intersection), preview screen (obligatoire), personal-ship temp governor, small/medium/large requirements, half-efficiency rule → GB §11/§21; DG §4.1
- [ ] Warehouse: balances S/M/L véhicules + items, zéro conso, tampon libre 2M/2S/10, blocage d'usine, public/privé, entrées/sorties manuelles du privé → GB §9; DG §6
- [ ] Depot/warehouse/NFT states machine (installed/warehoused/cargo/escrow/NFT-locked/packing) → GB §9/§16; DG §7/§14
- [ ] Offline catch-up correctness E2E (log off / return, zero drift) → GB §15; DG §1

## P3 — Galaxie & mouvement

- [~] Galaxy map three.js: star field 3D-style, 2D nav, fog-of-war, pixel-sprite bodies → GB §2/§17/§26 — v1 livrée (pan/zoom, sprites stubs, brouillard serveur, panneau de sélection, labels) et vérifiée E2E ; restent : intel télescopes (tiers), ceintures denses, routes
- [~] Telescopes: scope +200/level max 3, intel tiers L1/L2/L3 (heading/destination/manifest + junk & harvest attribution) → GB §4/§20; DG §9.2 — scope +200/niveau (union des cercles, max 3 instances) actif dans la vision ; restent : paliers d'intel L1–L3
- [~] Probes: solar sail 10 pc/day, crewless, scanning, build cap → GB §4/§14; DG §8.1 — construction (probe_pad actif, coût, cap 5/j/pad), voile 10 pc/j, vision 60 pc à l'arrivée (lève la Silence — testé), UI de lancement ; restent : scan riche (DNA/gisements, intel scientifique)
- [~] Free flight: segments, speedEff/burnEff (weight), fuel×engine matrix, derived range UI, course changes → GB §6/§14; DG §8.2–8.4/§9.1 — segments avec position interpolée pure, arrivée par événement, carburant pré-brûlé au départ [TUNE-v1 documenté], auto-chargement sur monde possédé, UI carte (marqueurs éventail, lignes de transit, envoi au clic, ETA/fuel) ; restent : matrice fuel×moteur (1.0 v1), poids/loadFrac, changements de cap, cercles de portée UI, horloges de mort
- [~] Death clocks: fuel-out=stranded (recoverable), survival-out=ownership strip; salvage claims (claim rig 2 h) → GB §6; DG §8.8/§10.3 — **livré partiellement (chunk O)** : fuel-out = `stranded` (récupérable — refuel/transfert), réservoir figé à 0, aucun départ possible ; le drain ne court qu'en LOITERING (hovering/idle) — pas d'horloge en transit (pré-brûlage v1 conservé, annoncé). **Restent** : survival-out (aucun équipage embarqué en base — chunk NPC), strip de propriété/derelict, salvage claims
- [~] Hovering: own-planet drain vs ship-stock drain, auto-trade policy bounds (3× census), survival alarm + auto-flee → GB §7; DG §3.5 — **livré (chunk O, cœur)** : migration 008 (réservoir PARESSEUX : amount jsonb + fuel_rate_u_per_day/fuel_as_of, index ships_hover), drain 0.2/0.4/0.8 u·j⁻¹ (S/M/L [TUNE]), exemptions canon (personal GB §21, probe, docked/warehoused/colonizing/stranded/derelict) ; survol de SON monde = le stock planétaire paie (hoverFuelNeeds dans computeRates, servi après la survie de la population, tout-ou-rien par ressource [TUNE-v1]) ; monde à sec / étranger / sauvage / idle = le réservoir paie, bord `ship_fuel_out` (purge+replanification, patron stock_edge) → `stranded` ; récupération : POST /ships/:id/refuel (monde POSSÉDÉ, docked/hovering/stranded, cap réservoir) et /ships/:id/transfer-fuel (VOS coques, ≤ 1 pc [TUNE-GAP], même type [TUNE-v1], instantané [TUNE-v1]) ; auto-chargement au départ = PLEIN réservoir [TUNE-v1 justifié : charger le trajet exact échouerait la coque au premier survol] + rebase du monde au départ (correctif) ; réservoir des vues évalué à la lecture (fuel/tankU/taux). UI : jauge + taux, chip danger « Stranded », boutons Refuel/Transfer. Tests : 15 unit shared + 12 intégration (refus directs §10) + E2E strand→sauvetage→plein ×2. **Restent** : auto-trade bounds (3× census — census requis), survival alarm + auto-flee (équipages), drain de survie (constante exportée, INERTE : 0 équipage [TUNE-GAP])
- [ ] Stars: harvest gradient (d_safe/d_max), hidden stock, flare <5 %, supernova event + annihilation radius, L-star→black hole → GB §22; DG §2.1/§8.8
- [ ] Black holes: junk sink zéro conséquence → GB §22
- [ ] Space junk: creation (kills/dumps), hazard fields, decay 10 %/day, dump limits, attribution L3, no-dump zone starters, collection 30 T/day → GB §22; DG §10.4
- [ ] Climate shields: hull wear 5 %/day sans bouclier (hot/cold/poison-harvest/black-hole/flare zones), temperate exempt, bâtiments exempts → GB §27(settled); DG §8.8
- [~] Ship fitting: 9 hulls + personal + probe, slots par coque, upgrades ×2 niveaux, accessoires, overlays visuels composités → GB §14; DG §8.1–8.2; ASSET_PIPELINE §2 — **livré (chunk M, construction navale)** : chantier naval L1 = coques S+M, L2 = M à −25 % (remise vérifiée), L3 = coques L (gate serveur), coût payé au lancement, événement ship_built → vaisseau À QUAI réservoirs/soute vides, propriété = propriétaire ACTUEL du monde à l'achèvement (une conquête capture le chantier — GB §9), file d'attente visible ; temps de chantier S/M/L = 12/24/72 h [TUNE-GAP proposé] ; UI : section « lay a keel » dans le panneau du chantier. Tests : 3 unit + 6 intégration + E2E complet (endpoint de test /test/grant, §15, ATG_TEST_ENDPOINTS=1 jamais en prod). **Restent** : slots/upgrades/accessoires + overlays composités, MIN_CREW (avec le lifecycle NPC), atterrissage libre des Combat S (GB §14 — quand les coques combat serviront), poids/loadFrac
- [ ] Personal ship: invulnérable, owned/ally moves only, temp-governor, gouvernance preview instrument → GB §21
- [ ] Stargates: build/split-cost consent, tolls hard-gate + whitelist, traversal, exit scatter seeded U(0–15), death-with-endpoint, moving endpoints (artificial planets) → GB §6; DG §9.3–9.4

## P4 — Multijoueur, social & économie

- [~] Ping/ping-back (quota 20/day + diplo bonus), chat channels, multi-party channels (diplo worlds) → GB §5/§11; DG §15/§4.1 — **livré (chunk I)** : pings (portée = ciel du joueur vérifiée serveur, quota 20/j [TUNE], 1 hail en attente/couple), ping-back ouvrant LE canal canonique (paire triée + contrainte SQL unique), messages 1↔1 (membership vérifiée, refus testés en direct), écran Comms (hails entrants, canaux, chat 3 s), bouton Ping sur monde étranger (carte), infrastructure sans tuile constructible via l'UI (télescope/probe pad) + panneau Infrastructure ; tests : 5 unit + 5 intégration + E2E complet 2 navigateurs (télescope → ping → ping-back → échange bilatéral). **Restent** : bonus quota diplomatique, canaux multi-parties (mondes diplomatiques), notification de hail hors écran Comms
- [ ] Shares: planets/telescopes, revocable; scientific deep-sight scans shareable/sellable → GB §5/§11; DG §4.1
- [~] Markets: slots = level (1/2/3), fixed-rate L1, AMM pools L2 (seeding=pricing, 25 bp LP/25 bp house, L3 LP 20 bp), daily/absolute limits, whitelists (authz direct tests) → GB §9/§13; DG §11.1–11.2 — **livré (chunk K, taux fixe L1)** : slots = niveau (vérifié serveur), slot directionnel give→get au taux posté (aucun frais séparé en taux fixe [TUNE-v1] — les bp sont un mécanisme AMM), re-tarification ≤ 1/min, physicalité complète (soute à quai ↔ stock planétaire, cap de stockage et conteneurs vérifiés), limites quotidienne/absolue contre le journal `trades`, whitelist (propriétaire exempt), consultation à quai seulement ; UI : formulaire de slot dans le panneau du marché + offres/échange dans le panneau vaisseau à quai ; correctif au passage : ordre TOTAL de la flotte (personal/cargo/civil/combat, created_at seul flippait l'éventail après UPDATE). Tests : 6 unit + 12 intégration + E2E boucle complète (poster → charger → échanger). **Restent** : AMM L2/L3 (pools, frais bp, LP liens), routage cells-star + double-fee, merchant-planet inné, nudge triade hospitalité
- [ ] Cells-star routing + double-fee cross trades + hospitality triad nudge → GB §13; DG §11.2
- [x] Merchant-planet innate trading (survie+fuel, keep-floor, fixed rate) → GB §9; DG §11.2 — **livré (chunk L)** : périmètre EXHAUSTIF (water, oxygen, food_1..3, fuel_cold/hot/gas), gouvernance TOUTE mercantile exigée et re-vérifiée à chaque achat (l'inné se tait si elle change), plancher keep-for-self jamais entamé, hospitalité en survol — pas de droit d'atterrissage requis [TUNE-v1 interp, JOURNAL] —, journalisé dans `trades` (bâtiment NULL, slot −1), seed : le voisin mercantile publie son offre via la vraie commande. UI : section Hospitality (vue planète propriétaire) + offres/achat dans le panneau vaisseau sur place. Tests : 3 unit + 7 intégration (refus non-mercantile/étranger/hors-site en requêtes directes) + E2E publier→acheter ; l'achat TRANS-joueur est vérifié en intégration (l'autonomie v1 d'un Cargo S ne garantit pas le vol du couple seedé en E2E)
- [ ] Manual channel: public-warehouse browse (docked; orbital pour alliés avec grant), offers (limits 1/couple, 20/day, 48 h), résolution manuelle → GB §9; DG §6
- [ ] Auctions/buy-now: system escrow (movable only), second-price+reserve, bond 1 % cells, relist cooldown, mask disclosure, escrow-return-before-plunder, listed-planets-attackable → GB §13; DG §11.3
- [ ] Recruitment pods: census-driven pricing (impact immédiat, floor, cap 10/day), rarity table, roles, peoples, stat rolls U(0.5,1.5), account locks 45/60 d → GB §12/§13; DG §11.4
- [x] Global census job 4×/day: global totals only, jamais de ventilation → GB §13; DG §11.5 — **livré (chunk P)** : migration 009 (census_snapshots + amorçage idempotent), événement récurrent `census_run` auto-replanifié (patron pop_daily, cadence CENSUS_PER_DAY=4 [TUNE] ÷ TIME_SCALE, ré-amorçage au boot du worker), agrégation pure stocks lazy + soutes tous statuts (gisements exclus — non extraits ≠ offre ; pools/escrow À VENIR avec leurs chunks, manque enregistré dans meta.sources), GET /census/latest = totaux GLOBAUX uniquement (401 anonyme, aucune ventilation — assertion négative sur le JSON), écran Market/Census exhaustif (31 ressources par tier, zéros affichés, états explicites). Tests : 5 unit + 3 intégration + E2E (grant → le snapshot suivant reflète, UI suit, 401 direct)
- [~] Docks: counts par niveau (2S/+2M/+2L), hull ≤ size, réservations, dwell 24 h + éviction, deployment times (sol direct, espace = dock libre) → GB §9; DG §5.1/§6 — **livré (chunk J, fondation atterrissage & fret)** : atterrir = acte explicite depuis le survol (hover_body_id), mondes possédés toujours accueillants [TUNE-v1 interp], monde étranger = spaceport ACTIF + politique `everyone` (config par bâtiment, réglée par la vraie commande, refus testés en direct), monde sauvage refusé ; fret à quai sur monde possédé (1 conteneur = 1 T d'un fongible, tonnes partielles monopolisent — DG §7 exact ; cap de stockage refusé explicitement à la décharge, rebase des bords de frein) ; UI : soute (manifeste + conteneurs), Land/Undock, formulaire load/unload, politique d'atterrissage dans le panneau spaceport. Tests : 7 unit purs + 9 intégration + E2E boucle complète. **Restent** : comptes de docks par niveau (AUCUNE limite v1 — annoncé), hull ≤ size, réservations, dwell/éviction, temps de déploiement, usure d'atterrissage (suivi d'armure absent), friends/neighbours (factions P4)
- [~] Settlers & colonization: fractional accumulator, civil-pilot effects, colony fitting, establishment 72 h, 14 d grace (no conquest, no a2g), spaceport-upgrade nudge → GB §12/§19; DG §3.2/§12 — **livré (chunk N, cœur complet)** : migration 007 (settlers/kit/statut colonizing + `settler_routes`), fitting Civil M/L (programme colony_program + workshop L2, coût = fitting + terraform core + provisions 30+30 T [TUNE interp — le stock d'amorçage ne tient pas dans 2 conteneurs, JOURNAL]), embarquement (spaceport actif, caps pax 200/800/3000, garde 60 % workforce, une origine), péage DÉTERMINISTE par route (5 % − réductions pilotes, accumulateur fractionnaire quantifié 1e-9 — « no free sub-20 cohorts »), pilote lié permanent (max 1 v1), colonisation (survol sauvage non-poison, ≥ 200, anti-course, 72 h), établissement (propriété, population = livrés, coque → depot+spaceport L1 tuiles 0/1, provisions+carburant déchargés, PNJ re-liés, vaisseau consommé), grâce 14 j (badge + API). Tests : 7 unit + 9 intégration (péage exact, refus directs) + E2E ×2 (péage vérifié à l'unité près via le roll réel du pilote). **Restent** : ENFORCEMENT de la grâce (avec la conquête P5 — données/UI en place), spaceport-upgrade nudge, échelle pilote « 2 % × civilPilotLevel » par rareté [TUNE-GAP] (lifecycle NPC), effets civil-pilot au-delà du péage
- [ ] Planet trading inter-joueurs (governors transfer with world; mask disclosure) → GB §19; DG §12
- [ ] Factions: charter mint (3+, 500 cells), moderators invite/ban, banners visibles, faction ping, rules-as-lore (jamais enforced) → GB §23; DG §15
- [ ] Allied systems: warehouse parking (config/planète+warehouse, owner-only retrieval), allied install (host slots + host resources, guest control), impound 72 h on status loss → GB §9; DG §6
- [ ] NPC lifecycle: binding permanent + warehouse crew release (seul point de sortie), governor permanence, host-fate, strictest-bind inheritance → GB §12; DG §4.2/§11.4

## P5 — Combat & conquête

- [ ] Deterministic combat: simultaneous rounds, ATK/DEF/mit, resolution at arrival state, no live RNG → GB §20; DG §10.1–10.2
- [ ] Initiator/disengage rules: engagement groups, initiator lock 20 rds, escape = ceil(3×spd ratio) cap 8, structures never disengage → DG §9.2
- [ ] Interception: attack postures, r_engage, policy targeting (focus-fire), OBS umbrellas + small-fighter external-OBS ×0.6 → GB §6/§14; DG §9.2/§10.1
- [ ] Ground defense: unit catalog complet, garrison slots pondérés (L1/2/3=1/2/3), atmospheric targeting matrix, buildings untargetable si garnison>0, building HP ×10, cannon hover-band range → GB §25; DG §10.1
- [ ] Unit production: military_district queues (rate stack), unit cards unlocks, per-unit costs, build≠install (transport 1/2/4 conteneurs, install/uninstall 6 h, siege lock, concurrency 3, upkeep installed-only + offline≠garrison) → GB §9; DG §5.1/§6/§10.1
- [ ] Hijack: defenselessness, 2 h adjacency, crewed-fueled immunity → GB §6/§14(hist.); DG §10.3
- [ ] Conquest: defenses destroyed → forced landing → 24 h hold → plunder 25 % (warehouses = THE spoil, items census-value, escrow exclus), governor transfer, protections (starter/colony/new-account/sanctuary) → GB §9/§11/§12; DG §10.3
- [ ] Sanctuary runtime: full-diplo + diplomatic_district L3, ground+docked-with-rights truce, hover=espace normal, unconquerable, Combat-dock sur grant explicite → GB §11; DG §4.1
- [ ] Governance privileges & stacking runtime: 6 privilèges innés, stacking base×{1,1.6,2.0}, caps (intel +1), constants-not-rolls → GB §11; DG §4.1
- [ ] Junk from combat + salvage economy loop (recyclers) → GB §22; DG §10.4

## P6 — Monétisation & pont NFT

- [ ] Stripe: €2.99/€9.99×5, premium floors clamp (A/B jamais), spawn-near-buyer, webhook→generator → GB §19; DG §16/§2.2
- [ ] NFT bridge: warehouse-only freeze, packing 48 h (damage-only cancel), custodial mode (attackable, deed rewrite), burn-to-minter 60 d, account locks, relayer Polygon (contrats .blockchain moins GameEngine) → GB §16; DG §14
- [ ] Mintable set complet (planets/ships/NPCs/derived/cards/units) + starter never-mintable → GB §16; DG §14
- [ ] Supply monitor fiat→deposits vs cells-inflation target → DG §16/§19; BALANCE_LOG M1

## P7 — Endgame & préparation lancement

- [ ] Artificial planets: yard T5, coûts, mobilité 0.5 pc/day + 200 cells/day, integral moving Stargate, no deposits, planet-like combat → GB §3/§6/§25; DG §13
- [ ] Terraformer (+1 qualité, une fois) ; shipyard L3 / heavy tiers → GB §25; DG §5.1
- [ ] Balance monitors M1–M12 instrumentés en métriques live → BALANCE_LOG
- [ ] User manual (docs/manual.md) + onboarding « first hour » → GB §19; DG §17; CLAUDE.md §7
- [ ] Accessibility pass + i18n foundation (EN/FR) → DESIGN_SYSTEM §8; CLAUDE.md §22/§23
- [ ] Staging + PROD_MIGRATIONS baseline + deployment rehearsal → CLAUDE.md §12

---

*Chaque unité ci-dessus n'est `[x]` qu'après : tests propres (unit/E2E/API),
vérification visuelle, ET revue de conformité contre les sections GB/DG
citées — la réf de fonctionnement fait partie de la Definition of Done.*
