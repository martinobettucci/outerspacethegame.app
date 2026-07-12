# DAT — Dossier d'Architecture Technique / Technical Architecture Dossier

> Target architecture for ATG (Across The Galaxies). **Preproduction:** this
> dossier describes the *designed* system; no application code exists yet.
> Mechanics and numbers live in `DESIGN_GUIDE.md`; rules canon in
> `GAMEBOOK.md`. This document covers the technical shape.

## 1. System overview

```
┌────────────┐   HTTPS/WS   ┌───────────────┐    SQL     ┌────────────────┐
│ Web client │ ◄──────────► │  Game API     │ ◄────────► │  PostgreSQL     │
│ (browser)  │              │  (stateless)  │            │  (authoritative)│
└────────────┘              └──────┬────────┘            └───────┬────────┘
                                   │ events/jobs                 │
                            ┌──────▼────────┐            ┌───────▼────────┐
                            │  Tick worker  │            │  Census jobs   │
                            │ (simulation)  │            │ (supply, pods) │
                            └──────┬────────┘            └────────────────┘
                                   │
        ┌───────────────┐   ┌──────▼────────┐   ┌──────────────────┐
        │ Stripe        │   │ NFT relayer   │──►│ Polygon PoS      │
        │ (fiat planets)│   │ (mint/burn)   │   │ (existing        │
        └───────────────┘   └───────────────┘   │  contracts)      │
                                                └──────────────────┘
```

## 2. Components

- **Web client** — browser game, **desktop/tablet only (no mobile)**. Two
  scenes: galaxy map (three.js star field, 2D navigation / 3D styling) and
  planet interior (isometric 2D tile renderer + card hand). **Renderer
  requirement:** a WebGL 2D lighting pass — every sprite ships with a bump
  map and an emissive light map; sprite lights spread to the environment and
  to nearby sprites (see `docs/ASSET_PIPELINE.md` §3; acceptance reference:
  `docs/design/prototypes/06-layered-lighting-scene.png`). Sprites are
  `base + transparent overlay` composites (upgrades, levels, climate, weather).
  Design system: `docs/DESIGN_SYSTEM.md`; DOM contract:
  `docs/design/props/index.html`. Client is **never authoritative**; it
  renders lazily-evaluated server state and interpolates.
- **Game API** — stateless service; auth, commands (place card, set policy,
  launch mission, trade, ping), reads. Every authorization rule is enforced
  here or in the database (CLAUDE.md §10) — UI gating is never sufficient.
- **Tick worker** — advances the simulation (tick = 60 s): event queue
  (arrivals, interceptions, auction closes, deposit-dry, supernova, packing),
  lazy `(value, rate, t0)` evaluation, deterministic combat resolution.
  Language decision pending (GAMEBOOK §27); candidates: TypeScript (shared
  types with client) or Python (owner preference §3) — to be decided with a
  documented trade-off before implementation.
- **Census jobs** — periodic (4×/day) global resource-supply aggregation;
  drives recruitment-pod pricing; published in-game.
- **NFT relayer** — the only blockchain surface: watches Mint/Burn events,
  reconciles DB lock state (packing → frozen → burn-return). Chain: Polygon
  PoS; contracts reused from `outerspacethegame.app.blockchain` (minus
  `GameEngine.sol`).
- **Stripe integration** — fiat planet purchases (the game's only real-money
  entry). Webhook → planet generator.

## 3. Data model (principal aggregates)

Authoritative tables (details in `DESIGN_GUIDE.md`):

- `players` (account, politics archetype, personal ship), `factions`,
  `npcs` (people, role, rarity, binding host + account-bind timers).
- `bodies` (planets/stars/black holes: type, position, seed, climate, quality,
  tiles, owner), `deposits` (finite stock), `buildings` (type, level, recipe,
  policy), `tech_unlocks` (per planet).
- `ships` (hull category×size, slots/modules, tanks, crew, cargo, position or
  mission), `missions`/`policies` (the instruction engine: declarative rulesets
  evaluated by the tick worker).
- `markets`, `amm_pools` (per market per pair, LP liens), `auctions` +
  system-held `escrow`, `trades`.
- `pings`, `channels`, `shares`, `routes`/`stargates` (tolls).
- `events` queue; `census` snapshots; `nft_locks` (packing/frozen state).
- Spatial index (grid hash 64 pc) for interception queries.

## 4. Flows (canonical)

1. **Command flow:** client → API (authz) → row updates + event enqueue →
   tick worker materializes at due-time → client reads lazily-evaluated state.
2. **Combat:** interception/arrival event → deterministic resolution at
   arrival state → junk creation → salvage claims.
3. **Economy:** physical co-location enforced at API level; AMM swaps mutate
   pool reserves on the planet; census job aggregates supply → pod pricing.
4. **NFT extract/burn:** packing (48 h, cancellable by damage) → relayer mints
   → DB lock; burn observed → asset rematerializes (minter-only 60 d).
5. **Purchase:** Stripe webhook → spawn generator (§2.2 DESIGN_GUIDE) →
   planet minted near buyer.

## 5. Authentication & authorization

- Account auth: email/OAuth (decision pending; documented before impl).
- All game permissions server-side (landing rights, market whitelists, faction
  moderation, share grants, governance masks). Every access rule must have a
  direct-request test that bypasses the UI (CLAUDE.md §10).

## 6. Environments & deployment

Per CLAUDE.md §3: dev / staging / prod, containerized (Compose), documented
`runDev`/`runStaging`/`runProd` equivalents. Dev must be fully local:
Postgres in a container, recreatable database, reproducible seed
(`DESIGN_GUIDE.md` §2.2 starter generator doubles as the seed source), local
Stripe/webhook and chain-relayer mocks with documented contracts. E2E:
Playwright. **None of this exists yet — implementation phase P1.**

## 7. Recovery strategies

- Database: point-in-time recovery (WAL archiving) — the DB is the single
  source of truth; everything else is stateless/rebuildable.
- Tick worker: idempotent event processing; resume from the event queue.
- Relayer: chain re-scan from last processed block (deterministic reconcile).

## 8. Key technical decisions & trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| Postgres authoritative, chain opt-in | The on-chain engine is why dev stalled; a tick sim can't run on-chain | NFT holders trust the server's deed registry (token = deed, not bunker) |
| Lazy `(value, rate, t0)` evaluation | No per-entity per-tick writes; offline catch-up for free | Requires strict determinism discipline (no live RNG; seeded hashes only) |
| Deterministic combat at arrival | No RNG = no save-scumming; risk is temporal | Stale intel must be a real UX (telescope levels) |
| 2D iso renderer separate from three.js map | Right tool per scene; simpler sprites pipeline | Two rendering stacks to maintain |
| System-held escrow (sole physicality exception) | Neutral escrow can't be griefed | One documented exception to the co-location rule |

## 9. Development data

The starter-planet generator + guaranteed deposits (DESIGN_GUIDE §2.2) is the
seed contract: dev/staging seeds must produce a playable starter system
demonstrating every shipped feature (CLAUDE.md §8). To be built in P1.

## 10. Launch commands

Site (current): `bundle exec jekyll serve`. Game: to be defined in P1
(containerized; documented here when they exist).

## 11. Known compromises

- Tick worker language undecided (TS vs Python) — blocking P1 kickoff, not P0.
- Isometric renderer library undecided (Pixi vs custom canvas) — prototype in P0/P1.
- Artificial-planet NFT deed semantics under war need v2 UX review
  (BALANCE_LOG round-2 patch 47).
