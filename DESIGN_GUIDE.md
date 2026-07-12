# ACROSS THE GALAXIES — Design Guide (mechanics, formulae, workflows)

> **What this document is.** The complete mechanical specification: every
> system with concrete rules, numbers and formulae, plus the workflows and
> expected behaviors around them. It implements the decision canon in
> `GAMEBOOK.md` and the world in `GAME_BIBLE.md`.
>
> **Version v0.9** — governance specializations, full-diplo sanctuary, NPC stat rolls (owner) + rounds 1–2 system patches + round-4 content patches +
> the **build ≠ install** keystone (owner canon; supersedes 4b-F7b) — see
> `BALANCE_LOG.md`.
>
> **Convention:** every invented number/formula is tagged **[TUNE]** — a
> deliberate, visible placeholder, simulation-tested but not sacred. Untagged
> rules are canon. Changes here must not contradict `GAMEBOOK.md`; if they
> must, change the GAMEBOOK first.

---

## 0. Units & global constants

| Thing | Unit | Notes |
|---|---|---|
| Distance | **parsec (pc)** | 1 coordinate unit = 1 pc; universe is a 2D plane |
| Time | **tick = 60 s** [TUNE] | all simulation math is per-tick; UI shows human time |
| Game day | = **1 real day** | travel of "3 days" is 3 real days (canon: temporal combat risk) |
| Mass | **ton (T)** | 1 container = 1 T of one fungible, or 1 large item |
| Fuel | **unit (u), 1 u = 1 T** | propulsion fuel is haulable/tradeable like any fungible |
| Population | persons | integer |
| BPS_BASE | 10 000 | percentages stored in basis points (inherited convention) |

Universe size: coordinates in **[0, 1 000 000)²** pc [TUNE], sparse.
Densities: ~1 body per 2 500 pc² in settled belts, ~1 per 40 000 pc² in the
deep void [TUNE].

---

## 1. Time & simulation model

- **Authoritative tick worker** advances the world every tick. All continuous
  quantities (production, travel, population, depletion, hover burn) are
  stored as `(value, rate, t0)` and **lazily evaluated on read**; the worker
  only materializes state when an **event** fires.
- **Event queue** (priority by due-time): arrival, interception window entry,
  deposit-dry, tank-dry, survival-dry, auction close, construction complete,
  unlock complete, loot-price recompute, supernova, star-flare, NFT-packing
  complete, mission step boundaries.
- **Catch-up:** on player load, all their entities lazily evaluate to *now*.
  Nothing requires per-entity per-tick writes.
- **Determinism:** given the same DB state and event order, re-evaluation is
  bit-identical. The only randomness happens at **generation moments** (planet
  roll, pod open, tile roll) using a server-side seeded RNG; live play
  (combat, production, travel, settler losses) is fully deterministic. (Canon.)

**Expected behavior:** a player who logs off for a week returns to find
missions executed, stocks moved, populations grown/shrunk, and an inbox of
alerts — with zero simulation drift vs. a player who watched live.

---

## 2. Universe generation & new-player spawn

### 2.1 Body generation
Each body: `type ∈ {planet, uninhabited_planet, star, black_hole}`, position,
`seed` (uint256, the DNA — drives every roll below deterministically).

Planet rolls from `seed`:
- **Size:** small 50% / medium 35% / large 15% [TUNE]
- **Climate:** temperate 40% / hot 25% / cold 25% / poison 10% [TUNE]
- **Quality:** F 40% / E 25% / D 16% / C 10% / B 6% / A 3% [TUNE]
- **Tiles:** small 4–8, medium 6–12, large 10–20 (uniform in range; canon)
- **Deposits & tech-DNA:** §3.3, §5.
- Poison ⇒ **0 buildable tiles** (harvest-only; canon).

Star rolls: fuel type (cold/hot/gas), size class S/M/L, hidden fuel stock
`F0 = 5e6 × sizeMult × U(0.5, 1.5)` units, sizeMult ∈ {1, 4, 16} [TUNE].
**Supernova radius** `R_nova = 40 × sizeMult^(1/3)` pc [TUNE]. L-class stars
leave a **black hole** on Starfall; S/M leave nothing.
**Flare warning:** below **5% stock** a star visibly flares — a public event
for anyone with scope on it [TUNE]. (The only gauge the universe ever gives.)

### 2.2 New-player spawn (the Fermi pocket)
1. Find a region ≥ **150 pc** [TUNE] from any *active* player asset and
   ≥ `R_nova` of every star (canon: starter is supernova-safe), such that:
   **≥1 star ≤ 40 pc**, **≥2 uninhabited planets ≤ 60 pc**, and **≥1 active
   player asset within 150–240 pc** [TUNE] — inside a stock Cargo-S's fuel
   range, so the guaranteed neighbor is always physically reachable.
2. Generate the **starter planet**: temperate, quality D–F, small or medium,
   **≥10 tiles** [TUNE — overrides the size roll; the full T1 chain must
   fit], guaranteed deposits **{ore, carbon, hydrogen, oxygen, silicon,
   climate crystal, and one of lithium|gold}** [TUNE], and the **starter
   guarantee**: extractable value ≥ cost(telescope) + cost(probe) + 25% spare
   (canon).
3. Grant starter stock: `{ore 60, carbon 40, silicon 30, hydrogen 20, oxygen
   20, food 30, water 30}` T ×U(1.0, 1.3) [TUNE] + **150 u propulsion fuel
   matched to the nearest star's type** [TUNE].
4. Starting population: **1 200** [TUNE] (u = 0.6 on a small-F cap ⇒ E_planet
   ≈ 0.95 — new colonies start *healthy*). Personal ship docked. 1 free small
   Cargo hull (unupgraded) + **1 Common pilot NPC** [TUNE].

**Purchased planets** spawn *as near as feasible* to the buyer's centroid with
the same generator; distance draw `d ~ 50 × LogNormal(0, 0.6)` pc [TUNE] —
usually close, occasionally far (canon: "bad luck or good luck").

**Anti-abuse:** starter planets are **account-bound for 45 days** [TUNE]
(non-tradeable, non-extractable to NFT) and **cannot be conquered while it is
the owner's only planet**. Free accounts get exactly one starter, ever.
Accounts **< 45 days old cannot buy recruitment pods or mint NFTs** (§11.4,
§14). Assets of accounts **< 14 days old cannot be engaged in combat unless
they fire first** — but this shield **voids beyond 100 pc of the account's
starter planet, and on any inter-account cargo transfer** [TUNE] (no
invulnerable scouts or mules).

---

## 3. Planets

### 3.1 Attributes
`size, climate, quality, tiles[], deposits{}, population, popCap, techDNA,
governors[], buildings[], stargates[], owner, factionBanner`.

### 3.2 Population
- **Cap:** `popCap = base(size) × qMult(quality)`;
  base: small 2 000 / medium 12 000 / large 60 000;
  qMult: F 1.0, E 1.3, D 1.7, C 2.2, B 3.0, A 4.0 [TUNE].
- **Growth (per day):** `ΔP = r × P × (1 − P/popCap) × H − illnessDeaths`
  - `r = 0.05` [TUNE]
  - **Habitability** `H = min(foodSat, waterSat) × (0.8 + 0.2 × medSat)`
    [TUNE] — food/water hard-gate, medicine boosts (and gates illness, below).
    Sat = `min(1, dailyConsumptionMet/need)`; needs per 1 000 pop per day:
    food 1 T, water 1 T, medicine 0.1 T [TUNE].
