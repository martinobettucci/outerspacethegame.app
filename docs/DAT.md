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
- **Census jobs (implemented, chunk P)** — recurring `census_run` event
  in the events queue (no cron; CENSUS_PER_DAY=4 [TUNE], worker re-seeds
  the chain at boot). Aggregates planet stocks (lazy-evaluated) + ship
  cargos (all statuses); deposits excluded (unextracted ≠ supply); AMM
  pools and auction escrow join with their chunks (gap recorded in
  `meta.sources`). Publishes GLOBAL per-resource totals only
  (`GET /census/latest`, session required) — breakdowns never leave the
  server (DG §11.5). Will drive recruitment-pod pricing.
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
- `settler_routes` (implemented, 007): deterministic settler-toll
  accumulator per (origin, destination) pair — fractional expectation
  carried between trips so small cohorts still pay (DG §3.2).
- Lazy ship tank (implemented, 008): `ships.fuel` (amount, jsonb) +
  `fuel_rate_u_per_day`/`fuel_as_of`. Loitering (hovering/idle) drains
  continuously; `ship_fuel_out` edge events follow the stock_edge
  purge-and-reschedule pattern; empty tank ⇒ status `stranded`.
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
6. **Colonization (implemented, chunk N):** fit colony kit (Civil M/L,
   `colony_program` unlocked + workshop L2 active; cost = fitting +
   terraform core + provisions) → embark settlers (active spaceport, pax
   caps, 60 % workforce guard) → fly to a hovered wild non-poison planet →
   `colonize` (≥ 200 settlers, anti-race lock) → 72 h
   `colony_established` event: ownership, population = delivered
   settlers, hull converted to depot L1 + spaceport L1 (tiles 0/1),
   provisions + fuel unloaded, governor-grade crew (rarity ≥ rare) bound
   to the planet — commons return to the roster unhosted [amended, chunk
   W] — ship deleted.
   Arrival toll is deterministic (base 5 % − bound-pilot reductions,
   `settler_routes` accumulator quantized 1e-9). Fresh colonies carry a
   14-day grace (`colonized_at`; badge + API today, enforcement lands
   with combat).
7. **Loitering drains (implemented, chunk O):** hovering/idle hulls burn
   fuel continuously (0.2/0.4/0.8 u/day S/M/L [TUNE]; personal & probe
   exempt). Over your OWN world the planet's `fuel_<type>` stock pays
   (need injected into the rate rebase, served after population
   survival, all-or-nothing per resource [TUNE-v1]); over a foreign/wild
   world, a dry own world, or in the void, the tank pays and a
   `ship_fuel_out` edge is scheduled — firing empty flips the hull to
   `stranded` (frozen tank, no departures). Recovery: `refuel` from an
   owned world below (docked/hovering/stranded) or ship-to-ship
   `transfer-fuel` (own hulls, ≤ 1 pc [TUNE-GAP], same fuel type,
   instantaneous [TUNE-v1]). Departure auto-load fills the FULL tank
   from an owned world's stock and rebases the departed world.
   IMPORTANT time-model note: TIME_SCALE accelerates EVENTS only — lazy
   drift (stocks, tanks, population) runs in real days (JOURNAL
   2026-07-13).
8. **Recruitment pods (implemented, chunk R):** priced against the
   latest census (S_r minus pod tons paid since the snapshot — immediate
   impact), paid PHYSICALLY from an owned world's stock (co-location;
   the sink removes real tons and rebases rates). Account age ≥ 45 days
   and 10/day cap enforced server-side; the NPC is rolled by seeded
   generation-moment RNG (universe:pod:player:purchase-index, serialized
   by the player row lock) and lands account-bound for 60 days.
   Strictest-bind inheritance on host transfers ships with auctions/NFT
   (P4).
