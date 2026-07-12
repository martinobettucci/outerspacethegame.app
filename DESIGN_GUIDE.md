# ACROSS THE GALAXIES — Design Guide (mechanics, formulae, workflows)

> **What this document is.** The complete mechanical specification: every
> system with concrete rules, numbers and formulae, plus the workflows and
> expected behaviors around them. It implements the decision canon in
> `GAMEBOOK.md` and the world in `GAME_BIBLE.md`.
>
> **Convention:** every invented number/formula is tagged **[TUNE]** — it is a
> deliberate, visible placeholder chosen to be plausible and simulation-tested,
> not sacred. Rules without the tag are canon. Changes here must not contradict
> `GAMEBOOK.md`; if they must, change the GAMEBOOK first.

---

## 0. Units & global constants

| Thing | Unit | Notes |
|---|---|---|
| Distance | **parsec (pc)** | 1 coordinate unit = 1 pc; universe is a 2D plane |
| Time | **tick = 60 s** [TUNE] | all simulation math is per-tick; UI shows human time |
| Game day | = **1 real day** | travel of "3 days" is 3 real days (canon: temporal combat risk) |
| Mass | **ton (T)** | 1 container = 1 T of one fungible, or 1 large item |
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
  unlock complete, loot-price recompute, supernova, mission step boundaries.
- **Catch-up:** on player load, all their entities lazily evaluate to *now*.
  Nothing requires per-entity per-tick writes.
- **Determinism:** given the same DB state and event order, re-evaluation is
  bit-identical. The only randomness in the game happens at **generation
  moments** (planet roll, loot box open, tile roll) using a server-side seeded
  RNG; live play (combat, production, travel) is fully deterministic. (Canon.)

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

### 2.2 New-player spawn (the Fermi pocket)
1. Find a region ≥ **300 pc** [TUNE] from any *active* player asset and
   ≥ `R_nova` of every star (canon: starter is supernova-safe).
2. Generate (or select) a **starter planet**: temperate, quality D–F, small or
   medium, with the **starter guarantee**: extractable value ≥ cost(telescope)
   + cost(probe) + 25% spare (canon).
3. Grant starter stock: `{ore 60, carbon 40, silicon 30, hydrogen 20, oxygen 20,
   food 30, water 30}` T ×U(1.0, 1.3) [TUNE] — the "lower bound random."
4. Starting population: 400 [TUNE]. Personal ship docked. 1 free small Cargo
   hull (unupgraded) [TUNE] so hauling is possible day one.

**Purchased planets** spawn *as near as feasible* to the buyer's centroid with
the same generator; distance draw `d ~ 50 × LogNormal(0, 0.6)` pc [TUNE] —
usually close, occasionally far (canon: "bad luck or good luck").

**Anti-abuse:** starter planets are **account-bound for 45 days** [TUNE]
(non-tradeable, non-extractable to NFT) and **cannot be conquered while it is
the owner's only planet**. Free accounts get exactly one starter, ever.

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
  - `r = 0.02` [TUNE]
  - `H` (habitability) = `min(foodSat, waterSat, medSat)` where each Sat =
    `min(1, stock_consumedPerDay / need)`; needs per 1 000 pop per day:
    food 1 T, water 1 T, medicine 0.1 T [TUNE].
- **Illness:** define crowding `u = P/popCap`. Illness index `I` (0..1):
  `dI/day = 0.15 × max(0, u − 0.9) × 10 − 0.05 × I` [TUNE] (builds fast past
  90% crowding, decays slowly). `illnessDeaths/day = 0.03 × I × P` [TUNE].
  Medicine satisfaction < 1 multiplies illness growth by ×2 [TUNE].
- **Settlers:** population moves only by **Civil ship**; loading/unloading
  needs a spaceport on inhabited worlds (colonization: §12). **Trip accident
  risk** `= 5% base − 2% × civilPilotLevel (0–2), min 0` [TUNE], applied to the
  *cohort* deterministically: `survivors = ceil(cohort × (1 − risk))`.
  (Deterministic-at-arrival, like combat: the "risk" is a known toll, not a
  dice roll — consistent with the no-RNG-live rule.)

### 3.3 Deposits & depletion
Each planet rolls 3–7 deposits [TUNE] from its seed:
- Basic materials: always present (all twelve mineable at trace level), but
  only *deposited* ones are worth industrial mining.
