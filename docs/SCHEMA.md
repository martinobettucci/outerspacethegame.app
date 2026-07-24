# SCHEMA — PostgreSQL authoritative schema (ATG)

> Source of truth for the applied schema: `game/packages/server/migrations/`
> (SQL, versioned, transactional). This document explains the DESIGN — the
> conventions and the why — and is updated in the same chunk as any
> migration (CLAUDE.md §24). Aggregate overview: `docs/DAT.md` §3.

## Conventions

- **Lazy quantities `(value, rate, t0)`** (DG §1): every continuous quantity
  is stored as `(amount, rate_per_day, as_of)` and evaluated on read with
  `evalLazy` (`server/src/sim/lazy.ts`). The tick worker only materializes
  at event boundaries (`rebase`). API and worker share the same code — the
  determinism guarantee is structural (single implementation, single V8).
- **Event queue** (`events`): priority = `(due_at, id)`; claim via
  `FOR UPDATE SKIP LOCKED` (multi-worker safe); handlers are idempotent
  (at-least-once semantics on crash-resume).
- **Generation randomness** is never stored as state: bodies carry a `seed`
  (text) and every roll derives from it deterministically (`@atg/shared`
  `SeededStream`) — tech DNA is *recomputed*, never persisted (GB §18).
- **Hidden information stays server-side**: `bodies.star_fuel_stock` is
  never exposed by any API (GB §22 — no gauge; only the <5% flare event is
  public). Same discipline applies to future private-warehouse contents.
- Quantities are `double precision` (tons/units); money does not exist.

## Tables (001_baseline)

| Table | Purpose | Notes |
|---|---|---|
| `players` | account, politics archetype | politics = personal-ship identity (GB §21) |
| `sessions` | server-side auth sessions | token stored hashed |
| `bodies` | planets, stars, black holes | planet: size/climate/quality/tiles/owner/population TOTALE + pyramide v2 (`pop_children`/`pop_seniors`, actives dérivés — DG §3.2-v2), illness, `clock_deadlines` (horloges de mort, échéances fixes), `demo_counters` (morts/exodés par catégorie, intel BD); star: class/fuel_type/hidden stock/`r_nova`; spatial index on 64 pc grid (DG §9.2) |
| `deposits` | finite per-planet deposits | lazy `(amount_t, rate_t_per_day, as_of)`; dry-forever at 0 (GB §3) |
| `planet_stock` | ready fungible stock per planet | lazy; capped by base allowance + depots (DG §3.3b) at evaluation |
| `buildings` | placed instances | `status ∈ constructing/active/demolishing`, `completes_at`; one tile per building (`UNIQUE(body_id, tile_index)`) except tile-free `probe_pad`; `recipe` for industry, `run_pct`, `workforce` |
| `tech_unlocks` | per-planet unlocked nodes | unlock = permanent knowledge (GB §18) |
| `npcs` | characters | people/role/rarity + individual `stat_rolls` (GB §12), binding host, account-bind timer |
| `ships` | hulls incl. personal & probe | tanks/survival/cargo as jsonb v0; missions arrive in P3 |
| `events` | simulation event queue | partial index on unprocessed |
| `schema_migrations` | migration ledger | managed by the runner |

## 002_ship_missions (free flight, GB §6)

`ships` gains mission columns — one straight segment per flight, position
derived lazily at read time (pure interpolation, nothing ticks per frame):
`origin_x/y`, `dest_x/y`, `dest_body_id`, `departed_at`, `arrives_at`,
`speed_pc_per_day`; status gains `idle` (stopped in the void — distinct
from `stranded` = out of fuel). Partial index `ships_transit (arrives_at)
WHERE status='transit'` feeds the arrival scheduler.

## 003_pings_channels (the Silence protocol, GB §5)

| Table | Purpose | Notes |
|---|---|---|
| `pings` | hails (contact requests) | `status ∈ sent/answered/ignored`; partial index on pending per recipient; `(from_player, created_at)` index backs the daily quota |
| `channels` | 1↔1 conversation, opened by ping-back only | canonical pair: `CHECK (player_a < player_b)` + `UNIQUE` — one channel per couple regardless of who answered |
| `messages` | channel messages | `bigserial` id = stable ordering; `CHECK char_length(body) BETWEEN 1 AND 2000` mirrors `normalizeMessageBody` |

No unilateral contact exists at the schema level: nothing references a
channel except through the canonical pair, and the only writer of
`channels` is the ping-back service path.

## 004_landing_cargo (landing & carriage, GB §9 / DG §7)