- **Illness:** crowding `u = P/popCap`; illness index `I ∈ [0,1]`:
  `dI/day = 1.5 × max(0, u − 0.9) − 0.05 × I` [TUNE], ×2 growth while
  medSat < 1. `illnessDeaths/day = 0.03 × I × P` [TUNE].
- **Settlers:** population moves only by **Civil ship**; loading/unloading
  needs a spaceport on inhabited worlds (colonization: §12). **Trip risk**
  `= 5% base − 2% × civilPilotLevel (0–2), min 0` [TUNE]; losses are computed
  with a **fractional accumulator per route** — route = the persistent
  (origin, destination) planet pair — so deaths carry over between cohorts
  (no free sub-20 cohorts). Deterministic, a known toll, not dice.

### 3.3 Deposits & depletion
Each planet rolls 3–7 deposits [TUNE] from its seed (starter minimums: §2.2):
- Basic materials: all twelve mineable at **trace level** (below), but only
  *deposited* ones support industrial mining.
- Crystal deposit: matches climate; poison worlds always roll a Nox deposit.
- **Deposit stock:** `S0 = 2 000 × sizeMult × qMult × U(0.6, 1.4)` T,
  sizeMult ∈ {1, 3, 10} [TUNE].
- **Extraction:** a mine extracts `rate = baseRate(level) × E × runPct`/day; **max 1 extractor/mine per deposit** (no stacking on one vein);
  baseRate: basic mine 10/20/40 T/day [TUNE]; crystal extractor **8/16/32**
  T/day [TUNE].
- Deposit hits 0 ⇒ **dry forever** (canon). UI must show projected dry date.
- **Trace mining** (no deposit): flat **2 T/day** [TUNE], exempt from
  efficiency — a bootstrap floor, never an industry.

### 3.3b Fungible storage caps (depots) — sim-derived, round 6b
The planet's **ready** fungible stock is capped by **base allowance +
depots**. All numbers below were derived by the round-6b storage study
(owner directive) [TUNE]:
- **Base free allowance (the "plancher", no building): S 800 / M 1 000 /
  L 1 200 T** — mandatory: without it the starter spawns over-cap (mines
  halted day 0) and the 10-tile budget breaks.
- **Depot ladder: +200/400/600 T** per instance (1 tile; L1 10 ore, level-up
  L2 30 ore + 10 steelL, L3 60 ore + 30 steelL) — tiles, not ore, are the
  real price; at maturity each depot-L3 tile buys ≈ +2 days of logistics
  slack; **depots double as siege endurance** (blockade pressure: starter
  24 d, active hub ~9 d — the 1–2-week target).
- **One-sided brake (never punish low stock):** production throttle = **1
  for u ≤ 0.7**, the right branch of E(u) above 0.7, **halt at u ≥ 1** —
  a freshly emptied hub must never throttle its own mines.
- **Fuel shares the cap** (1 u = 1 T, no separate tankage); ship tanks and
  parked freighters are the legitimate overflow valve.
- **AMM pool reserves COUNT against the cap** (they are physical planet
  stock) — deep-liquidity market worlds must build depot farms (Mercantile
  specialization). **Swaps/deliveries may overfill (physics); only
  production halts at cap.**
- Starter compatibility: worst-roll grant = 449 T → u 0.56 with zero
  buildings; the round-3 colony window (32–45 d) holds with exactly 1 depot
  leveled by ~d20.

### 3.4 Efficiency (the tilted bell) — THE formula
Every producing/consuming unit has an efficiency `E ∈ [0.12, 1]`:

```
E(u) = max(0.12, exp( −(u−μ)² / (2σ(u)²) ))
μ = 0.70          # the sweet spot: ~70% utilization [TUNE]
σ(u) = 0.35 if u < μ (forgiving when under-used)
     = 0.15 if u ≥ μ (punishing when crammed)      [TUNE]
```

`u` is the **domain utilization** relevant to the unit:
- Mines/industry: `u = workforceAssigned / workforceOptimal`;
  workforceOptimal per level = 50/120/250 [TUNE]; assignable workforce ≤
  population × 60% [TUNE].
- Storage-sensitive units (markets, depots): `u = stockHeld / stockCap`.
- Planet-wide: `E_planet = E(P/popCap)` (starter pop 1 200 ⇒ ≈ 0.95).
- **Effective efficiency = E_unit × E_planet × G** (G = governance §4);
  industry additionally applies the player throttle `runPct`.

**Expected behavior/UI (canon):** every resource/unit view renders its curve
with the live position marked; the per-planet stats page lists every unit,
its `u`, `E`, and the dominant limiting factor ("overcrowded", "understaffed",
"warehouse 97% full").

### 3.5 Hovering
Ships in orbit burn upkeep: `idle fuel 0.2 u/day × sizeMult(1/2/4)`, survival
per crew member per day: 0.01 T food+water each [TUNE].
- Over **own planet**: drained from planet stock (canon).
- Over **foreign planet**: drained from ship stock; ship may run auto-trade
  policies against the local market (canon). **Default policy bounds:**
  auto-buy refuses prices > 3× the census median [TUNE]; a survival-dry
  alarm fires at 25% remaining with a default **auto-flee-home** policy armed
  (owners can disarm). (Anti survival-extortion.)

---

## 4. Governance

### 4.1 Archetypes & masks
Six politics (personal-ship choice at start uses the same set):

| Archetype | Allows (beyond common) | Denies |
|---|---|---|
| **Militarist** | military branch, ground units, weapon foundries, conquest ops | casino, diplomatic district |
| **Industrialist** | heavy industry, advanced refineries, artificial-planet yard | casino |
| **Mercantile** | marketplace T2+, casino, toll routes, auction house | military branch |
| **Scientific** | research centers, labs T2+, scanner/probe advanced tech | casino, military T3+ |
| **Civic** | residential T2+, medicine, terraforming, settler programs | weapon foundries |
| **Diplomatic** | diplomatic district, faction HQ, shared-route treaties, embassy | military T3+ |

Common set (any politics): T0–T1 basics, spaceport, workshop, basic market,
basic mine/refinery, **harvest accessory crafting** (§8.8 — the fuel economy
is never politics-gated). [TUNE: exact matrix lives in data.]