9. **Spaceport docks (implemented, chunk S):** landing throughput is
   bounded by CUMULATIVE dock counts of active spaceports (L1 = 2 S,
   L2 = +2 M, L3 = +2 L [TUNE]); a hull fits any dock ≥ its size and
   feasibility is checked greedily (S spills to M then L). Capacity
   applies to EVERYONE (owner included) as soon as an active port
   exists; the bootstrap exception [TUNE-v1] keeps "your own world
   without an active spaceport always welcomes you" (starters spawn
   building-less). Exemptions: personal, probe, Combat-S — and Combat-S
   lands ANYWHERE, ignoring landing policy and wild status [announced
   interp; sanctuary/siege arbitrates in P5]. Per-port
   `reservedForSelf` (0–2 [TUNE], default 0) is subtracted from the
   VISITOR pool smallest-docks-first; owners ignore reservations. Every
   visitor landing on an OWNED world schedules a `dock_eviction` event
   at +dwell/timeScale (per-port `dwellHours` 1–720, default 24 [TUNE],
   most generous active port wins) — the handler is guarded by
   `ships.docked_at` (migration 011): it only evicts the exact landing
   it was scheduled for, so undock+re-land expires stale evictions;
   eviction returns the hull to hovering with the tank drain armed.
   Yard-built hulls are born docked even over capacity (docks bound
   LANDINGS, not production — announced). `landShip` locks BODY before
   ship (refuel idiom): concurrent landings on one world serialize;
   ship ownership is checked before any state (no state oracle on
   foreign hulls, §10). `planetDetail.docks` aggregates
   total/occupied-by-size/visitors/reserved/dwell for the owner's UI.

