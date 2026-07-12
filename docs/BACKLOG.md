# BACKLOG — ATG / Across The Galaxies

> Statuses (CLAUDE.md §5): `[ ]` not started · `[~]` in progress or
> insufficiently verified · `[x]` done **and fully verified** (Definition of
> Done, CLAUDE.md §17).
>
> Every implementation unit (P1+) requires its own unit test + E2E test, plus
> an API/integration test when it touches API/DB/services/authz (§15). Doc
> units are verified by reconciliation review + commit + push.
>
> Source of truth for mechanics: `DESIGN_GUIDE.md` (v0.3). Rules canon:
> `GAMEBOOK.md`. **P1+ must not start without explicit owner instruction —
> project is in preproduction.**

---

## P0 — Préproduction (current phase)

### P0.1 Design canon
- [x] GAMEBOOK.md — reconciled rule canon (27 sections; conflicts resolved)
- [x] JOURNAL.md — decision log, rebuildable history (10 sessions)
- [x] Archaeology sweeps — all branches of all 3 repos + 2021/2022 artist briefs salvaged
- [x] GAME_BIBLE.md — lore canon (the Silence, three peoples, places, substances, tone)
- [x] DESIGN_GUIDE.md v0.3 — full mechanical spec, formulae, `[TUNE]` convention
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
- [ ] Decide tick-worker language (TS vs Python) with documented trade-off → DAT
- [ ] Decide isometric renderer (Pixi vs canvas) via micro-prototype → DAT
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
- [~] **Balance Round 6 — warehouse & planchers fongibles** : spec responsable intégrée (v0.6) ; sims lancées (logistique/exploits warehouse + étude des planchers de dépôt par simulation, directive responsable)
- [ ] Postgres schema draft (docs/SCHEMA.md) derived from DESIGN_GUIDE — design doc only
- [ ] MVP specification (docs/MVP.md) — the solo-planet vertical slice, acceptance criteria

## P1 — Fondations techniques (requires explicit owner go)

- [ ] Monorepo/app scaffolding decision + containerized dev env (Compose: Postgres, API, worker, client; runDev)
- [ ] Migrations framework + baseline schema (from docs/SCHEMA.md) + PROD_MIGRATIONS.md
- [ ] Seed contract: starter-system generator as reproducible seed (demonstrates every P2 feature)
- [ ] Deterministic sim core: tick loop, event queue, lazy (value, rate, t0) evaluation, seeded-hash RNG
- [ ] Policy/instruction engine core (declarative rulesets + evaluator) — the spine
- [ ] Auth + account lifecycle (starter spawn, new-account protections)
- [ ] Observability baseline (structured logs, health/readiness, correlation ids)
- [ ] CI: unit + integration + Playwright E2E pipelines; visual-capture harness

## P2 — MVP vertical slice « one planet, solo »

- [ ] Spawn flow: starter planet per §2.2 guarantees (tiles, deposits, stock, pop 1200, pilot, Cargo-S)
- [ ] Planet interior: isometric renderer + tile grid + climate variants
- [ ] Card hand UI: construction cards, placement (pay + tile), demolish (50%)
- [ ] Tech tree: unlock/place phases, seed mask, telescope/probe/colony never gated
- [ ] Mining & trace mining; deposit depletion + projected-dry-date UI
- [ ] Industry: one-recipe buildings, throughput, retool; refinery → fuel cells
- [ ] Population sim: growth/H/illness; settlers not yet (P4)
- [ ] Efficiency engine + curve UI (per-unit curve, live position, limiting factor) + planet stats page
- [ ] Governance v1: personal ship as temp governor; preview screen
- [ ] Offline catch-up correctness (lazy evaluation E2E: log off / return)

## P3 — Galaxie & mouvement

- [ ] Galaxy map (three.js star field, 2D nav, fog of war)
- [ ] Telescopes (scope, levels, intel tiers) & probes (solar sail, scanning)
- [ ] Free flight: segments, fuel/survival clocks, stranding, two deaths, ownership strip
- [ ] Stars: harvest gradient (accessory), hidden stock, flare <5%, supernova event, black holes
- [ ] Junk fields: creation, decay, hazards, dumping rules, collection/claim rigs
- [ ] Hovering (own vs foreign drain) + auto-trade policy bounds
- [ ] Ship fitting: hulls × slots × upgrades, fuel×engine matrix, derived range UI

## P4 — Multijoueur & économie

- [ ] Ping/ping-back, chat channels, shares (planets/telescopes, revocable)
- [ ] Markets: physical stock, fixed-rate mode, limits, whitelists (authz tests direct)
- [ ] AMM pools: seeding-as-pricing, fees, LP liens, double-fee routing
- [ ] Auctions & buy-now: system escrow, second-price+reserve, bonds, mask disclosure
- [ ] Recruitment pods: census job, dynamic pricing, rarity tables, account locks
- [ ] Stargates: build/split-cost consent, tolls (hard gates), exit scatter
- [ ] Settlers & colonization: accident accumulator, colony fitting, establishment, 14-d grace
- [ ] Planet trading between players
- [ ] Factions: charter, moderation, banners, faction ping

## P5 — Combat & conquête

- [ ] Deterministic combat: rounds, ATK/DEF/mitigation, initiator/disengage rules
- [ ] Interception: spatial hash, segment-circle windows, attack postures (policy library)
- [ ] Ground defense: turrets/tanks, building HP, a2g rules, hovering targeting
- [ ] Hijack (2 h adjacency) & salvage claims
- [ ] Conquest: forced landing, 24 h hold, plunder 25%, governor transfer, protections (starter/colony/new-account)
- [ ] OBS umbrellas & small-fighter external-OBS rule

## P6 — Monétisation & pont NFT

- [ ] Stripe: planet purchase €2.99 / €9.99×5, premium quality floors (clamp), spawn-near-buyer
- [ ] NFT bridge: packing 48 h, custodial freeze, relayer, burn-to-minter, account locks (Polygon; reuse `.blockchain` contracts minus GameEngine)
- [ ] Supply monitor: purchased-planet deposit injection vs cells-inflation target (BALANCE_LOG M1)

## P7 — Endgame & fin de préparation au lancement

- [ ] Artificial planets: build, mobility, integral moving stargate, conquest semantics
- [ ] Terraformer (+1 quality once) & shipyard_L / heavy industry tiers
- [ ] Balance monitors M1–M5 instrumented as live metrics
- [ ] User manual (docs/manual.md) + onboarding flow (« first hour » journey)
- [ ] Accessibility pass (keyboard, contrasts, focus) & i18n foundation (EN/FR)
- [ ] Staging environment + PROD_MIGRATIONS.md baseline + deployment contract rehearsal

---

*Every `[~]`/`[ ]` above stays below `[x]` until its Definition of Done
(CLAUDE.md §17) is fully evidenced — including tests, visual verification and
documentation in the same chunk.*