- Small planet: no governor → mask = common set, *unless* the personal ship is
  parked there (then = your archetype's mask).
- Medium: 1 governor. Large: 3 governors or ×0.5 efficiency (canon).
- **Effective mask = intersection of all governors present** (canon).
- **G multiplier:** fully governed = 1.0; large with 1–2 governors = 0.5
  (canon); +2% per rarity tier of the lowest-tier governor [TUNE].
- **Preview (canon):** the governance screen simulates any candidate set and
  renders the resulting allow/deny mask *before* the irreversible install.
- **Disclosure:** any trade/auction listing of a planet **must render its
  effective governance mask** (anti poisoned-world sales).
- **Conquest transfers planet-bound governors with the world** (§10.3) — they
  serve the *world*, not the owner. Permanence is not launderable.
- **Innate privileges (owner canon, per archetype) [TUNE values]:**
  - Militarist: unit/weapon production monopoly (§5.1) + conquest ops.
  - Mercantile: innate survival+fuel trading w/ keep-floor (§11.2).
  - Industrialist *forge world*: **retool 24 h → instant; build & production
    times −25%**.
  - Scientific *deep sight*: telescope/probe scans reveal **tech-DNA branches,
    deposits and quality** of scanned planets (**+1 intel tier** on §9.2's
    L1/L2/L3 ladder); scan results are shareable/sellable like telescope
    shares.
  - Civic *haven world*: illness decay **×2**; settler accident risk **÷2**
    on departure AND arrival legs; **zero landing wear for all visitors**.
  - Diplomatic *neutral ground*: docking + trading **without established
    contact** (no ping-back needed — localized exception); hosts
    **multi-party chat channels** (mediation).
- **Full-diplomatic sanctuary:** ALL governors Diplomats (1/medium, 3/large)
  ⇒ **no hostile action can be initiated in the planet's orbit or ground**,
  and the planet is **unconquerable** (changes hands by trade only). Ships
  become attackable again the moment they leave the sanctuary zone. Cost:
  military branch foreclosed forever + full permanent-governor commitment.
- **Same-type stacking:** N governors of the same archetype **stack the
  archetype's planetary stat advantages** (privilege magnitudes scale; e.g.
  forge-world −25% → −40% → −50% at ×2/×3 [TUNE]; sanctuary requires
  full-diplo regardless).

### 4.2 NPC roles
Roles: **pilot**, **engineer**, **merchant**, **diplomat**, **soldier**,
**scientist** — bonuses per §11.4; governor-grade = rarity Rare+, role maps to
archetype (pilot→Civic, soldier→Militarist, merchant→Mercantile,
scientist→Scientific, engineer→Industrialist, diplomat→Diplomatic) [TUNE].
**People (human / Forged / Vess) is cosmetic and orthogonal to role: any
people can hold any role, any rarity, and govern** (canon, GAMEBOOK §12).
Civil pilots: settler-risk −2%/level (crew) or landing-wear waiver (governor).

---

## 5. Tech tree (v0 content)

Structure per canon §18. **Placement cost = 50% of unlock cost** unless stated
[TUNE]. Telescope, probe_pad, depot, mine_basic, **colony_program** are
**never seed-masked** [colony added in v0.2 — free expansion must never be
seed-locked].

**T0 (universal, tile-free where noted)**
- `telescope` — none — 20 ore, 10 silicon — **+200 pc scope/level, max 3**
  [TUNE]; **occupies no tile** (infrastructure)
- `probe_pad` — none — 15 ore, 10 carbon — builds probes; **no tile**
- `depot` — none — 10 ore — +200 T storage/level
- `mine_basic` — none — 15 ore — extracts basic deposits

**T1 (common mask)**
- `spaceport_S` — depot — 40 ore, 20 steelL — small docks ×2
- `workshop` — mine_basic — 30 ore, 10 silicon — repairs; crafts harvest &
  utility accessories (§8.8)
- `market` — depot — 25 ore, 10 carbon — trading post (§11)
- `residential` — depot — 20 ore, 20 carbon — +15% popCap/level [TUNE]
- `farm` — none — 15 carbon, 5 hydrogen — food
- `waterworks` — none — 15 ore, 5 hydrogen — water
- `smelter` — mine_basic — 30 ore, 5 uranium — steel (L/H)
- `crystal_extractor` — mine_basic — 25 ore, 10 lithium — climate crystal
- `refinery` — crystal_extractor — 60 ore, 20 steelL — **crystals → fuel cells**

**T2** (politics-gating begins)
- `spaceport_M`, **`shipyard` (common: builds S *and* M hulls)** [v0.3 — free
  colonization must never be politics-gated], `lab` (medicines),
  `obs_station` (ground OBS), `turret_light` (Militarist), `market_T2`
  (Mercantile: AMM pools + auctions), `fuelcell_plant` (2× refinery rate).
- `workshop` L2 gains the **terraform core** recipe (§6) — politics-free.

**T3**
- `shipyard_M` (Industrialist; bulk/faster M production, prerequisite for L),
  `military_district`, `weapon_foundry`, `turret_heavy`, `tank_*`
  (Militarist), `research_center` (Scientific), `diplomatic_district`
  (Diplomatic), `casino` (Mercantile), `residential_T3` (Civic),
  **`colony_program` (never masked; tile-free** — it is a program, not a
  structure**)** — enables colony fitting.

**T4**
- `shipyard_L`, `stargate_yard` (§9.3), `terraformer` (Civic; +1 quality grade
  once per world, huge cost) [TUNE].

**T5 (endgame)**
- `artificial_planet_yard` (Industrialist) — §13.

**Seed mask:** branch kept with probability by tier: T1 95%, T2 80%, T3 55%,
T4 30%, T5 12% [TUNE]; kept branches roll a depth cap. Exempt nodes above.
Unlock paid in on-planet resources (canon); scientists −5%/rarity tier [TUNE].

### 5.1 Building catalog (v0 — complete; every effect [TUNE])

One building instance, 3 levels (level-up in place); `spaceport`, `shipyard`
and `market` tech nodes (`spaceport_M`, `shipyard_M/L`, `market_T2`) are the
**level-2/3 unlocks of the same building**, matching the 3-level art.

| Building | Tier | Politics | Effect L1 → L2 → L3 |
|---|---|---|---|
| telescope | T0 | — | scope +200 pc/level (max 3 instances); no tile |
| probe_pad | T0 | — | builds probes; 5/day/level cap; no tile |
| depot | T0 | — | +200/400/600 T **fungible** storage (caps = gameplay: see §3.3b) |
| warehouse | T1 | — | vehicle+item reserve: **L1 = 2 L / 4 M / 6 S vehicles + 50 items**; L2 ×2, L3 ×3 [TUNE]; allied parking configurable per warehouse; contents consume NOTHING |
| mine | T0 | — | basic extraction 10/20/40 T/day |
| farm | T1 | — | food 10/20/40 batches/day |
| waterworks | T1 | — | water 10/20/40 batches/day |
| smelter | T1 | — | steel 10/20/40 batches/day |
| crystal_extractor | T1 | — | climate crystal 8/16/32 T/day |
| refinery | T1 | — | fuel cells 20/40/80 batches/day |
| fuelcell_plant | T2 | — | own line: **40/80/160 batches/day × E** (2× same-level refinery); recipe yields unchanged |
| spaceport | T1 | — | docks cumulative: **L1 = 2 S; L2 = +2 M; L3 = +2 L** [TUNE]; a dock accepts hulls ≤ its size; docks = max simultaneous grounded visitors, reservable |
| workshop | T1 | — | repair 5%/h ×1/2/4; L2+: crafts accessories & terraform cores |
| market | T1 | — (L2+: Mercantile) | **trade slots = level (1/2/3)**; L1 fixed-rate; L2 AMM pools + auctions; L3 **LP fee 25→20 bp** |
| residential | T1 | (L2+: Civic) | popCap **+15 pp/level, additive** (+45% at L3); UI must project the E(u) trough before build |
| lab | T2 | — | medicines 10/20/40 batches/day |
| obs_station | T2 | — | ground OBS umbrella radius 5/8/12 pc |
| shipyard | T2 | — (L3: Industrialist) | L1 builds S+M hulls; L2 bulk M (−25% cost); L3 builds L hulls |
| military_district | T3 | Militarist | enables conquest ops; garrison cap +50%/level; **UNIT PRODUCTION: 1 unit / 48·24·12 h × E** by level (one queue; mints unit levels ≤ district level; per-unit cost = §10.1 cost column, paid at queue time) |
| weapon_foundry | T3 | Militarist | **continuous mint: 1 item / 168·84·42 h × E** (no weekly burst buckets) |
| research_center | T3 | Scientific | unlock costs −10%/level; **discounts multiply, best scientist only, total capped −50%** |
| diplomatic_district | T3 | Diplomatic | **ping quota +10/day/level; share-grant slots +2/level** (treaty = standing share/route grant; targeting stays telescope-scope-limited — canon) |
| casino | T3 | Mercantile | house-cut income **+5% RELATIVE/level** (never percentage points) |
| commerce_district | T3 | Mercantile | market daily limits +50%/level |
| faction_hq | T3 | Diplomatic | faction charter/moderation seat; banner broadcast |
| stargate_yard | T4 | — | builds Stargates (§9.3); 1 concurrent build/level |
| terraformer | T4 | Civic | +1 quality grade, once per world (huge cost) |
| artificial_planet_yard | T5 | Industrialist | builds artificial planets (§13) |