- Crystal deposit: matches climate; poison worlds always roll a Nox deposit.
- **Deposit stock:** `S0 = 2 000 × sizeMult × qMult × U(0.6, 1.4)` T,
  sizeMult ∈ {1, 3, 10} [TUNE].
- **Extraction:** a mine extracts `rate = baseRate(level) × E × runPct` per day
  (E = efficiency §3.4, runPct = player-set throttle);
  baseRate: basic mine 10/20/40 T/day for levels basic/normal/advanced [TUNE];
  crystal extractor: 2/5/12 T/day [TUNE].
- Deposit hits 0 ⇒ **dry forever** (canon). UI must show projected dry date.
- Trace mining (no deposit): 0.5 T/day max regardless of level [TUNE] — enough
  to bootstrap, never enough to industrialize.

### 3.4 Efficiency (the tilted bell) — THE formula
Every producing/consuming unit has an efficiency `E ∈ [0.12, 1]`:

```
E(u) = max(0.12, exp( −(u−μ)² / (2σ(u)²) ))
μ = 0.70          # the sweet spot: ~70% utilization [TUNE]
σ(u) = 0.35 if u < μ (forgiving when under-used)
     = 0.15 if u ≥ μ (punishing when crammed)      [TUNE]
```

`u` is the **domain utilization** relevant to the unit:
- Mines/industry: `u = workforceAssigned / workforceOptimal`, where
  workforceOptimal per building level = 50/120/250 [TUNE], and total assigned
  workforce ≤ population × 60% [TUNE] (the rest are dependents/services).
- Storage-sensitive units (markets, depots): `u = stockHeld / stockCap`.
- Population-level planet efficiency (applies to everything on the world):
  `E_planet = E(P/popCap)`.
- **Effective efficiency = E_unit × E_planet × G** where `G` = governance
  multiplier (§4). Industries additionally apply the player throttle `runPct`.

**Expected behavior/UI (canon):** every resource/unit view renders its curve
with the live position marked; the per-planet stats page lists every unit,
its `u`, `E`, and the dominant limiting factor ("overcrowded", "understaffed",
"warehouse 97% full").

### 3.5 Hovering
Ships in orbit burn upkeep: `idle fuel 0.2 u/day × sizeMult(1/2/4)`, survival
per crew member per day: 0.01 T food+water each [TUNE].
- Over **own planet**: drained from planet stock (canon).
- Over **foreign planet**: drained from ship stock; ship may run auto-trade
  policies ("if food < 20 buy 200 best-effort") against the local market
  (canon).

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
basic mine/refinery. [TUNE: exact matrix lives in data, this is the shape.]