- `ships.hover_body_id` — arrival keeps the body under the hull; landing
  is an explicit command (`docked` ⇄ `hovering` moves the reference
  between `docked_body_id` and `hover_body_id`; departure clears both).
- `buildings.config jsonb` — per-building configuration: today the
  spaceport landing policy (`{"landing": "self"|"everyone"}`, default
  self); market trade slots will live here next. Cargo itself needs no
  schema change: `ships.cargo` (jsonb, tons per resource) existed since
  001; capacity is enforced in code via `containersUsed` (1 container =
  1 T of one fungible, partial tons monopolize — mirrors DG §7).

## 005_market_trades (fixed-rate market L1, GB §9/§13)

`trades` — append-only journal of executed swaps (`market_building_id`,
`slot_index`, trader, gave/got resource+tons). Slot configuration lives in
`buildings.config.slots` (jsonb from 004): a slot is DIRECTIONAL (market
buys `give`, pays `get` at the posted rate — the rate IS the price, no
separate fee in fixed mode [TUNE-v1]). Daily/absolute slot limits are
enforced by summing this journal (`trades_slot_day` index); physicality is
code-enforced: trader's ship must be docked on the market's planet, cargo
containers and planet storage cap both checked, planet pays only from
evaluated stock.

## 006_innate_trading (merchant-world hospitality, GB §9)

- `bodies.config jsonb` — per-body configuration; today the innate offers
  of a merchant world (`innateOffers`: sell/want/price/keepFloorT). Offers
  are stored data but only SERVED while governance stays all-mercantile
  (re-checked at read and trade time).
- `trades.market_building_id` becomes nullable: innate trades journal with
  a NULL building and `slot_index = -1` — every trade flow feeds the same
  ledger (future census reads one table).

## 007_colonization (settlers & the second planet, GB §19/§12, DG §3.2/§12)

- `ships.settlers int` (CHECK ≥ 0), `ships.settlers_origin_body_id uuid
  REFERENCES bodies` (one origin per load — the toll is a property of the
  ROUTE), `ships.colony_kit boolean` — the fitting that turns a Civil M/L
  into a one-shot colony ship.
- `ships.status` gains `'colonizing'` (establishment window; the hull is
  consumed by the `colony_established` event).