**warehouse unlock: 40 ore + 20 steelL; level-up L2 80 ore + 40 steelL, L3 160 ore + 80 steelL [TUNE]** (T1, common mask).

**Unit-card unlocks (once per planet, Militarist mask) [TUNE]:**
turret_light 30 ore+10 steelL; tank_ground 40 ore+20 steelL; tank_antiair
50 ore+25 steelL; tank_combined 80 ore+40 steelL+10 cells; turret_heavy
100 ore+50 steelH+20 cells; cannon 80 ore+40 steelH+15 cells.

**Unlock costs (T2+; placement = 50 % rule; T0-T1 costs in §5) [TUNE]:**
spaceport L2 120 ore+60 steelL; shipyard 150 ore+80 steelL+20 cells;
lab 80 ore+30 silicon+10 lithium; obs_station 60 ore+40 silicon;
market L2 100 ore+40 carbon+25 cells; fuelcell_plant 120 ore+40 steelL+20
crystal; shipyard L3 400 steelL+100 steelH+50 cells; military_district
300 ore+150 steelH+100 cells; weapon_foundry 250 steelH+150 cells+20 gold;
research_center 300 ore+200 silicon+100 cells; diplomatic_district 250
ore+100 steelL+100 cells+20 gold; casino 200 ore+100 steelL+150 cells+30
gold; commerce_district 250 ore+150 steelL+100 cells; faction_hq 300
ore+150 steelL+100 cells; residential L3 150 ore+150 carbon+50 cells;
colony_program 100 ore+50 steelL+25 cells (light: never-masked, preserves
the day-32-43 colony window); stargate_yard 1 000 steelH+500 cells+200
crystal; terraformer 2 000 steelH+1 500 cells+500 crystal+5 cores;
artificial_planet_yard 5 000 steelH+3 000 cells+1 000 crystal.

All buildings 512×256, 3 levels, hot/cold climate-adaptation overlays; full
sprite contract in `docs/ASSET_PIPELINE.md`.

---

## 6. Buildings & industry

- All buildings: **exactly 1 tile** (canon; telescope/probe_pad exempt as
  infrastructure), 3 levels, climate-variant art. Level-up in place.
- **Demolish:** any building → **50% resource refund**, tile freed, 6 h [TUNE].
- **Industry mints exactly one output** (canon): one recipe per instance,
  chosen at construction; re-targeting = 24 h retool [TUNE].
- **Throughput (generic):** **10/20/40 batches/day × E** by level [TUNE];
  refinery: 20 batches/day base [TUNE].
- **Recipes (v0):**
  - steelL = 2 ore + 1 carbon; steelH = 3 ore + 1 uranium [TUNE]
  - water = 2 hydrogen + 1 oxygen; heavyWater = water + 1 deuterium
  - food×3 = carbon + water (+phosphor | +sulfur | +silicon variants)
  - med×3 = lab: water + (lithium | sulfur | phosphor)
  - **fuel cells: 1 crystal + 1 silicon → 2 cells** [TUNE]; **Nox crystals →
    4 cells** [TUNE]
  - terraform core (**workshop L2 — politics-free**): 10 steelH + 5 crystal +
    50 cells [TUNE]
  - weapon/accessory items (weapon_foundry): e.g. beamLaser = 4 steelH +
    2 Ignis + 1 gold + 20 cells [TUNE] — **per-unit derived items**
- **Construction workflow:** unlocked card → pay from on-planet stock → tile
  reserved → build 6 h / 24 h / 72 h by level [TUNE] (engineers −10%/tier) →
  active. Resources may be hauled from other owned planets (canon).
- **BUILD ≠ INSTALL (canon, GAMEBOOK §9) — the economy's keystone.**
  Ground units, ship upgrades, weapons, accessories and derived items are
  **manufactured as portable items** where tech/politics/industry allow, then
  hauled, traded and **installed anywhere** (never politics-gated).
  **Vehicle size classes: S** = turret_light; **M** = tank_ground,
  tank_antiair; **L** = turret_heavy, cannon, tank_combined; ships use their
  hull size. **Cargo cost: S = 1, M = 2, L = 4 containers** [TUNE].
- **WAREHOUSE (owner spec, round 6):** stores ground AND space vehicles +
  items in **separate balances** (§5.1 capacities). **Warehoused = zero
  consumption** — upkeep applies ONLY to installed units (supersedes
  round-5 "upkeep everywhere"; the capacity limit replaces the upkeep
  anti-abuse). Offline-unfed installed units still don't count as garrison.
  **Free ground buffer without warehouse: 2 M + 2 S vehicles + 10 items**
  [TUNE — owner: "genre 2 2 et 10"; interpretation flagged]. **A factory
  BLOCKS when the buffer and all warehouses are full** and the output is
  neither installed nor listed. **Allied parking**: per-planet master switch
  + per-warehouse config; ally = faction member or whitelist; **only the
  owner retrieves its vehicle**; allied goods present at conquest are
  captured with everything else (warehouses are THE spoil — ready-to-use,
  undamaged).
- **Allied installation:** an ally MAY install its units in your garrison —
  they occupy YOUR slots and consume YOUR resources, but **the ally alone
  controls their policies and movements** [owner spec].
