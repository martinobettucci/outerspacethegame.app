# Population & Employment v2 — implementation plan (chunks BA → BD)

> **Persisted plan (owner rule, CLAUDE.md §5 « Persistance immédiate des
> décisions »).** The design spec is `DESIGN_GUIDE.md §3.2-v2` (canon
> `GAME_BOOK.md §10`, balancing `BALANCE_LOG.md` Round 9 → guide v0.10).
> This document is the *implementation decomposition* of that single
> spec into shippable chunks — it is an artifact in its own right, not
> conversation narration. Backlog sub-items live in `docs/BACKLOG.md`
> under **P2.pop**; this file maps them onto chunks with scope, status
> and ordering so the plan survives even if the originating
> conversation is deleted.

## Ordering rationale (why this split)

The chunks are ordered by **hard dependencies**, discovered at design
time:

1. **BA (demographics core) ships alone** — it introduces the 3-age
   pyramid, natality, death clocks and the over-capacity parabola
   *without* touching how production is scaled, so nothing existing
   breaks.
2. **BB is an indivisible block** — universal employment, `popScale`,
   the removal of `E_planet`, the starter=350 change and unemployment
   mortality **must ship together**: unemployment mortality would kill
   every existing world if only industries employed; and starter=350
   would cripple production if `E_planet` (E(0.17)≈0.32) still applied.
3. **BC (UI + clinic)** makes the mechanic legible and adds the illness
   lever. It has no back-end ordering constraint on BD.
4. **BD (settlers + extinction + intel)** closes the loop: per-category
   embarkation, ownership-strip on extinction, and reputation via
   observation.

## Chunk BA — demographics core — ✅ DONE (commit `356ee1d`)

DG §3.2-v2 a/b/c/d/h/i. Migration `022`.

- 3-age pyramid (children 20 d → actives 60 d → seniors ~30 d),
  `bodies.population` = TOTAL, `pop_children`/`pop_seniors` columns,
  actives derived; backfill to the stable pyramid.
- Weighted rations (children/seniors ×0.6); **oxygen** breathed from
  stock on hostile climates only (temperate = ambient); +20 T oxygen in
  the colony kit.
- Natality gated by an active `residential` × `M_growth`
  (`(0.5+0.5·Ē) × M_life`, ρ per life-resource — imports never feed
  growth). Ē is industries-only until BB.
- Over-capacity parabola (illness + deaths), clinic reduction hook.
- Death clocks: fixed deadlines (`clock_deadlines`), `pop_clock` event,
  water 3 d / food 10 d linear-to-deadline, oxygen instant (checked at
  the `stock_edge` zero-crossing and daily). Per-category
  death/exodus counters in `demo_counters`.
- Tests: shared 167, integration 285 (natality/aging, water clock,
  oxygen), full E2E regression 36/36.

## Chunk BB — universal employment + E_planet removed + unemployment kills — ✅ DONE (commit `bda36a8`)

DG §3.2-v2 e/f/g. Migration `023`.

- `BASE_JOBS` (exhaustive: 28 catalog buildings + clinic),
  `jobsOptimal = base × [1/2.4/5] × popScale`, `popScale =
  clamp(√(P/2000), 1, 2)` — the shifting optimum. Industries keep their
  historical optimum at `popScale=1`.
- **`E_planet` deleted**: `planetMultiplier = G`; view
  `planetEfficiency` = staff-weighted Ē (neutral 0.7); assignable
  workforce = the ACTIVES (the old 60%×pop rule is retired).
- Starter population = **350** at the stable pyramid.
- Unemployment mortality: τ on actives, 7% tolerance, 3-day
  consecutive grace (`unemp_over_days`), inert during the 14-day colony
  grace (starter included); deaths `γ(τ−0.07)×P` strike the whole
  pyramid AND decrement every building's staff (waves/momentum).
- Embarking settlers draws from actives; `/test/grant-population`
  instrumentation (§15).
- **[TUNE-v1 interp, announced]** non-industrial buildings' FUNCTION
  stays binary (active/inactive); functional gating by staffing is a
  future refinement.
- Tests: shared 171, integration 286 (unemployment wave + staff
  decrement + counters; spawn 350; colonization on matured fixtures),
  E2E green (stargates/hover-drain fixtures matured via
  `/test/grant-population`).

## Chunk BC — clinic building + stats/alarms UI — ⏳ PENDING

DG §3.2-v2 h + GB §10 UI clause. **No back-end ordering dependency.**

- **Clinic = the 29th building**: catalog entry, construction card,
  tech node (tier 2, politics-free [TUNE]), costs [TUNE], **asset stubs
  to generate** (`generate_stubs.py` → `assets/game/buildings/`,
  3 levels × base/bump/light × hot/cold overlays). Effect: illness
  index reduction −0.10/−0.20/−0.35 by level (hook already wired in BA).
- **Planet stats page** (canon GB §10 required UI): demographic pyramid
  (children/actives/seniors, with the consuming-but-idle share shown),
  employment vs unemployment rate, illness, natality factors (Ē,
  M_life), and **net production per resource per day (+ and −)** — this
  folds in the owner's 2026-07-19 « stats nettes/jour » directive
  (BACKLOG line for « production NETTE par ressource/jour »).
- **Death-clock alarms**: projected dates + loud UI when a survival
  stock trends to zero (inverse of the deposit projected-dry-date
  pattern); oxygen alarm fires far in advance (binary outcome).
- Tests: shared/unit for clinic catalog + illness reduction;
  integration for clinic effect on illness deaths; **E2E visual**
  (pyramid, employment, net-production, alarm) with observed captures
  (§16).

## Chunk BD — per-category settlers + extinction + intel — ⏳ PENDING

DG §3.2-v2 j/k + GB §10 observability clause.

- **Per-category embarkation**: pick children/actives/seniors counts
  explicitly (extends the §12 settlers flow + the seed). No moral
  guardrails (« no honor »); the counterweight is intel (below).
- **Extinction = ownership strip**: `population = 0` → planet reverts to
  wild **keeping its buildings and tech unlocks** (recolonizer's
  windfall), installed governors die (host-fate), colony grace applies
  to the newcomer. (BA's `wipePopulation` currently leaves the planet
  owned-but-empty — BD adds the strip.) Watch: siege→starvation→
  extinction→recolonization is a plunder-free slow conquest — flag to
  P5.
- **Intel**: per-category deaths/exodus (from `demo_counters`) visible
  at telescope tier ≥ 3 [TUNE] — reputation emerges from observation.
- **Seed**: demo-mix at spawn/colony landing; per-category demo data in
  the dev seed contract.
- Tests: unit (embarkation split, extinction strip), integration
  (ownership revert + buildings preserved + governor host-fate; intel
  exposure with §10 direct refusals), E2E (embark-by-category UI;
  extinction→recolonize; intel read).

## Not part of this plan — the SUSPENDED QUEUE (resume after BD)

Four 2026-07-19 owner directives were **suspended** to prioritise pop v2.
They are neither dropped nor absorbed — **resume after chunk BD**. The
authoritative, persisted list is the « ⏸ FILE SUSPENDUE » block in
`docs/BACKLOG.md` (P2 section); mirrored here so the plan is
self-contained:

- **Chunk AO** — card-hand v2 (filtered hand + folded fan, hover-to-front).
- **Telescope = building on a tile** (canon change; probe-pad fate to be
  decided by the owner) + asset stubs.
- **Net production per resource/day** on the stats page — raised
  standalone; **BC's stats page addresses it**, to be confirmed against
  the directive when BC lands.
- **Recruitment** — explain the « account < 45 days » refusal in the UI.