10. **Manual trade channel (implemented, chunk T):** each warehouse
   carries a public/private visibility (config, default PRIVATE
   [TUNE-v1]); a world with ≥ 1 ACTIVE public warehouse exposes its
   fungible stock (amounts only — never rates) to buyers DOCKED there
   (canon "commerce dock": hovering is NOT enough, unlike innate
   hospitality). Buyers send explicit-bundle offers ("I take X of A, I
   pay Y of B", give > 0) under round-7 limits: 1 OPEN offer per
   (buyer, world, resource), 20 creations/24 h/account, 48 REAL hours
   TTL [TUNE] with lazy sweep. The offer pins the docked ship; the
   OWNER accepts (physical settlement: stock ↔ pinned ship's cargo,
   container accounting, net-delta storage check per §3.3b, trades
   journal slot −2, rate rebase) or declines; the buyer may withdraw.
   Lock order: offer → body → ship. v1 announced: item = pooled
   fungible (per-warehouse inventories, vehicles/items with auctions
   P4), orbital ally browse with share grant (factions P4),
   counter-offer = decline + new offer. Test instrumentation (§15):
   POST /test/relocate-ship (own ship, gated) — spawn pockets are
   disjoint and v1 cargo range makes cross-pocket flight
   non-deterministic; landing still goes through the real dock path.

11. **AMM pools, market L2+ (implemented, chunk U):** a pool is ONE
   market trade slot holding a constant-product pair (`buildings.config`
   variant — no schema change; a withdrawn slot leaves a reusable null
   hole). The owner's initial deposit ratio IS the initial price; both
   legs are deducted physically from planet stock. Fees on the INPUT
   leg: 25 bp LP accrued INTO the input reserve (k grows — liquidity's
   pay) + 25 bp house cut to planet stock [TUNE]; market L3 lowers the
   LP leg to 20 bp. Trades are dockside, bidirectional, whitelist
   (owner-exempt) and daily/absolute limits against the `trades`
   journal, container accounting, net-delta storage check. Reserves are
   PHYSICAL planet stock: counted against the storage cap (pooledT in
   computeRates/storageUsedT/cap checks) and in the census (`ammPoolT`
   bucket, sources +'amm_pools'). Spot is NEVER an oracle (pods stay on
   the census). v1 announced: owner-only LP (visitor LP, guaranteed
   withdrawal and conquest liens with shares P4); cells-star routing +
   double-fee cross trades are a dedicated backlog item.

12. **Cells-star routing & triad nudge (implemented, chunk V):**
   POST /planets/:id/amm-route performs BEST EXECUTION give→get across
   the planet's AMM pools: direct pools (single fee) compete with
   two-leg routes through a shared intermediate (each leg pays ITS
   pool's fees — canon double fee); only EXECUTABLE routes compete
   (per-leg whitelist, owner exempt; per-slot daily/absolute limits);
   deterministic tie-break; atomic settlement (the intermediate never
   enters the hold, one `trades` row per leg, per-leg house fees to
   planet stock, net-delta storage). A route may span two market
   buildings on the same world [announced interp: the marketplace is
   planetary]; locks: markets (ascending id) → body → ship. Triad
   nudge (DG §11.2): `planetDetail.triadNudge` is true when the world
   runs an ACTIVE market but NO food pair (fixed or AMM) exists within
   the owner's TELESCOPE scope (ship vision excluded — canon wording;
   innate hospitality is not a pair [interp]); null without an active
   market.
13. **Governance v1 (implemented, chunk W):** per-size governor
   requirements S 0 / M 1 / L 3 (= install caps, canon); the effective
   G multiplier (1.0 fully governed, 0.5 under-requirement — canon for
   large, generalized to medium [TUNE-v1]; +2% × 1-based rarity tier of
   the weakest INSTALLED governor [TUNE]) multiplies the production
   snapshot's planetMultiplier (E × G) so every industry rate follows.
   The owner's parked personal ship counts as ONE temp governor
   (requirement + mask; no rarity bonus). Installation is PERMANENT
   (governor-grade = rarity ≥ rare; owned, unhosted NPC; no removal
   path exists by design — conquest will transfer governors with the
   world, P5). The canon-required PREVIEW is computed server-side
   (candidates re-validated; returns archetypes, resulting mask, LOST
   nodes vs current, G) and the UI gates install behind a TYPED planet
   name confirmation. Colonization amendment: only governor-grade
   founding crew takes a colony seat. Test instrumentation (§15):
   POST /test/grant-npc (pod rolls are seeded by playerId — not
   precomputable in E2E specs).

14. **Industry retooling & delivery overfill (implemented, chunk Y):**
   re-targeting an ACTIVE industry writes the new recipe immediately and
   pauses production (status `retooling`, migration 013) until
   `retool_complete` at +24 game h [TUNE]; all-Industrialist governance
   retools INSTANTLY, at most one free switch per 24 h window
   (`config.lastInstantRetoolMs`) — beyond it the standard retool
   applies [TUNE-v1 interp]; recipe validation is shared with placement
   (max-1-extractor-per-deposit, self-excluded). Canon §3.3b alignment:
   deliveries and swaps ALWAYS land (six historical cap refusals lifted
   across cargo unload, fixed trade, innate trade, AMM swap/route,
   manual accept) — only production halts at cap via the storage brake.

15. **Survival clocks & derelicts (implemented, chunk AB):** crewed
   hulls burn 0.01 T/day of food AND water per crew member [TUNE]
   wherever the crew lives aboard — foreign/wild hover, idle, TRANSIT
   (the flight death clock), stranded; exempt: docked/warehoused (the
   host feeds), own-world hover WHEN SERVED (chunk AE: the planet stock
   feeds the crew — food family + water consumed AFTER population
   survival, all-or-nothing per family [TUNE-v1]; a dry world flips the
   clock back onto ship stores at the next planet recompute, fuel
   pattern), colonizing, derelict. `POST /ships/:id/provision` (owned
   world; docked/hovering/stranded) refills food+water to hull capacity
   (survivalCrewDays × 0.01 × crew) from the planet stock. Lazy stores (migration 014, fuel
   pattern) rebase in piggyback of every drain rebase + transit
   departure + crew changes; the clock only ARMS when stores exist
   [TUNE-v1 — announced]. At 25% of hull capacity
   (survivalCrewDays × 0.01 × crew) the default-armed auto-flee-home
   policy (disarmable) routes the ship to the nearest OWNED world
   within tank range. survival_out kills the crew (host-fate), strips
   ownership (owner NULL) and leaves a DERELICT wreck — gone from the
   owner's fleet; salvage claims (items P4) and hijack (P5) pending.
16. **Vehicle warehouse (implemented, chunk AD):** per-size SEPARATE
   balances on each owned world — ground buffer 2 M + 2 S (never L)
   plus, per ACTIVE warehouse, 6 S / 4 M / 2 L × level multiplier
   (L1 ×1, L2 ×2, L3 ×3). `POST /ships/:id/warehouse` (docked on an
   OWNED world, personal/probe excluded [interp]) stores the hull with
   zero upkeep and RELEASES the bound crew — the only exit of the
   permanent NPC bind (GB §12); re-crewing is allowed at the warehouse
   (`assignCrew` accepts status `warehoused`). `POST
   /ships/:id/retrieve` redeploys in 1/3/6 h by size [TUNE, canon
   "1–6 h"] ÷ TIME_SCALE via the `ship_retrieved` event, requires a
   free dock at launch (landing capacity rules; bootstrap exception
   without an active spaceport) and refuses double redeployment.
   Fleet view exposes `retrievesAt`; planet detail exposes
   `vehicles {capacity, stored}`. Item balances (50/level) and factory
   blocking stay dormant until unit factories exist; allied parking P4.

17. **Star harvest & Starfall (implemented, chunk AF):** stars carry a
   HIDDEN lazy fuel ledger (amount/rate/as_of + initial, never exposed —
   canon: no gauge). A workshop-fitted harvest rig (20 steelL +
   5 crystal + 5 gold [TUNE]) lets an IDLE hull within 8 pc of a
   same-fuel-type star harvest at R_max × (1 − d/d_max)² net of idle
   upkeep — ship tank rate goes POSITIVE, star rate −Σ yields.
   Edges: `harvest_full` (tank cap → rig retracts), `star_supernova`
   (stock 0 → STRICT annihilation < R_nova: ships deleted with
   host-fate crews, planets wiped to ash `config.annihilated`, L-class
   leaves a black hole, S/M vanish; residual-rounding reschedules the
   event rather than dropping it). Starters are generated AT R_nova
   exactly and stay safe (strict bound). Flare ≤ 5% of initial stock is
   a public boolean on visible stars. Departure auto-stops harvest.
   Hull damage inside d_safe awaits the hull-wear chunk (announced).

18. **Hull wear & shields (implemented, chunk AG):** environmental
   toll (GB §27 SETTLED) — 5% max-HP/day per UNSHIELDED hostile source,
   additive [TUNE-v1]: hot/cold world under the hull (docked or
   hovering), ≤ 5 pc of a black hole or FLARING star (radio shield),
   plus harvest-rig proximity damage below d_safe (no shield mitigates
   [TUNE-v1]). Lazy hull ledger (migration 016; NULL = pristine),
   rebased piggyback on every ship-state seam; floor 1 HP — a toll,
   never a kill (destruction comes with combat P5). Three
   workshop-L2 shields (15 steelL + 5 matching crystal; radio → nox
   [interp]). Temperate worlds and buildings never require shields;
   transit/warehoused/colonizing/derelict exempt [TUNE-v1].
   Poison-harvest wear stays dormant until poison-deposit harvesting
   exists (announced). **Workshop repair (chunk AH, DG §8.7):** docked
   on an OWNED world with an active workshop, damaged hulls regain
   5% max-HP/hour × level mult (1/2/4, best workshop [TUNE-v1]);
   steel_l is billed to the planet stock at 0.1 T/HP [TUNE-v1]
   (all-or-nothing family, recompute flip — dry steel stops repair);
   the `hull_repaired` edge stops billing at full; wear and repair NET
   on hostile worlds; foreign worlds never serve (whom-to-serve P4).

19. **Junk fields (implemented, chunk AI):** dumping cargo in the void
   (hover/idle/stranded, 5/real-day/ship [TUNE], forbidden within 50 pc
   of ANY starter) deposits junk into a 0.5 pc CELL — one field per
   cell, contributions merge, exponential 10%/day decay evaluated at
   read (no linear rate, no edge event). Within 5 pc of a black hole
   the cargo vanishes (clean sink, canon). Loitering in a junk cell
   wears the hull (15 HP/day per 30 T [TUNE-v1 interp]; no shield
   mitigates; transit crossing waits for interception P5). Supernova
   wrecks drop carcass junk (10/20/40 T by size [TUNE-v1]) plus spilled
   cargo. Collection: workshop-L2 junk collector, ONE 30 T scoop per
   24 game-hours [TUNE-v1 discretization], bounded by free containers;
   junk is a RESOURCE (new `salvage` tier, 31st catalog entry) bound
   for the recycler economy. Fields are visible under the same vision
   scopes as bodies. Migration 017 (dump_day stored as TEXT — a date
   column re-read through local TZ drifts a day).

20. **Salvage claims (implemented, chunk AJ):** ownerless derelicts
   (survival-out, GB §6 "no honor") are claimable. Claim rig
   (workshop L2, 25 steelL + 5 gold [TUNE]); claiming requires being
   STATIONARY within 1 pc [TUNE-v1] and holds for 2 game-hours [TUNE] —
   the `salvage_claimed` event re-verifies everything at expiry
   (leaving or drifting aborts; an already-claimed wreck refuses) then
   transfers ownership: the wreck becomes an owned IDLE hull, crewless
   (re-crewing still needs a dock; towing/proximity crew transfer are
   P4, announced). Wrecks are visible under the standard vision scopes
   (`derelicts` in /galaxy). moveShip cancels an in-flight claim.

21. **Stargates v1 (implemented, chunk AK):** the SAFE network path
   (GB §6). Built at an ACTIVE stargate_yard (250 cells + 400 steelH +
   100 climate crystal [TUNE]; 48 game-hours [TUNE-v1]; 1 concurrent
   build per yard level; unique pair) — v1 requires BOTH endpoints
   owned by the builder (the canonical 50/50 split with cross-player
   consent ships with its own consent flow, announced). Traversal is
   INSTANT and fuel-free: hard-gate toll from the ship's HOLD for
   non-owners (credited to the ENTRY world's stock [interp]), capacity
   1 ship/tick/direction [TUNE], exit SCATTERED U(0–15) pc via seeded
   hash(shipId, tick) — deterministic, camper-proof. Gates die with
   either endpoint (CASCADE + supernova purge). Personal ships only
   traverse toward their owner's worlds (GB §21). **50/50 consent
   (chunk AL):** a proposal pins from an active-yard world to ANOTHER
   player's world (nothing debited; 48 real-hours TTL [TUNE-v1], lazy
   sweep); only the TARGET owner responds; accepting re-verifies
   everything, pays BOTH halves (each on their own world,
   climate-resolved crystal) and starts the build. Both endpoint owners
   are toll-EXEMPT (co-payers [interp]).

### Intel tiers (implemented, chunk Q)

Planetary intel is computed SERVER-SIDE per request (no persistence —
live truth): tier = best active telescope level among owned worlds whose
combined scope covers the target (+1 once if a source world is
scientifically governed, DG §4.1 hard-cap), probe within scan range ⇒
deep sight, mere visibility ⇒ tier 1, otherwise 404 (same answer as a
nonexistent id — no existence oracle). Projection is a strict shared
WHITELIST per tier; `/galaxy` no longer leaks quality for foreign
bodies; `/planets/:id` stays owner-only even at tier 4.

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
Delivered so far (chunks A–L, see `docs/BACKLOG.md` for exact status): sim
core + full content catalog, spawn, auth/sessions, galaxy + isometric
planet views, living colony loop, levels/demolition/stats, validated
renderer lighting pass, free flight + probes + fog-of-war, the contact
protocol (pings/channels/messages, GB §5 — scope, quota and channel
membership all enforced server-side with direct-request tests), and the
physical-economy foundation (explicit landing with spaceport policy,
docked cargo load/unload with exact DG §7 container accounting), and the
first trading venue (fixed-rate market L1: slots = level, directional
pair at a posted rate, 1/min repricing, daily/absolute limits + whitelist
against the `trades` journal — all enforced server-side) plus the
merchant-world innate hospitality (GB §9: survival+fuel above a
keep-for-self floor, all-mercantile governance re-checked per trade,
reachable while merely hovering) and naval construction (shipyard L1
S+M / L2 bulk M −25% / L3 L hulls; ships born docked and empty). Test
instrumentation (§15): `TIME_SCALE` and `ATG_TEST_ENDPOINTS=1`
(/test/grant) — E2E-only, never provisioned in production
(PROD_MIGRATIONS).
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
- Row-lock ordering (chunk O, extended chunk S): new commands take BODY
  before SHIP (refuel, land — landShip moved to this order for dock
  capacity serialization), while historic commands (moveShip, undock)
  lock the ship first and may rebase a body afterwards. A rare deadlock window
  exists between a command and a worker rebase touching the same
  (body, hovering ship) pair: PostgreSQL aborts one side, the
  at-least-once event queue replays, the API surfaces a retryable
  error. Accepted for v1; revisit if observed in telemetry.