- **Deployment times [TUNE]:** ground unit warehouse→field: S 10 min /
  M 1 h / L 2 h, no dock needed; ship warehouse→space: needs a **free dock**
  + 1–6 h by hull size. **Docks = max simultaneous grounded visitors** (trade
  throughput); docks can be **reserved** (self/allies, "ready to depart").
  **Crew release: only while warehoused** (GAMEBOOK §12 exception) — crews
  return to the player's hand; re-crewing happens at the warehouse too.
  **Crewed sales:** listing a warehoused vehicle **auto-releases its crew to
  the seller's hand** (listing is a warehouse act; crew sells separately as
  NPCs, account-bind rules apply). **Heavy rule (owner CONFIRMED):** the free buffer holds no L slot —
  heavy production (turret_heavy, cannon, tank_combined) **requires
  warehouse space** from unit #1: warehouses are mandatory infrastructure
  for heavy industry.
  **Impound (ally betrayal, round 6):** on ally-status loss (faction leave,
  whitelist removal, war declaration) foreign installed units enter
  **IMPOUND** — hold-fire, no orders, still occupying slots and consuming
  upkeep — then auto-uninstall to the guest's warehouse space or dockside
  escrow **72 h later**; under siege lock the clock starts when the lock
  lifts; off-siege the host may evict to impound at any time.
  **Gate-raid doctrine (round 6):** free-flight gives days of telescope
  warning, but a **Stargate raid arrives with 0–12 h warning** (exit
  scatter) — warehouse ground reserves (S 10 min / M 1 h / L 2 h) are the
  ONLY reactive defense there; L-hull ship reserves (6 h) may not make it,
  and once combat starts the siege lock freezes everything: the
  pre-installed garrison remains the true answer. Raids through YOUR OWN
  gate are deniable (toll whitelist is a hard gate); the exposure is nearby
  third-party gates.
  **Siege lock [round 5, extended]:** during an ACTIVE combat event at the
  planet, install, uninstall, warehouse in/out and dock deployments are all
  blocked — prepare before they arrive. Off-siege install concurrency: 3.
- **Sales (owner spec, CONFIRMED):** per market building, **ONE automated
  trade slot PER LEVEL (L1 = 1, L2 = 2, L3 = 3)** — each slot holds one item
  listing (spot buy-now OR timed auction) or one fungible trading pair.
  Market breadth costs buildings, levels and tiles.
  Continuous sales: no seller limit; the buyer is bound by physical loading.
  **Manual channel (always open):** any player **docked at a commerce dock**
  may browse **public** warehouses and send a manual offer at any price;
  resolution is manual between players. **Allies holding a share grant may
  browse public warehouses from orbit** (no dock consumed) [round 7].
  **Private warehouses:** content hidden, unusable as sales stock —
  strategic reserve, manual in/out only. **Public = advertisement AND leak:**
  anything sale-browsable is enemy-censusable — war reserves belong in
  private warehouses; the public/private split IS the strategic choice.
  **Anti-DoS docks [round 7]:** owner-configurable max grounded dwell,
  default 24 h, auto-undock-to-hover eviction (off-siege only); reserving
  1–2 docks for self is the intended floor. **Offer limits [round 7]:** max
  1 open offer per (buyer, item), 20 open offers/day/account, auto-expire
  48 h [TUNE].
- **Ground units**: no tiles (garrison slots — §10.1), upkeep 0.2 cells/day
  [TUNE]. **Building HP: 1 500/3 000/6 000 by level** [round 4b].

---

## 7. Resources & carriage

Master list per GAMEBOOK §24. Carriage:
- 1 container = 1 T of a single fungible OR 1 large item; partial tons still
  monopolize their container.
- Fungible stacks live in planet stock, ship containers, or market pools.
- Derived items AND ground units are entities with `location` (planet /
  garrison / ship slot / cargo / system escrow / NFT-locked); a ground unit
  in transit = 1 large item in 1 container.

---

## 8. Ships

### 8.1 Hull table (Category × Size) [TUNE all numbers]

| Hull | Speed pc/day | Armor HP | Tank (u) | Burn u/pc | Containers | Slots (E/A/F/OBS/W/Acc/C) | Survival (crew-days) | Build cost (sketch) |
|---|---|---|---|---|---|---|---|---|
| Combat S "bee" | 30 | 60 | 40 | 0.20 | 0 | 1/1/2/0/1/1/0 | 2 | 30 steelL, 10 cells |
| Combat M "bird" | 22 | 180 | 90 | 0.40 | 0 | 2/2/2/2/1/1/0 | 14 | 90 steelL, 20 steelH, 40 cells |
| Combat L "crusader" | 12 | 700 | 400 | 1.00 | 4 | 2/4/4/4/4/4/4 | 60 | 400 steelH, 200 cells, 2 items |
| Cargo S | 24 | 80 | 60 | 0.25 | 3 | 2/2/2/0/0/1/1 | 14 | 40 steelL, 10 cells |
| Cargo M | 18 | 160 | 120 | 0.50 | 6→18 | 2/2/2/0/0/1/4 | 30 | 120 steelL, 30 cells |
| Cargo L | 10 | 400 | 400 | 1.25 | 24→72 | 2/2/4/0/0/2/16 | 365 | 300 steelH, 150 cells |
| Civil S | 26 | 70 | 50 | 0.22 | 1 (200 pax) | 2/1/2/0/0/1/1 | 14 | 35 steelL, 10 cells |
| Civil M | 20 | 150 | 100 | 0.45 | 2 (800 pax) | 2/2/2/0/0/1/2 | 30 | 110 steelL, 30 cells |
| Civil L | 11 | 380 | 350 | 1.10 | 4 (3 000 pax) | 2/2/4/0/0/2/4 | 180 | 280 steelH, 140 cells |

Slots: Engine/Armor/Fuel/OBS/Weapon/Accessory/Cargo. Upgrades: 2 levels each
(canon). **Only Combat mounts weapons; only Cargo mounts container upgrades**
(canon).

**Probes** are their own crewless class [only crewless class in the game]:
built at probe_pad for **15 ore + 10 silicon** [TUNE], **fuel-free solar
sail, 10 pc/day** [TUNE], unlimited endurance, built-in scanner, no cargo, no
survival clock, no hijack value. Build cap 5/day/pad [TUNE]. The exploration
bootstrap.

### 8.2 Upgrade effects (level 1 / level 2) [TUNE]
- Engine: speed ×1.15 / ×1.30; carries the fuel-tuning (§8.3)
- Armor: HP ×1.3 / ×1.6, weight +8% / +16%
- Fuel tank: tank ×1.5 / ×2.0
- OBS: accuracy ×1.2 / ×1.4, targeting range +25% / +50%
- Cargo (Cargo hulls): containers ×2 / ×3 (M: 6→12→18; L: 24→48→72)
- Weight penalty: `speedEff = speed × (1 − 0.15 × loadFrac)`,
  `burnEff = burn × (1 + 0.5 × loadFrac)`; loadFrac = carried/capacity + armor
  weight [TUNE].

### 8.3 Fuel × engine matrix [TUNE]
Each engine is **tuned** at install to one fuel chemistry:

| Tuning \ burning | cold | hot | gas |
|---|---|---|---|
| cold-tuned | 100% eff | 60% | 40% |
| hot-tuned | 60% | 100% | 55% |
| gas-tuned | 45% | 55% | 100% |

Efficiency divides the burn rate. Mixed tanks burn worst-first by default;
policy-configurable.

### 8.4 Range (derived, canon)
`range = tank × matrixEff / burnEff` (Cargo-S base ≈ 240 pc; tanks L2 ≈
480 pc). Crewed ships also show `rangeSurvival = survivalDays × speedEff`
(Cargo-S ≈ 336 pc). UI shows both circles for the current loadout.

### 8.5 Crew
Min crew: S 1, M 3, L 8 [TUNE]. NPCs bind permanently (canon). No crew ⇒
cannot fly (probes exempt — and *only* probes; no other crewless variant may
be defined via accessories).

