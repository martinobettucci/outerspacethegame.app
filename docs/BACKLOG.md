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
- [~] Decide isometric renderer (Pixi vs canvas) via micro-prototype → DAT — **PixiJS v8 acté sur compromis documenté** (JOURNAL session 30) ; reste `[~]` jusqu'à la preuve du micro-prototype de la passe de lumière sur la vraie vue planète
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
- [~] Deterministic sim core: tick 60 s, event queue, lazy (value, rate, t0) evaluation, seeded-hash generation-RNG, offline catch-up → GB §15; DG §1 — file d'événements (SKIP LOCKED, idempotence, concurrence testée), evalLazy/whenReaches/rebase, SeededStream (34 tests shared + 15 server) ; reste : preuve E2E offline catch-up (P2)
- [ ] Spatial index (grid hash) + segment-circle interception solver → GB §2/§6; DG §9.2
- [ ] Policy/instruction engine core (declarative rulesets + evaluator; manual-first override; stackable conditions; predefined strategy library) → GB §15; DG §9.2/§3.5
- [~] Auth + account lifecycle (starter spawn, account-bind 45 d, new-account combat shield + voids, receive-cap) → GB §19; DG §2.2/§18 — registerPlayer (scrypt, transactionnel) + spawn complet + bind 45 j FAITS et testés (8 tests d'intégration) ; restent : sessions/login API (chunk D), bouclier combat 14 j + voids, receive-cap
- [~] Seed contract: starter-system generator = reproducible dev seed demonstrating every P2 feature → GB §19; DG §2.2; CLAUDE.md §8 — seed = vrai flux registerPlayer, 2 comptes démo (voisin garanti 150–240 pc vérifié : 159,6 pc), idempotent ; la couverture « every P2 feature » suivra les livraisons P2
- [ ] Observability baseline (structured logs, health/readiness, correlation ids; no secrets) → CLAUDE.md §20
- [ ] CI: unit + integration + Playwright E2E + visual-capture harness → CLAUDE.md §15/§16

## P2 — MVP « one planet, solo » (chaque unité = mécanique GAMEBOOK)

- [~] Universe gen: bodies, seeds-as-DNA, planet rolls (size/climate/quality/tiles), star rolls (type, hidden stock, R_nova) → GB §2/§3/§22; DG §2.1 — rolls déterministes (planète/starter/étoile/gisements/noms) implémentés + testés ; restent : ceintures denses hors poches (P3 carte), poids étoile S/M/L à équilibrer
- [~] Starter spawn: Fermi pocket, guarantees (star ≤40 pc, 2 uninhabited ≤60 pc, neighbor 150–240 pc), starter planet (≥10 tiles, deposits garanties, stock, pop 1200, fuel 150 u, pilot, Cargo-S), supernova-safe → GB §19/§22; DG §2.2 — toutes les garanties implémentées et testées en intégration ; restent : E2E visuel (chunk D) + cas « univers saturé »
- [ ] Isometric planet view: tile grid, climate variants, GIF sprites + overlays, bump/light WebGL pass, light propagation → GB §17/§26; ASSET_PIPELINE §2–3
- [ ] Card hand UI: construction cards, unlock/place phases, demolish 50 %, costs chips → GB §9/§18; DG §5/§6
- [ ] Tech tree runtime: global DAG, seed mask (tiers %), never-gated set (telescope/probe/depot/mine/colony), unlock = permanent knowledge, production needs live infra → GB §18; DG §5
- [ ] Building catalog complet (28) avec effets par niveau + coûts + 1 tuile + adaptations climat → GB §9/§25; DG §5.1
- [ ] Industry: one-recipe queues, throughput ladder, retool 24 h, refinery→cells, fuelcell_plant line, max 1 extracteur/gisement → GB §9; DG §6/§3.3
- [ ] Mining + trace mining, deposit depletion + projected-dry-date UI → GB §3; DG §3.3
- [ ] Fungible storage: base allowance S/M/L, depot ladder + level costs, one-sided brake, halt at cap, overfill-on-delivery, fuel shares cap → GB §9; DG §3.3b
- [ ] Population sim: logistic growth, H (food/water gate, med boost), illness index, crowding → GB §10; DG §3.2
- [ ] Efficiency engine: asymmetric bell E(u), per-domain/per-resource u, E_planet, G, runPct; curve UI + live dot + limiting factor + planet stats page → GB §10; DG §3.4
- [ ] Governance v1: masks (intersection), preview screen (obligatoire), personal-ship temp governor, small/medium/large requirements, half-efficiency rule → GB §11/§21; DG §4.1
- [ ] Warehouse: balances S/M/L véhicules + items, zéro conso, tampon libre 2M/2S/10, blocage d'usine, public/privé, entrées/sorties manuelles du privé → GB §9; DG §6
- [ ] Depot/warehouse/NFT states machine (installed/warehoused/cargo/escrow/NFT-locked/packing) → GB §9/§16; DG §7/§14
- [ ] Offline catch-up correctness E2E (log off / return, zero drift) → GB §15; DG §1

## P3 — Galaxie & mouvement

- [ ] Galaxy map three.js: star field 3D-style, 2D nav, fog-of-war, pixel-sprite bodies → GB §2/§17/§26
- [ ] Telescopes: scope +200/level max 3, intel tiers L1/L2/L3 (heading/destination/manifest + junk & harvest attribution) → GB §4/§20; DG §9.2
- [ ] Probes: solar sail 10 pc/day, crewless, scanning, build cap → GB §4/§14; DG §8.1
- [ ] Free flight: segments, speedEff/burnEff (weight), fuel×engine matrix, derived range UI, course changes → GB §6/§14; DG §8.2–8.4/§9.1
- [ ] Death clocks: fuel-out=stranded (recoverable), survival-out=ownership strip; salvage claims (claim rig 2 h) → GB §6; DG §8.8/§10.3
- [ ] Hovering: own-planet drain vs ship-stock drain, auto-trade policy bounds (3× census), survival alarm + auto-flee → GB §7; DG §3.5
- [ ] Stars: harvest gradient (d_safe/d_max), hidden stock, flare <5 %, supernova event + annihilation radius, L-star→black hole → GB §22; DG §2.1/§8.8
- [ ] Black holes: junk sink zéro conséquence → GB §22
- [ ] Space junk: creation (kills/dumps), hazard fields, decay 10 %/day, dump limits, attribution L3, no-dump zone starters, collection 30 T/day → GB §22; DG §10.4
- [ ] Climate shields: hull wear 5 %/day sans bouclier (hot/cold/poison-harvest/black-hole/flare zones), temperate exempt, bâtiments exempts → GB §27(settled); DG §8.8
- [ ] Ship fitting: 9 hulls + personal + probe, slots par coque, upgrades ×2 niveaux, accessoires, overlays visuels composités → GB §14; DG §8.1–8.2; ASSET_PIPELINE §2
- [ ] Personal ship: invulnérable, owned/ally moves only, temp-governor, gouvernance preview instrument → GB §21
- [ ] Stargates: build/split-cost consent, tolls hard-gate + whitelist, traversal, exit scatter seeded U(0–15), death-with-endpoint, moving endpoints (artificial planets) → GB §6; DG §9.3–9.4

## P4 — Multijoueur, social & économie

- [ ] Ping/ping-back (quota 20/day + diplo bonus), chat channels, multi-party channels (diplo worlds) → GB §5/§11; DG §15/§4.1
- [ ] Shares: planets/telescopes, revocable; scientific deep-sight scans shareable/sellable → GB §5/§11; DG §4.1
- [ ] Markets: slots = level (1/2/3), fixed-rate L1, AMM pools L2 (seeding=pricing, 25 bp LP/25 bp house, L3 LP 20 bp), daily/absolute limits, whitelists (authz direct tests) → GB §9/§13; DG §11.1–11.2
- [ ] Cells-star routing + double-fee cross trades + hospitality triad nudge → GB §13; DG §11.2
- [ ] Merchant-planet innate trading (survie+fuel, keep-floor, fixed rate) → GB §9; DG §11.2
- [ ] Manual channel: public-warehouse browse (docked; orbital pour alliés avec grant), offers (limits 1/couple, 20/day, 48 h), résolution manuelle → GB §9; DG §6
- [ ] Auctions/buy-now: system escrow (movable only), second-price+reserve, bond 1 % cells, relist cooldown, mask disclosure, escrow-return-before-plunder, listed-planets-attackable → GB §13; DG §11.3
- [ ] Recruitment pods: census-driven pricing (impact immédiat, floor, cap 10/day), rarity table, roles, peoples, stat rolls U(0.5,1.5), account locks 45/60 d → GB §12/§13; DG §11.4
- [ ] Global census job 4×/day: global totals only, jamais de ventilation → GB §13; DG §11.5
- [ ] Docks: counts par niveau (2S/+2M/+2L), hull ≤ size, réservations, dwell 24 h + éviction, deployment times (sol direct, espace = dock libre) → GB §9; DG §5.1/§6
- [ ] Settlers & colonization: fractional accumulator, civil-pilot effects, colony fitting, establishment 72 h, 14 d grace (no conquest, no a2g), spaceport-upgrade nudge → GB §12/§19; DG §3.2/§12
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
