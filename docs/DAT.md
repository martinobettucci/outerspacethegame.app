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

- **Web client** — browser game, **desktop/tablet only (no mobile)**. React +
  Vite. Two scenes: galaxy map (three.js star field, 2D navigation / 3D
  styling) and planet interior (isometric 2D tile renderer + card hand —
  **renderer: PixiJS v8, DECIDED and VALIDATED 2026-07-12** (JOURNAL session
  30): the micro-prototype ran on the real planet view — animated GifSprite,
  additive light-propagation halos, per-sprite WebGL bump filter). **Renderer
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
  **Language: TypeScript (Node 22) — DECIDED 2026-07-12 (JOURNAL session
  30).** Rationale: lazy evaluation runs in BOTH the API (reads) and the
  worker (event materialization) and must be bit-identical (DG §1); a single
  language/runtime removes the dual-implementation divergence class, and
  types are shared across client/API/worker via `@atg/shared`. Trade-off:
  departs from the Python backend preference (CLAUDE.md §3, "when suited");
  Python remains the choice for offline AI/ML tooling (e.g. balance
  campaigns).
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

- Account auth (implemented, chunk D): e-mail + password — scrypt (Node
  crypto, self-describing hash format), server-side sessions (opaque token
  in an httpOnly cookie; only the SHA-256 of the token is stored; 30 d).
  OAuth may be added later as a second method.
- All game permissions server-side (landing rights, market whitelists, faction
  moderation, share grants, governance masks). Every access rule must have a
  direct-request test that bypasses the UI (CLAUDE.md §10).

## 6. Environments & deployment

Per CLAUDE.md §3: dev / staging / prod, containerized (Compose), documented
`runDev`/`runStaging`/`runProd` equivalents. Dev must be fully local:
Postgres in a container, recreatable database, reproducible seed
(`DESIGN_GUIDE.md` §2.2 starter generator doubles as the seed source), local
Stripe/webhook and chain-relayer mocks with documented contracts. E2E:
Playwright.

**Current state (P1 in progress, 2026-07-12):** `game/` pnpm monorepo
(`shared` / `server` / `client` / `e2e`); dev environment operational —
`game/docker-compose.dev.yml` (Postgres 16, image overridable via
`ATG_DB_IMAGE` for restricted-egress sandboxes), `pnpm runDev` /
`stopDev` / `resetDb`, SQL migration runner (`schema_migrations`,
transactional, advisory-locked), env vars documented in `game/.env.example`.
Delivered so far (chunks A–I, see `docs/BACKLOG.md` for exact status): sim
core + full content catalog, spawn, auth/sessions, galaxy + isometric
planet views, living colony loop, levels/demolition/stats, validated
renderer lighting pass, free flight + probes + fog-of-war, the contact
protocol (pings/channels/messages, GB §5 — scope, quota and channel
membership all enforced server-side with direct-request tests), and the
physical-economy foundation (explicit landing with spaceport policy,
docked cargo load/unload with exact DG §7 container accounting).
Staging/prod Compose files: not yet written (planned with first deploy).

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

Site (current): `bundle exec jekyll serve`. Game (from `game/`):

| Command | Effect |
|---|---|
| `pnpm install` | install workspace dependencies |
| `pnpm runDev` | start DB container + migrations + seed + API + tick worker + client (Vite, http://localhost:5173) |
| `pnpm runDev:db` | start only the dev database container |
| `pnpm migrate` / `pnpm seed` | apply SQL migrations / reseed dev data |
| `pnpm resetDb` | destroy + recreate + migrate + seed the dev database |
| `pnpm build` / `pnpm typecheck` | build / typecheck all packages |
| `pnpm test` | unit tests (all packages) |
| `pnpm test:integration` | server integration tests (real local DB) |
| `pnpm test:e2e` | Playwright E2E (starts API + client itself; DB must be up) |
| `pnpm stopDev` | stop the dev database container |

## 11. Known compromises

- Isometric renderer = PixiJS v8, VALIDATED by the lighting micro-prototype
  on the real planet view (animated GifSprite, additive light-propagation
  halos from light maps, WebGL bump filter). v1 approximations: halos carry
  the propagation (no global light field yet); bump relief subtle on flat
  stub maps — retune when real art lands.
- Game quantities use SQL NUMERIC parsed to JS doubles; determinism relies on
  identical float operations in the single V8 runtime shared by API/worker
  (documented in `game/packages/server/src/db/pool.ts`).
- Account auth scheme (email/password + server-side sessions vs OAuth) to be
  finalized in the auth chunk; documented here before implementation (§5).
- Artificial-planet NFT deed semantics under war need v2 UX review
  (BALANCE_LOG round-2 patch 47).