### 8.6 Landing
Personal ship always; Combat-S anywhere; colony-fitted Civil-M/L on wild
worlds; **forced combat-landing** (Combat-M/L, defenses destroyed — §10.3);
everyone else needs a spaceport dock ≥ hull size. Landing wear: 1% armor per
landing [TUNE], waived where a Civic/civil-pilot governor sits.

### 8.7 Repair & rearm
Workshop repairs 5% HP/h × level mult (×1/×2/×4) [TUNE]; costs steel
proportional to HP restored; policy: whom to serve (canon).

### 8.8 Accessories (workshop-crafted, politics-free)
- **Harvest rig** — 20 steelL + 5 crystal + 5 gold [TUNE]:
  `yield/day = R_max × (1 − d/d_max)²`, `hullDmg/day = D_max × max(0,(d_safe −
  d)/d_safe)²`; d_max 8 pc, d_safe 5 pc, R_max 120 u/day, D_max 80 HP/day
  [TUNE]. Draws down the star's hidden stock.
- **Junk collector** — 15 steelL + 5 silicon [TUNE]: 30 T junk/day.
- **Claim rig** — 25 steelL + 5 gold [TUNE]: claims ownerless hulls after 2 h
  proximity [TUNE].
- **Climate shields** — `shield_hot` / `shield_cold` / `shield_radio`
  (workshop L2, politics-free, 15 steelL + 5 matching crystal [TUNE]).
  **Rule (closes GAMEBOOK §27):** a ship landing on/hovering over a hot or
  cold planet, harvesting a poison deposit, or operating within 5 pc of a
  black hole or flaring star, without the matching shield, takes
  **deterministic hull wear 5 % max-HP/day pro-rated per tick** [TUNE] — a
  toll, never a kill nor a movement block. **Temperate worlds never require
  shields** (starters are temperate ⇒ no starter grief). Buildings never
  need shields (climate-adaptation art is cosmetic; canon: climate gates
  resources, not operation). Combat unaffected — environmental only.
- Scanner, terraform core (§6): same slot family.

---

## 9. Movement, interception & the network

### 9.1 Free flight
Straight segment A→B at `speedEff`; burns `burnEff`/pc + idle rates when
loitering. Course changes any time (new segment from interpolated position).

### 9.2 Detection & interception
- **Telescope intel** (canon): L1 heading; L2 + destination estimate; L3 +
  full loadout manifest **and junk-dump / star-harvest attribution** in scope
  [TUNE].
- **Attack radius:** attack-postured ship projects `r_engage = 3 pc × OBS
  range mult` [TUNE]. Tick worker solves segment-circle intersection per
  spatial bucket (grid hash 64 pc [TUNE]); crossing schedules a combat event.
- **Disengage rules [TUNE, v0.3]:** engagements have an **initiator** — the
  first ship to schedule a hostile event in the group; ships responding under
  defensive policies are non-initiators.
  - Only the **non-initiator** may disengage; the initiator is locked in for
    20 rounds (commitment — no zero-cost hit-and-run).
  - Non-initiator escape round = `ceil(3 × attackerSpeedEff /
    victimSpeedEff)`, capped at 8: fast ships slip away in 3, heavy loaded
    haulers need armor to survive to their escape round. Armor + speed
    *together* decide who gets away — canon's risk/reward on cargo weight.
  - **No disengage against structures** (turrets/garrisons have speed 0 and
    fight while a hostile is in range — no siege-salami).

### 9.3 Stargates
- Build at `stargate_yard`: **250 cells + 400 steelH + 100 crystals** [TUNE];
  cost **split 50/50** between different owners (both consent; canon).
- Traversal instant; per-ship toll if public (any resource; hard gate, canon).
  Capacity 1 ship/tick/direction [TUNE].
- Gate dies with either endpoint (canon). **Exit scatter:** arrivals (and
  dead-gate exits) materialize **U(0–15) pc** off the fixed point [TUNE],
  computed as a **seeded hash(shipId, arrivalTick)** — deterministic, but
  unpredictable to campers; beats the widest engage radius (~4.5 pc).
- Gates on artificial planets move with them (canon).

### 9.4 Tolls & public routes
Route owner sets `tollResource, tollAmount, whitelist`. Collected into the
gate's planet stock. Factions tolling chokepoints is intended politics.

---

## 10. Combat (deterministic)

### 10.1 Stats
- **ATK** = Σ weapon power × OBS accuracy. Power (L1/L2): light a2a 12/20,
  light a2g 10/16, medium 30/48, **heavy (L-only) 55/85** [TUNE].
  Small Combat without external OBS (ground obs_station or crusader umbrella,
  radius 5 pc [TUNE]): **ATK ×0.6** [TUNE].
- **DEF** = armor HP. Mitigation `mit = 0.15 × armorLevel`; **turrets mit
  0.30** [TUNE].
- **Ground-unit catalog (complete, v0 — all [TUNE], L2/L3 ≈ ×1.4/×1.9 the
  L1 line):**

| Unit | Levels | ATK (L1) | HP (L1) | Cost (L1) | Notes |
|---|---|---|---|---|---|
| turret_light | 2 | 40 | 150 | 10 steelL | cheap screen; **mit 0** |
| turret_heavy | 2 | 160 | 400 | 40 steelH | mit 0.30; backbone |
| cannon | 2 | 120 | 200 | 25 steelH | anti-orbital: **range = the hover band only (~1 pc [TUNE])** — never out-shoots the 3 pc engage bubble |
| tank_ground | 3 | 40 | 250 | 15 steelL | fires on **landed & force-landing ships ×1.5** — punishes the 24 h conquest hold |
| tank_antiair | 3 | 60 | 220 | 20 steelL | ×1.5 vs atmospheric ships |
| tank_combined | 3 | **70** | 260 | 30 steelL | premium generalist: hits atmospheric AND landed |

  Upkeep 0.2 cells/day each. **Garrison cap = 2 × tiles in SLOTS; units cost
  slots by level (L1=1, L2=2, L3=3)** [round 4b — no 40-heavy unbreakable
  turtles]. **"Atmospheric ship" = hovering over, landed on, or force-landing
  at the planet.** Turrets & cannons fire on hovering ships at full ATK;
  tank_antiair & tank_combined fire on atmospheric ships (AA ×1.5);
  tank_ground fires on landed/force-landing only. Ground units are **placed
  on the planet view like buildings** (sprites 512×256, animated GIF) but
  occupy **no tile** — placement is visual, the slot cap is the limit.

### 10.2 Resolution (at arrival — canon)
Simultaneous rounds, 1 round = 1 tick:
```
dmg_to_B = max(0, ATK_A × (1 − mit_B)); armor_B −= dmg_to_B  (and vice versa)
```
0 HP ⇒ destroyed ⇒ **space junk** (canon): junk mass = **15%** build-mass,
cargo salvage **15%** [TUNE — piracy is a profession, not a printing press].
**Buildings are untargetable by a2g while the planet's garrison > 0**, and
building HP is **1 500/3 000/6 000** by level [round 4b ×10 — razing an
undefended world is an hours-long commitment, not minutes]. The initiator
may withdraw after the 20-round lock expires by leaving weapons range.
Survivor keeps damage. Both-zero: both die. Fleets:
policy targeting (focus-fire default); a2a hits ships, a2g hits ground/
buildings (HP §6) only (canon).