- Small planet: no governor needed → mask = **owner's remote default** =
  common set only, *unless* the personal ship is parked there (then = your
  archetype's mask).
- Medium: 1 governor. Large: 3 governors or ×0.5 efficiency (canon).
- **Effective mask = intersection of all governors present** (canon). A large
  world with Militarist+Industrialist+Scientific can never build a casino or
  diplomatic district — by construction.
- **G multiplier:** fully governed = 1.0; large with 1–2 governors = 0.5
  (canon "half efficiency"); governor rarity adds +2% per rarity tier of the
  *lowest-tier* governor [TUNE].
- **Preview (canon):** the governance screen simulates any candidate set and
  renders the resulting allow/deny mask *before* the irreversible install.

### 4.2 NPC roles
Roles: **pilot** (civil/combat/cargo specializations), **engineer** (repair
speed, build speed), **merchant** (fee discounts), **diplomat** (ping range,
treaty slots), **soldier** (weapon accuracy), **scientist** (unlock discount).
Any NPC of governor-grade (rarity ≥ Rare, §11.3) can serve as governor, where
their role maps to the archetype (pilot→Civic, soldier→Militarist,
merchant→Mercantile, scientist→Scientific, engineer→Industrialist,
diplomat→Diplomatic) [TUNE]. Civil pilots: settler-risk reduction (crew) or
landing-safety (governor: visiting ships take no landing wear, §8.6).

---

## 5. Tech tree (v0 content)

Structure per canon §18 (global DAG, seed mask, unlock-then-place, telescope &
probe never gated). **v0 tree** (node → prereq → unlock cost → notes):

**T0 (universal, never masked)**
- `telescope` — none — 20 ore, 10 silicon — +150 pc scope each, max 3/world [TUNE]
- `probe_pad` — none — 15 ore, 10 carbon — builds probes (§8.1)
- `depot` — none — 10 ore — +200 T storage/level
- `mine_basic` — none — 15 ore — extracts basic deposits

**T1 (common mask)**
- `spaceport_S` — depot — 40 ore, 20 steelL — small docks ×2
- `workshop` — mine_basic — 30 ore, 10 silicon — repairs (§8.7)
- `market` — depot — 25 ore, 10 gold — trading post (§10)
- `residential` — depot — 20 ore, 20 carbon — +15% popCap/level [TUNE]
- `farm` — none — 15 carbon, 10 water? → bootstrap: 15 carbon, 5 hydrogen — food
- `waterworks` — none — 15 ore, 5 hydrogen — water
- `smelter` — mine_basic — 30 ore, 5 uranium — steel (L/H)
- `crystal_extractor` — mine_basic — 25 ore, 10 lithium — climate crystal
- `refinery` — crystal_extractor — 60 ore, 20 steelL — **crystals → fuel cells**

**T2** (politics-gated begins)
- `spaceport_M` — spaceport_S — medium docks; `shipyard_S` — workshop+smelter —
  builds small hulls; `lab` — refinery — medicines; `obs_station` — workshop —
  ground OBS for small combat ships; `turret_light` — workshop —(Militarist);
  `market_T2` — market —(Mercantile) AMM pools + auctions.
- `fuelcell_plant` — refinery — industrial cells at 2× rate.

**T3**
- `shipyard_M` (Industrialist), `military_district` (Militarist),
  `research_center` (Scientific), `diplomatic_district` (Diplomatic),
  `casino` (Mercantile; commerce yield +X%), `residential_T3` (Civic),
  `weapon_foundry` (Militarist) — mints weapon/accessory **derived items**,
  `turret_heavy`, `tank_*` line (Militarist).

**T4**
- `shipyard_L`, `colony_program` (Civic; enables colony-ship fitting),
  `stargate_yard` (builds Stargates, §9.4), `terraformer` (Civic; +1 quality
  grade once per world, huge cost) [TUNE].

**T5 (endgame)**
- `artificial_planet_yard` (Industrialist) — §13.

**Seed mask:** each planet's seed keeps a branch with probability by tier:
T1 95%, T2 80%, T3 55%, T4 30%, T5 12% [TUNE]; kept branches roll a **depth
cap**. Telescope/probe/depot/mine exempt (canon). Unlock costs are paid in
on-planet resources (canon); scientists discount 5%/rarity tier [TUNE].

---

## 6. Buildings & industry

- All buildings: **exactly 1 tile** (canon), 3 levels (basic/normal/advanced),
  climate-variant art (§26 GAMEBOOK). Level-up = pay upgrade cost in place.
- **Industry mints exactly one output** (canon): one recipe per building
  instance, chosen at construction from the building's recipe book;
  re-targeting a recipe = 24 h retool downtime [TUNE].
- **Recipes (v0):**
  - steelL = 2 ore + 1 carbon; steelH = 3 ore + 1 uranium [TUNE]
  - water = 2 hydrogen + 1 oxygen; heavyWater = water + 1 deuterium
  - food×3 = carbon + water (+phosphor | +sulfur | +silicon variants)
  - med×3 = lab: water + (lithium | sulfur | phosphor)
  - **fuel cell = 3 crystal(any) + 1 lithium + 1 silicon** [TUNE];
    Nox crystals yield ×2 cells per batch [TUNE]
  - weapon/accessory items: weapon_foundry, e.g. beamLaser = 4 steelH + 2 Ignis
    + 1 gold + 20 cells [TUNE] — **per-unit derived items**
- **Construction workflow:** pick unlocked card → pay from on-planet stock →
  tile reserved → build time 6 h / 24 h / 72 h by level [TUNE] (engineer NPCs
  −10%/tier) → active. Resources may be hauled in from other owned planets
  (canon).
- **Ground units** occupy **no tiles** (they garrison) but cost upkeep:
  0.2 cells/day each [TUNE]; cap = 2 × tiles [TUNE].

---

## 7. Resources & carriage

Master list per GAMEBOOK §24. Carriage rules (canon-derived):
- 1 container = 1 T of a single fungible OR 1 large item; partial tons still
  monopolize their container.
- Fungible stacks live in planet stock, ship containers, or market pools.
- Derived items are entities with `location` (planet / ship slot / cargo /
  auction escrow / NFT-locked).

---

## 8. Ships

### 8.1 Hull table (Category × Size) [TUNE all numbers]

| Hull | Speed pc/day | Armor HP | Tank (u) | Burn u/pc | Containers | Slots (E/A/F/OBS/W/Acc/C) | Survival (crew-days) | Build cost (sketch) |
|---|---|---|---|---|---|---|---|---|
| Combat S "bee" | 30 | 60 | 40 | 0.8 | 0 | 1/1/2/0/1/1/0 | 2 | 30 steelL, 10 cells |
| Combat M "bird" | 22 | 180 | 90 | 1.6 | 0 | 2/2/2/2/1/1/0 | 14 | 90 steelL, 20 steelH, 40 cells |
| Combat L "crusader" | 12 | 700 | 400 | 4.0 | 4 | 2/4/4/4/4/4/4 | 60 | 400 steelH, 200 cells, 2 items |
| Cargo S | 24 | 80 | 60 | 1.0 | 1 | 2/2/2/0/0/1/1 | 7 | 40 steelL, 10 cells |
| Cargo M | 18 | 160 | 120 | 2.0 | 2→6 | 2/2/2/0/0/1/4 | 30 | 120 steelL, 30 cells |
| Cargo L | 10 | 400 | 400 | 5.0 | 8→24 | 2/2/4/0/0/2/16 | 365 | 300 steelH, 150 cells |
| Civil S | 26 | 70 | 50 | 0.9 | 1 (200 pax) | 2/1/2/0/0/1/1 | 7 | 35 steelL, 10 cells |
| Civil M | 20 | 150 | 100 | 1.8 | 2 (800 pax) | 2/2/2/0/0/1/2 | 30 | 110 steelL, 30 cells |
| Civil L | 11 | 380 | 350 | 4.5 | 4 (3 000 pax) | 2/2/4/0/0/2/4 | 180 | 280 steelH, 140 cells |

Slots: Engine/Armor/Fuel/OBS/Weapon/Accessory/Cargo. Upgrades have 2 levels
each (canon). **Only Combat mounts weapons; only Cargo mounts container
upgrades** (canon). Probes = accessory-defined unmanned Cargo-S variant
(no crew ⇒ no survival clock, no hijack value; scanner accessory).

### 8.2 Upgrade effects (level 1 / level 2) [TUNE]
- Engine: speed ×1.15 / ×1.30; also fuel-matrix tuning slot (§8.3)
- Armor: HP ×1.3 / ×1.6, weight +8% / +16%
- Fuel tank: tank ×1.5 / ×2.0
- OBS: accuracy ×1.2 / ×1.4, targeting range +25% / +50%
- Cargo (Cargo hulls): containers ×1.5 / ×2 (M: 2→4→6; L: 8→16→24)
- Weight penalty: `speedEff = speed × (1 − 0.15 × loadFrac)`,
  `burnEff = burn × (1 + 0.5 × loadFrac)`, loadFrac = carried/capacity + armor
  weight [TUNE].

### 8.3 Fuel × engine matrix [TUNE]
Each engine is **tuned** at install to one fuel chemistry:

| Tuning \ burning | cold | hot | gas |
|---|---|---|---|
| cold-tuned | 100% eff | 60% | 40% |
| hot-tuned | 60% | 100% | 55% |
| gas-tuned | 45% | 55% | 100% |

Efficiency scales the burn rate (u/pc ÷ eff). Mixed tanks: burns worst-first
by default; policy-configurable.

### 8.4 Range (derived, canon)
`range = tank × matrixEff / burnEff`. UI shows range circles for current
loadout + the survival-limited range for crewed ships:
`rangeSurvival = survivalDays × speedEff`.

### 8.5 Crew
Min crew: S 1, M 3, L 8 [TUNE]. NPCs bind permanently (canon). Uncrewed ships
cannot fly (except probes).

### 8.6 Landing
Per canon §14: personal ship always; Combat-S anywhere; colony-fitted Civil-L
on wild worlds; everyone else needs spaceport dock ≥ hull size. Landing wear:
1% armor per landing [TUNE], waived when the destination has a Civic/civil
pilot governor.

### 8.7 Repair & rearm
Workshop repairs `5% HP/h` (basic) ×2/×4 by level [TUNE]; costs steel
proportional to HP restored; policy: whom to serve (canon).

### 8.8 Harvest accessory
`yield/day = R_max × (1 − d/d_max)²`, `hullDmg/day = D_max × max(0,(d_safe −
d)/d_safe)²`; d_max = 8 pc, d_safe = 5 pc, R_max = 120 u/day, D_max = 80 HP/day
[TUNE]. Harvest ticks draw down the star's hidden stock. Junk-collector:
30 T junk/day; claim-rig: claims ownerless hull in 2 h of proximity [TUNE].

---

## 9. Movement, interception & the network

### 9.1 Free flight
Straight segment A→B at `speedEff`; burns `burnEff` per pc + hover/idle rates
when loitering. Course changes allowed at any time (new segment from current
interpolated position).

### 9.2 Detection & interception
- **Telescope intel** (canon): a defender with scope over a moving ship reads
  heading/destination/equipment at telescope level: L1 heading only, L2 +
  destination estimate, L3 + full loadout manifest [TUNE].
- **Attack radius:** an attack-postured ship projects `r_engage = 3 pc × OBS
  range mult` [TUNE]. The tick worker solves segment-circle intersection for
  every (mover, engager) pair in the same spatial bucket (grid hash 64 pc
  [TUNE]); crossing schedules a combat event at the entry point/time.
- Combat resolution: §14 er— see §10 Combat below.

### 9.3 Stargates
- Build: `stargate_yard` on one endpoint; cost 1 500 steelH + 800 cells +
  200 Ignis + 200 Glace [TUNE], **split 50/50 if endpoints have different
  owners** (both must consent; canon).
- Traversal: instant, per-ship toll if public (any resource, owner-set; hard
  gate, canon). Capacity: 1 ship per tick per direction [TUNE].
- Destruction: gate dies with either endpoint planet (canon). Gates on
  artificial planets move with them (canon).

### 9.4 Tolls & public routes
Route owner sets `tollResource, tollAmount, whitelist`. Collected into the
gate's planet stock. Factions commonly toll chokepoints — intended.

---

## 10. Combat (deterministic)

### 10.1 Stats
- **ATK** = Σ mounted weapon power × OBS accuracy. Weapon power (level 1/2):
  light a2a 12/20, light a2g 10/16, medium 30/48, heavy (L-only) 90/140 [TUNE].
  Small Combat ships **need external OBS** (ground obs_station or a crusader's
  OBS umbrella, radius 5 pc [TUNE]) else ATK ×0.25.
- **DEF** = armor HP pool. Mitigation `mit = 0.15 × armorLevel` [TUNE].
- Ground units: turret light/heavy ATK 25/70, HP 150/400; tanks ATK 40, HP 250;
  anti-air variants get ×1.5 vs ships in atmosphere [TUNE].

### 10.2 Resolution (at arrival — canon)
Simultaneous rounds, 1 round = 1 tick:
```
dmg_to_B = max(0, ATK_A × (1 − mit_B)); armor_B −= dmg_to_B  (and vice versa)
```
First to 0 HP is destroyed → becomes **space junk** (canon) with cargo salvage
fraction 40% [TUNE]. Survivor keeps damage. Both-zero same round: both die.
Fleets: targets chosen by policy (focus-fire default); a2a weapons only hit
ships, a2g only hit ground/planet targets (canon business rules).

### 10.3 Defenselessness, hijack & conquest
- **Defenseless** = no operational weapons/turrets, or no fuel/energy to
  respond (canon).
- **Hijack (ship):** any Combat ship adjacent (< 0.5 pc) to a defenseless ship
  for **2 h** uninterrupted claims it + cargo (canon: warclass action).
  Crewed-and-alive ships cannot be hijacked unless disabled (fuel-out).
- **Conquest (planet):** destroy all turrets/garrison + orbital defenders →
  land ≥ 1 Combat-M/L ship → hold 24 h [TUNE] against recapture → ownership
  transfers: buildings & population stay, **bound NPCs are lost** (canon),
  stocks plunder 50% / 50% remain [TUNE]. Starter-only-planet exemption (§2.2).
- **Personal ship** is unattackable/unhijackable everywhere (canon).

### 10.4 Junk fields
Each kill drops `junk = 30% of hull build-mass` at the site; hazard radius
0.5 pc dealing 15 HP/crossing [TUNE]; collectable; black holes accept dumps
with zero consequence (canon).

---

## 11. Economy

### 11.1 Markets (physical, canon)
A market building trades **only stock physically on its planet**. Owner
configures: accepted pairs, rate mode (fixed | AMM), absolute & daily limits,
whitelist (canon). Landing rights gate access (spaceport policy).

### 11.2 AMM & liquidity (the no-currency answer)
- **Pool = (market, resourceA, resourceB)** with reserves x, y. Constant
  product `x·y = k`. Spot price = y/x. "Perfect balance" = the 50/50 seed.
- **Seeding:** the market owner (and, if allowed, visiting players) deposit
  both sides; LP shares accrue **0.25% fee per leg** [TUNE] + owner takes
  0.05% house cut [TUNE]. Cross-denominated trades route two legs = double fee
  (canon).
- **Where liquidity comes from:** planetary surplus. Expected behavior: mining
  worlds seed ore-vs-cells pools; the galaxy converges on **cells as the
  reserve leg** (intended; GAME_BIBLE §6). Thin pairs = big spreads =
  arbitrage hauling — a core gameplay loop, not a bug.
- **Withdrawal:** LP can pull anytime; pulled stock must physically fit planet
  storage.

### 11.3 Auctions & buy-now (non-fungibles)
Stop-price buy-now, or sealed max-bid timed auction (24/48/72 h): bids escrow
the named resource **on the auction planet**; winner pays their max? No —
**winner pays highest losing bid + 5% (second-price-ish)** [TUNE — friendlier
than pay-your-max]; losers refunded. Canon requires funds locked until close —
kept.

### 11.4 Recruitment pods (loot boxes)
- Bought from the main interface, paid in **any resource**; price per resource
  recomputed 4×/day [TUNE]:
  `price_r = B × (S_r / S̃)^0.7` where S_r = total universe supply of r,
  S̃ = median supply, B = 40 [TUNE]. (Common resources cost more units —
  canon sink.)
- Contents: **1 NPC** (canon). Rarity: Common 62% / Uncommon 24% / Rare 10% /
  Epic 3.4% / Legendary 0.6% [TUNE]; role uniform; people (human/Forged/Vess)
  cosmetic-weighted 60/30/10 [TUNE — Vess rare, always look rich].
  Governor-grade = Rare+. Rarity scales role bonuses +4%/tier [TUNE].

### 11.5 Global supply job
Periodic aggregation (4×/day) over planet stocks + ship cargo + pools + escrow
→ per-resource totals table (drives pod pricing; published as an in-game
"market census" screen — transparency is a feature).

---

## 12. Colonization & planet trading

**Colonize (mid-game, canon):**
1. Prereqs: `colony_program` unlocked; Civil-L hull + **colony fitting**
   (terraform core item + 2 000 cells + 500 steelH [TUNE]).
2. Load ≥ 500 settlers [TUNE] + seed stock (≥ 30 T food, 30 T water [TUNE]).
3. Fly to an **uninhabited planet**; land (colony ships may land wild —
   canon); 72 h establishment [TUNE]; planet becomes yours: rolls tiles/DNA
   live (seeded), settlers become population, ship converts into the first
   `depot` + `spaceport_S` (the hull is spent) [TUNE].
4. Accident risk on the settler leg per §3.2.

**Planet trading (canon):** planets list like any non-fungible (buy-now /
auction). Transfer moves ownership; bound governors transfer *with the world*
(they are bound to it, not to you); population stays.

---

## 13. Artificial planets (endgame)

- Prereq: `artificial_planet_yard` (T5) + Industrialist governance.
- Cost sketch: 50 000 steelH, 20 000 cells, 4 000 crystals mixed, 10 derived
  cores; build time 60 days [TUNE]. Built at any owned coordinate.
- Result: planet-entity, size M [TUNE], quality C fixed [TUNE], **no deposits,
  no climate crystals** (canon), popCap ×0.8 of natural M [TUNE], tiles rolled
  8–12 [TUNE], **integral Stargate** (counts as endpoint; moves with it).
- **Mobility:** 0.5 pc/day [TUNE], burns 200 cells/day while under way [TUNE].
  Everything docked/garrisoned moves with it.
- Attackable/conquerable like a planet [TUNE — flagged open in GAMEBOOK §27;
  this guide's stance: yes, it is a planet].

---

## 14. NFT bridge (opt-in, out of the hot path)

- Extract: lock DB row → mint (chain: **Polygon PoS** [TUNE], contracts from
  `.blockchain` repo minus GameEngine) → asset frozen in-game (canon).
- Burn: relayer observes → unlock → asset live again (canon).
- Mintable: planets, ships, NPCs, derived items, building cards (canon).
  **Factions:** DB entities in v0; on-chain banner mint = v2 [TUNE].
- Starter planet: never mintable (§2.2). Escrowed/auctioned assets: not
  extractable while locked.

---

## 15. Social, factions, comms

Per canon §5/§23. Concrete additions:
- Ping cost: free; rate-limit 20 pings/day/player [TUNE] (anti-spam).
- Ship-ping: any visible ship; reaction (auto-policy or manual) is the intel.
- Faction charter: 3+ founding members, cost 500 cells [TUNE], minted by one
  owner; moderators invite/ban; banner visible on all member planets (canon).
  Leaving/banned: banner drops after 24 h grace [TUNE].
- Sharing: planet-view shares and telescope shares are revocable grants
  [TUNE — revocable chosen; canon silent].

---

## 16. Monetization (fiat only — canon)

- €2.99 one random planet / €9.99 pack of 5 (canon). Stripe. Server mints via
  §2.2 generator near buyer.
- **Premium floors** (recovered mechanic, adopted): +€2 floors quality ≥ E,
  +€5 ≥ D, +€10 ≥ C [TUNE]. **A and B are never purchasable floors** —
  top grades stay luck (recovered rule, kept).
- No other real-money surface. Ever. (Canon.)

---

## 17. Player journeys (expected behavior)

**First hour (the Silence):** spawn → guided: build telescope → see 3–8
bodies → build mine + farm → tech-unlock probe_pad → launch probe at nearest
interesting body → first efficiency lesson (UI nudges: "your mine is at 34%
— assign workforce"). Goal: player understands *tilted bell + finite deposits*
inside session one.

**First contact:** telescope reveals an owned world (banner visible!) → ping →
(wait) → ping-back → chat → share → first trade or first fear. Expected
emergent split: traders open, warlords stalk, hermits go dark. All three are
valid and the game must not judge.

**The trade loop (mid):** player scripts Cargo-M: "load steel at A → gate to
B (pay toll) → sell vs cells → buy Glace → return → refuel if <30%" + a
Combat-M escort policy "engage anything that engages the convoy" — i.e. the
programmable-freighter example from the old gamebook, now first-class.

**The colonization arc (mid):** scan candidates (probe/lab intel: DNA
branches, deposits, quality) → build colony fitting → settler run (civil
pilot!) → establish → the new world's DNA forces a *different* specialization
→ trade between your own worlds begins (intra-empire logistics).

**War (mid-late):** intel via telescopes (loadout manifests at L3) → toll
strangulation or open siege → turret grind → conquest hold → occupied world
(lost NPCs, kept buildings) → junk fields + salvage rush + reputation
consequences (factions react; the game only displays).

**Endgame:** artificial planet as mobile capital/gate-anchor: walk the network
to a dead region, re-link isolated players (end someone's Fermi era
deliberately), or park a fortress beside a rival's home star and *harvest it
menacingly*.

---

## 18. Anti-abuse & guardrails

- Starter planet: account-bound 45 d, unconquerable while only-planet (§2.2).
- One free starter per account; device/payment heuristics for multiaccount
  farming; new-account resource-transfer cap: ≤ 100 T received/day for first
  14 days [TUNE].
- No teleporting value: all transfers ride ships or gates (canon co-location) —
  this *is* the anti-RMT design.
- Rate limits: pings (20/day), market re-pricing (1/min/pool), policy edits
  (no limit — encouraged).
- Toll gouging is legal (player politics). Spawn isolation guarantees a free
  player is never *forced* through a toll to reach first trade (starter
  guarantee ensures self-bootstrap).
- Supernova griefing: harvesting is anonymous-by-default but **a telescope at
  L3 identifies harvesters in range** [TUNE] — restraint politics become
  enforceable by players, not by us.

---

## 19. Balance targets (for simulation)

- Time-to-first-trade (median, active player): **< 5 days** [TARGET]
- Time-to-second-planet without paying: **10–20 days** [TARGET]
- Colony ship at: **~30–45 days** [TARGET]
- Small-planet full build-out: **~2 weeks**; large: **~2 months** [TARGET]
- Cells inflation: global cells/day growth within ±20% of population growth
  [TARGET]
- No dominant strategy > 60% win-share in sim cohorts [TARGET]
- New-player 7-day retention path never blocked by another player's action
  [HARD REQUIREMENT]

*Simulation findings and applied patches: `BALANCE_LOG.md`.*