- `settler_routes` — deterministic-toll accumulator per (origin, dest)
  pair: `loss_carry` (CHECK 0 ≤ x < 1) carries the fractional expectation
  so sub-20 cohorts still pay over time (DG §3.2, "no free sub-20
  cohorts"). Expectation is quantized to 1e-9 in code before flooring —
  the toll must not depend on IEEE dust.

## 008_hover_drain (loitering drains & stranding, GB §7/§13, DG §3.5)

- `ships.fuel_rate_u_per_day` + `ships.fuel_as_of` — the tank becomes a
  LAZY quantity (amount stays in `ships.fuel` jsonb, mono-type v1):
  hovering/idle hulls burn 0.2/0.4/0.8 u/day (S/M/L [TUNE]) continuously.
  Hovering over your OWN world drains the planet's `fuel_<type>` stock
  instead (GB §7 — resupply round-trips), computed inside the planet's
  rate rebase; the ship's tank is then frozen (rate 0).
- `ships_hover` index — aggregating an owner's hovering hulls per body at
  rebase time.
- Edge event `ship_fuel_out` (events table, no schema change): purge +
  reschedule on every tank rebase (same pattern as `stock_edge`); firing
  with an empty tank flips the hull to `stranded` (status existed since
  001). Recovery paths: `refuel` from an owned world below, or
  ship-to-ship `transfer-fuel` within 1 pc [TUNE-GAP].

## 009_census (global supply census, GB §13, DG §11.5)

- `census_snapshots` — per-resource totals taken CENSUS_PER_DAY times a
  game day [TUNE] by the recurring `census_run` event (no cron; the
  worker re-seeds the chain at boot, idempotent). `totals` keeps the
  per-source breakdown (planet stock vs ship cargo) INTERNAL — for
  debugging and future server-side valuations (plunder, bonds); the API
  publishes `totalT` only, never any breakdown. `meta.sources` records
  which sources were counted (pools/escrow join with their chunks — the
  gap is written into every snapshot).

## 010_pods (recruitment pods, GB §12/§13, DG §11.4)

- `pod_openings` — append-only journal of pod purchases: enforces the
  daily cap (10/account [TUNE]) and feeds the IMMEDIATE price impact
  (tons paid since the last census snapshot are subtracted from S_r
  before pricing). The rolled NPC lands in `npcs` with
  `account_bound_until` = opening + 60 days [TUNE] (column existed since
  001) — recruitment is a sink, not a mint.

The authenticated pricing projection also carries the current player's
age-gate status (`eligible`, minimum age and ISO unlock date). It is a UI aid,
not authorization: `POST /pods/open` rechecks the locked player row at the
exact command time.

## 011_docks (spaceport dock counts & dwell eviction, GB §9/§14, DG §5.1/§8.6)

- `ships.docked_at timestamptz` — timestamp of the LAST landing. The
  `dock_eviction` event carries `landedAtMs` and only evicts when
  `docked_at` still matches: undock + re-land reschedules its own
  eviction and silently expires the old one (idempotence guard). Also
  feeds the UI ("docked since"). Backfilled to `now()` for hulls already
  docked at migration time (display-only approximation — no retroactive
  eviction exists for them). Dock capacity itself needs no schema:
  counts derive from active spaceport levels, per-port `dwellHours` /
  `reservedForSelf` live in `buildings.config` (jsonb, 004 pattern).

## 012_manual_offers (manual trade channel, GB §9 / DG §6 round 7)

- `manual_offers` — buyer's manual purchase offers on a world's browsable
  stock: pins the buyer's DOCKED ship (`ship_id`) so acceptance settles
  physically (planet stock ↔ that ship's cargo, still docked); status
  lifecycle open → accepted/declined/expired/cancelled, `expires_at` =
  created + 48 REAL hours [TUNE] (lazy sweep on read — no event needed,
  expiry has no side effects). Partial index on open offers per body
  (seller inbox), (buyer, created_at) index for the 20/24 h creation
  window. Warehouse public/private visibility lives in `buildings.config`
  (004 pattern) — no dedicated schema.

## 013_retool (industry retooling, DG §5.1)

- `buildings.status` gains `retooling`: production pauses while the new
  recipe (written immediately) awaits `retool_complete`; the rebase only
  counts ACTIVE industries, so no other schema is needed. The
  Industrialist instant-switch window lives in `buildings.config`
  (`lastInstantRetoolMs`, 004 pattern).

## 014_survival (death clocks & derelict, GB §6 / DG §3.5)

- `ships.owner_id` becomes NULLABLE: survival-out STRIPS ownership — a
  derelict is an ownerless salvageable wreck (claims arrive with items).
- `ships.survival_rate_t_per_day` + `survival_as_of`: lazy survival
  stores (single rate applied to both food and water in the `survival`
  jsonb, 008 fuel pattern); edges live in the events queue
  (survival_low / survival_out).
- `ships.flee_armed boolean DEFAULT true`: the anti-extortion
  auto-flee-home policy (DG §3.5), disarmable per ship.

## 015_harvest.sql (chunk AF)

- `ships.harvest_rig boolean NOT NULL DEFAULT false` — accessoire monté.
- `ships.harvesting_star_id uuid REFERENCES bodies(id)` — récolte en cours
  (index partiel `ships_harvesting`).
- `bodies.star_fuel_rate_u_per_day / star_fuel_as_of` — stock d'étoile
  PARESSEUX (Σ rendements des récolteurs).
- `bodies.star_fuel_initial` — stock initial CACHÉ (seuil du flare 5 %).

## 016_wear.sql (chunk AG)

- `ships.hull_hp / hull_wear_hp_per_day / hull_as_of` — HP de coque
  PARESSEUX (NULL = coque neuve ; plancher 1 HP, aucun bord).
- `ships.shield_hot / shield_cold / shield_radio` — boucliers d'atelier.

## 017_junk.sql (chunk AI)

- `junk_fields` — un champ par CELLULE de 0,5 pc (UNIQUE cell_x, cell_y),
  tonnage à décroissance exponentielle 10 %/j (amount_t + as_of, évalué à
  la lecture), created_by (attribution L3 future).
- `ships.junk_collector` — accessoire d'atelier L2.
- `ships.dump_day (text) / dump_count` — quota 5 largages/jour réel
  (jour UTC en TEXTE : une colonne date re-lue dérive selon la TZ).
- `ships.last_junk_scoop` — cooldown du scoop (24 h-jeu).

## 018_claim.sql (chunk AJ)

- `ships.claim_rig` — accessoire d'atelier L2 (réclamation d'épaves).
- `ships.claiming_target_id` — épave en cours de réclamation
  (ON DELETE SET NULL : une cible annihilée retombe proprement).

## 019_stargates.sql (chunk AK)

- `stargates` — paire d'endpoints UNIQUE (CASCADE : le gate meurt avec un
  endpoint supprimé ; l'annihilation purge explicitement), statut
  building/active, péage (resource + amount), horodatage par direction
  (capacité 1/tick/direction).

## 020_stargate_proposals.sql (chunk AL)

- `stargate_proposals` — consentement 50/50 (canon) : proposition
  épinglée (open/accepted/declined/cancelled/expired), TTL 48 h réelles
  balayé paresseusement ; l'acceptation paie les deux moitiés et crée le
  gate (table stargates).

## 021_auto_trade.sql (chunk AM)

- `ships.auto_trade (jsonb)` — règles d'auto-trade du survol étranger
  ({resource, belowT, buyT} × 3 max [TUNE-v1]) ; évaluation paresseuse
  par l'événement auto_trade_check.

## 022_pop_v2.sql (chunk BA)

- `bodies.pop_children` / `pop_seniors` ventilent le total `population` ; les
  actifs restent dérivés. Le backfill applique la pyramide stationnaire v2.
- `clock_deadlines` porte les échéances fixes eau/vivres et `demo_counters`
  les morts/départs C/A/S cumulés destinés à l'intel.

## 023_pop_v2_unemployment.sql (chunk BB)

- `bodies.unemp_over_days` accumule les jours consécutifs au-dessus de la
  tolérance de chômage avant les vagues de mortalité.

## 024_pop_v2_settler_categories.sql (chunk BD)

- `ships.settlers_children/actives/seniors` matérialisent le manifeste ; la
  contrainte `ships_settler_manifest_total` garantit que leur somme égale
  toujours le total historique `settlers`. Le backfill fidèle place les
  settlers antérieurs dans la seule catégorie alors embarquable : actifs.

## 025_telescope_tile.sql (unique surface telescope, owner decision 2026-07-20)

- Existing single telescope rows receive the lowest available surface tile,
  deterministically. The migration aborts with an explicit diagnostic if a
  legacy planet has multiple telescopes or no free tile; it never deletes a
  player asset, expands a planet or chooses silently between duplicates.
- A partial unique index enforces one telescope per body. A tile-contract
  check makes `probe_pad` the only building allowed to keep `tile_index NULL`;
  all telescope and ordinary-building writes require a tile.
- Rollback is manual and preproduction-only: drop the index/check and set
  telescope tile indices back to NULL. That loses chosen board positions, so
  no automatic down migration can be lossless.

## 041_colony_reform (anti-soft-lock colonizer, GB §18/§19.3/§12, DG §5/§6/§12, owner decision 2026-07-24)

- `bodies.free_colonizer_granted boolean NOT NULL DEFAULT false` — the persisted
  once-ever flag. Set true when the world is first granted its **free colonizer
  accessory** (active spaceport L1 + `colony_program` unlocked). A demolish/
  rebuild never re-grants; the flag **rides with the world through ownership
  transfer** (conquest/trade), so a conquered world that already spent its free
  colonizer receives no new one. Down: `ALTER TABLE bodies DROP COLUMN
  free_colonizer_granted`.
- **No other schema change.** The rest of the reform is code, not data:
  - `spaceport_S` joins the **never-seed-masked** set in `techtree.ts` — DNA is a
    pure function of `(DAG, seed)` recomputed at read time (no stored tree), so
    making the base spaceport universal needs **no migration**.
  - The **colonizer accessory** is a new item key in the `@atg/shared` catalog,
    carried in the existing `ships.item_cargo` (migration 039) and held in
    `planet_items` (migration 031) — **no new table/column**.
  - The **spaceport colonizer recipe** (producer `spaceport`, minLevel 1,
    basics-only deposit-biased cost) lives in `recipes.ts`; the retired
    workshop-L2 terraform-core recipe is removed there.
  - `ships.colony_kit` (migration 007) is **superseded**: colonize eligibility
    now checks the hull carries a colonizer accessory item, not the boolean
    fitting. The column is left in place for a later cleanup (documented, not
    dropped here).
- **Dev backfill note.** Preproduction only; no deployed DB. On reseed the rule
  applies naturally. On an already-simulated dev DB, existing spaceport worlds
  mint one free colonizer on the next grant check (acceptable — dev data is
  reseedable, CLAUDE.md §8); a stricter backfill (`free_colonizer_granted = true`
  for bodies with an active spaceport at migration time) is available if a
  no-retro-grant dev run is wanted.

## Rollback

Development-only baseline: rollback = `pnpm resetDb` (drop volume, re-migrate,
re-seed). Once staging/production exist, each migration must ship its
documented down-path or an explicit "irreversible" statement
(`docs/PROD_MIGRATIONS.md`). Migration 025's specific non-lossless board-position
rollback is documented in its own section above.