### 10.3 Defenselessness, hijack & conquest
- **Defenseless** = no operational weapons/turrets, or no fuel to respond
  (canon).
- **Hijack (ship):** Combat ship within 0.5 pc of a defenseless ship for
  **2 h** claims it + cargo (canon). Crewed, fueled ships are immune.
- **Conquest (planet):** destroy turrets/garrison + orbital defenders →
  **forced combat-landing** (Combat-M/L; no dock needed once defenses are
  dead) → hold 24 h [TUNE] → ownership transfers: buildings & population
  stay, **planet-bound governors transfer with the world** (§4.1), ship/
  building-bound NPCs die with their hosts (canon), stock plunder **25%** —
  **warehoused unit/derived ITEMS count as stock** (conqueror takes
  floor(25%) by census value, deterministic pick) and **installed units are
  captured with the world**
  [TUNE]. Starter-only-planet exemption (§2.2). **Fresh colonies carry a
  14-day grace: no conquest and no a2g bombardment of their buildings**
  (blockade and tolls remain legal — siege the cradle, don't burn it) [TUNE].
- **Personal ship** unattackable/unhijackable everywhere (canon).
- **Escort rule of thumb (round 5):** one armored hovering Combat-M trades
  ~1:1 with a raider bird; two escorts beat one raider — orbit defense is
  affordable protection for production-less worlds (upkeep from own stock).

### 10.4 Junk fields
Dump/kill drops junk at site: hazard **15 HP per 30 T** in a 0.5 pc cell,
**max 1 field per cell**, **decay 10%/day**, dump limit 5/day/ship [TUNE];
attribution readable at telescope L3; **no-dump zone: 50 pc around any
only-planet starter** [TUNE]. Black holes accept dumps with zero consequence
(canon). Collectable (§8.8).

---

## 11. Economy

### 11.1 Markets (physical, canon)
A market trades **only stock physically on its planet**. Owner configures:
pairs, rate mode (fixed | AMM), absolute & daily limits, whitelist (canon).
Landing rights gate access. Fixed-rate re-pricing ≤ 1/min [TUNE].

### 11.2 AMM & liquidity (the no-currency answer)
- **Pool = one market trade SLOT = ONE pair** (owner canon — slots = market
  level, L1/L2/L3 = 1/2/3; pairs are physical). Reserves x, y, constant
  product.
  **Tile arithmetic makes the cells-star the only feasible multi-resource
  topology** (N−1 buildings vs N(N−1)/2 all-pairs): cells-as-reserve is a
  design fact, not merely an expectation. **Hospitality triad convention:**
  hubs wanting visitor traffic run food/cells + water/cells + fuel/cells
  (3 tiles) — UI nudges when no food pair exists within telescope range.
  Spot = y/x. **The owner's initial deposit ratio *is* the initial price** —
  seeding is a pricing decision, not a magic 50/50 (mispricing is the owner's
  tuition).
- **Fees (basis points, never ambiguous): 25 bp/leg to LPs + 25 bp house cut** to the market owner [TUNE — house cut raised in round 4a so T3 commerce buildings pay back]. Market L3 lowers the **LP leg** to 20 bp.
  Cross-denominated trades route two legs = double fee (canon).
- **Liquidity provenance:** planetary surplus; visiting players may LP if the
  owner allows. **LP withdrawal is system-guaranteed** — landing-rights
  revocation cannot ransom deposits [TUNE]. **Custody:** pool reserves live
  physically in planet stock, but LP claims are liens that survive conquest —
  the conqueror inherits the pool *with its obligations* [TUNE].
- **Never use AMM spot as an oracle** for any other mechanic (pods use the
  census §11.5). Self-wash trading is thereby pointless, not dangerous.
- Expected behavior: cells emerge as the reserve leg; thin pairs = spreads =
  arbitrage hauling — a core loop, not a bug.

### 11.3 Auctions & buy-now (non-fungibles)
Stop-price buy-now, or sealed max-bid auction (24/48/72 h):
- Bids **escrow in a system-held bonded account** (not physical planet stock;
  plunder-exempt; auto-refunded on loss — the one deliberate exception to
  physicality, because escrow must be neutral) [TUNE].
- **Winner pays max(second-highest + 5%, reserve)**; single bidder pays
  reserve [TUNE]. Listing bond: **1% of census value, paid in cells**,
  non-refundable (anti-shill; not gameable via a self-abundant reserve
  resource) [TUNE]. Relist cooldown per asset: 72 h [TUNE].
- Escrow custody applies to **movable assets only**. **Listed planets remain
  attackable and conquerable — the sale voids on conquest.** No auction
  vaulting. **Conquest also voids the planet's outbound item listings:
  escrowed items return to planet stock BEFORE plunder is computed** [round
  5b — no 1%-bond vault against the 25% plunder].
- Planet listings display tiles, deposits (surveyed level), **and the
  effective governance mask** (§4.1).

### 11.4 Recruitment pods (loot boxes)
- Main interface; pay in **any resource**; price recomputed 4×/day [TUNE] AND
  **purchases count into supply immediately** (price impact within the
  window):
  `price_r = max(5, B × (S_r / S̄)^0.7)`, B = 40 [TUNE], S̄ = **trimmed
  supply-weighted mean** (not median) [TUNE].
- Cap: **10 pods/day/account**; **no pods for accounts < 45 days** [TUNE].
- Contents: **1 NPC** (canon). Rarity: Common 62 / Uncommon 24 / Rare 10 /
  Epic 3.4 / Legendary 0.6 (%) [TUNE]; role uniform; people 60/30/10
  human/Forged/Vess [TUNE]. Governor-grade = Rare+. Bonuses +4%/tier [TUNE].
- **Individual stat rolls (owner canon):** each NPC rolls its
  archetype-relevant stat boosts **individually at pod-opening** (seeded
  generation-moment RNG, §1): boost = rarity-tier baseline × **U(0.5, 1.5)**
  per stat [TUNE] — two Rare pilots are never equal; pods gamble on quality
  as well as role/rarity.
- **Pod-sourced NPCs are account-bound for 60 days** (no trade, auction, or
  NFT mint until aged) [TUNE] — recruitment is a sink, not a mint. **Host
  transfers inherit the strictest account-bind of any bound NPC** (no
  laundering an NPC by auctioning the ship it's bound to).

### 11.5 Global supply census
4×/day aggregation over planet stocks + cargo + pools + escrow → per-resource
totals; drives pod pricing; published in-game ("market census").
**Publication = GLOBAL totals only — per-planet/per-warehouse breakdowns are
never published**; private-warehouse contents count in server-side value
computations (plunder, bonds) but are never enumerated to other players.

---

## 12. Colonization & planet trading

**Colonize (mid-game, canon):**
1. Prereqs: `colony_program` (T3, never masked); Civil-**M or L** hull (T2
   common shipyard builds both S and M) + **colony fitting** (1 terraform
   core + **400 cells + 150 steelL** [TUNE] — civilian-grade steel; the whole
   chain is politics-free by construction).
2. Load ≥ **200 settlers** [TUNE] + seed stock (≥ 30 T food, 30 T water).
3. Fly to an **uninhabited planet**; land (colony ships land wild — canon);
   72 h establishment [TUNE]; planet becomes yours: tiles/DNA roll from seed,
   settlers become population, hull converts into `depot` + `spaceport_S`
   (the ship is spent) [TUNE].
4. Settler-risk per §3.2 (civil pilots matter).

**Planet trading (canon):** planets list like any non-fungible. Ownership
transfers; **bound governors transfer with the world**; population stays;
listings disclose the governance mask (§11.3).

---

## 13. Artificial planets (endgame)

- Prereq: `artificial_planet_yard` (T5) + Industrialist governance.
- Cost: **15 000 steelH + 8 000 cells + 2 000 crystals + 10 derived cores**;
  build 60 days [TUNE]. Built at any owned coordinate.
- Result: planet-entity, size M, quality C fixed, **no deposits, no climate
  crystals** (canon), popCap ×0.8 of natural M, tiles 8–12, **integral
  Stargate** (endpoint; moves with it) [TUNE].
- **Mobility:** 0.5 pc/day, burns 200 cells/day under way [TUNE]. Docked/
  garrisoned assets move with it.
- Attackable/conquerable like a planet [TUNE — guide's stance on the GAMEBOOK
  §27 open: yes; it is a planet].

---

## 14. NFT bridge (opt-in, out of the hot path)

- **Extract = 48 h "packing"** [TUNE]: the asset stays in-world and
  vulnerable; **only actual damage taken cancels packing** (a hostile flyby
  cannot deny extraction forever); blocked while the asset sits in
  escrow/auction. Then: DB lock → mint (chain: **Polygon PoS** [TUNE],
  contracts from `.blockchain` minus GameEngine) → frozen in-game (canon).
- **Frozen planet = custodial mode:** population snapshot frozen, production
  halted, **still physically present — and still attackable and
  conquerable.** Conquest rewrites the in-game deed; a burned token yields
  the world only if its minter still controls it, else it yields nothing.
  A supernova likewise leaves the token pointing at a dead world. *The token
  is a deed, not a bunker — and wars rewrite deeds.* [TUNE — revisit for the
  v2 on-chain UX.]
- **Burn:** relayer observes → asset rematerializes at its recorded location,
  live (canon). **Burned assets credit only the minting account for 60 days**
  [TUNE]; **no minting for accounts < 45 days** (§2.2) — the bridge is a
  vault, not a teleporter.
- Mintable: planets, ships, NPCs, derived items, building cards (canon),
  **and ground units & ships-as-vehicles** (must be **warehoused** — the only freezable state; standard 48 h packing).
  Factions: DB entities in v0; banner mint = v2 [TUNE]. Starter planet never
  mintable.

---

## 15. Social, factions, comms

Per canon §5/§23. Concrete:
- Pings free; 20/day/player [TUNE]. Ship-pings: reaction is the intel.
- Faction charter: 3+ founders, 500 cells [TUNE], minted by one owner;
  moderators invite/ban; banner on all member planets (canon); leave/ban =
  24 h banner grace [TUNE].
- Planet-view & telescope shares are revocable grants [TUNE].

---

## 16. Monetization (fiat only — canon)

- €2.99 one random planet / €9.99 pack of 5 (canon). Stripe. Minted near
  buyer via §2.2 generator.
- **Premium floors:** +€2 ⇒ quality ≥ E, +€5 ⇒ ≥ D, +€10 ⇒ ≥ C [TUNE],
  applied as a **clamp** (a below-floor roll becomes exactly the floor —
  A/B odds never rise above their base rates). **A/B never purchasable** —
  top grades stay luck (recovered rule).
- No other real-money surface. Ever. (Canon.)
- **Supply monitor:** each purchased planet injects deposits; if sales volume
  pushes the cells-inflation target (§19), the generator's regional deposit
  budget throttles new-planet richness [MONITOR — see BALANCE_LOG].

---

## 17. Player journeys (expected behavior)

**First hour:** spawn (healthy 1 200-pop world, fuel in the tank, a pilot on
the roster) → telescope (600 pc when maxed — the guaranteed neighbor shell is
visible) → probe the ≤60 pc uninhabited worlds → mine/farm → the efficiency
lesson (UI: "mine at 34% — assign workforce"). Session-one takeaways: tilted
bell + finite deposits + *someone is out there*.

**First contact (< 3 days; first physical trade ~7–8 days median):** scope
finds a banner → ping → ping-back → chat → share → first trade (Cargo-S,
240 pc fuel range, 336 pc survival ceiling — carry a container of fuel or
refuel at the neighbor for the return leg; the trip is real but safe if
planned). Traders open, warlords stalk, hermits go dark: all valid.

**The trade loop (mid):** scripted Cargo-M: "load steel at A → gate to B (pay
toll) → sell vs cells → buy Glace → home → refuel < 30%" + Combat-M escort
policy "engage whatever engages the convoy" — the old gamebook's freighter
#296/fighter #552, now first-class.

**The colonization arc (mid):** probe/lab surveys (DNA branches, deposits,
quality) → colony fitting (T3, never masked) → settler run (civil pilot!) →
establish → the new world's DNA forces a *different* specialization →
intra-empire logistics begin.

**War (mid-late):** L3 intel (manifests, junk/harvest attribution) → toll
strangulation or siege → turret grind (heavy turrets now bite: 160 ATK) →
forced landing → 24 h hold → occupied world (governors inherited, 25%
plunder) → junk fields → salvage rush → faction politics react (the game only
displays).

**Endgame:** artificial planet as mobile capital: walk your Stargate to a
dead region, re-link the isolated (end someone's Fermi era on purpose), or
park a fortress by a rival's star — and let them wonder how much fuel it has
left.

---

## 18. Anti-abuse & guardrails (consolidated)

- Starter: account-bound 45 d; unconquerable while only-planet; never
  mintable; 50 pc junk-free zone.
- New accounts: no pods/mint < 45 d; can't be engaged < 14 d unless they fire
  first (shield **voids beyond 100 pc of own starter or on inter-account
  transfer**); receive-cap 100 T/day for 14 d [TUNE].
- Burn-to-minter-only 60 d (bridge ≠ transfer channel).
- No teleporting value (canon co-location) — escrow is the sole, system-held
  exception.
- Rate limits: pings 20/day; fixed-price re-pricing 1/min; pods 10/day; junk
  dumps 5/day/ship.
- Toll gouging & area denial are legal politics; decay + scatter + no-dump
  zones keep them tactics, not prisons.
- Supernova play: flares below 5% + L3 harvest attribution = restraint is
  player-enforceable.

---

## 19. Balance targets

- Time-to-first-contact (median active): **< 3 days**; first physical trade:
  **< 8 days** [TARGET — v0.3: honest vs the 150–240 pc shell geometry]
- Second planet without paying (colonize or trade): **30–45 days** [TARGET —
  aligned with the colony chain]
- Small-planet build-out ~2 weeks; large ~2 months [TARGET]
- Cells inflation within ±20% of population growth [TARGET]
- Piracy-vs-hauling ROI at chokepoints: **2–3×** (profession, not dominant
  strategy) [TARGET]
- No strategy > 60% win-share in sim cohorts [TARGET]
- New-player 7-day retention path never blocked by another player [HARD]

*Findings & patch history: `BALANCE_LOG.md`.*
