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
| `bodies` | planets, stars, black holes | planet: size/climate/quality/tiles/owner/population(+illness, daily materialization); star: class/fuel_type/hidden stock/`r_nova`; spatial index on 64 pc grid (DG §9.2) |
| `deposits` | finite per-planet deposits | lazy `(amount_t, rate_t_per_day, as_of)`; dry-forever at 0 (GB §3) |
| `planet_stock` | ready fungible stock per planet | lazy; capped by base allowance + depots (DG §3.3b) at evaluation |
| `buildings` | placed instances | `status ∈ constructing/active/demolishing`, `completes_at`, one tile per building (`UNIQUE(body_id, tile_index)`), `recipe` for industry, `run_pct`, `workforce` |
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

## Rollback

Development-only baseline: rollback = `pnpm resetDb` (drop volume, re-migrate,
re-seed). Once staging/production exist, each migration must ship its
documented down-path or an explicit "irreversible" statement
(`PROD_MIGRATIONS.md`).
