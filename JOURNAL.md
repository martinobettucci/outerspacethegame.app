# ATG — Decision JOURNAL (raw log)

> Append-only, chronological log of raw design decisions as they were made.
> `GAMEBOOK.md` is the reconciled canon; it can be rebuilt from this journal.
> Each entry: date · topic · decision · rationale/notes. Newest at the bottom.

---

## 2026-07-11 — Architecture-restart brainstorm

**Context.** Restoring stalled development. The game was never really built:
`.app` is a Jekyll marketing/whitepaper site (its "engine" is just
`jekyll-hyperstack`, an Opal Ruby→JS bridge, not a game engine); `.blockchain`
holds Foundry/Solidity where the game was meant to live (`Planet/Ship/Building`
ERC721s, `Material/Cristal/Fuel` ERC20s, an on-chain `GameEngine.sol`);
`.presale` holds presale contracts + a server.

### Persistence & storage
- **Drop the blockchain-as-game-engine approach.** It is the reason dev stalled:
  a real-time tick-based simulation cannot run on-chain.
- **Postgres = single source of truth; server authoritative.**
- **Keep the chain only as an opt-in NFT export layer.** Extract → lock DB row +
  mint NFT (asset frozen in-game). Burn → credit asset back ("burned net as
  assets"). A relayer reconciles chain events ↔ DB. Reuse existing NFT contracts;
  drop `GameEngine.sol` from the hot path. **Fungibles never touch the chain.**

### Universe
- **Single global persistent universe.** No rooms/shards/resets.
- **Isolation is emergent (Fermi paradox):** new players spawn in a sparse pocket
  and cannot see/reach others until scope + routes grow. No special starter-zone
  system needed.
- **Space is a continuous 2D coordinate plane, rendered 3D-style.** (Corrected an
  earlier node/edge-graph assumption — stranding/void-travel rules require true
  coordinates. Navigation & interception computed in 2D.)

### Celestial bodies
- **3 landable classes: small / medium / large.** Class is intrinsic, not derived
  from tiles.
- **Giants = stars: un-landable, un-conquerable. Role TBD.**
- Sprite px sizes `128/256/512/2048` are art only.
- **Tiles rolled at discovery/mint:** small 4–8, medium 6–12, large 10–20 (ranges
  overlap deliberately; class first).
- **Tech DNA:** each planet rolls a *partial* subtree of the global tech tree at
  discovery; some cards never available there → forces trade.

### Discovery / comms
- Scope = combined range of all your telescopes. Ping anything in scope.
- Ping requires **ping-back** to establish → opens chat → optional share of
  planets & telescopes.
- Public routes may carry **tolls, payable in any resource** the owner chooses.
- Discovery via travel or **probes** mapping the void.

### Movement
- **Stargate = optional safe instant shortcut**; free-flight to any coordinate is
  always allowed, limited only by fuel + survival.
- Stargate exists if you own both endpoints (you build it) or the price is split
  between the two owners.
- Stargates are tied to endpoints; **if the destination planet dies, the exit
  drops you at a fixed void coordinate** → emergent **pirate chokepoints**.
- **Tolls are hard gates:** can't pay ⇒ can't take the Stargate.
- **Two death clocks:** fuel-out = **stranded, still owned** (recoverable);
  survival-out (water/food/O₂) = **crew dead, ownership stripped**, salvageable by
  anyone with the right equipment → **salvage economy**.
- **Interception:** free-flight paths crossing an attack-ship's radius trigger
  automatic combat.

### Hovering
- Hover consumes resources like space flight.
- **Over your own planet → drains that planet's stock.**
- **Over a foreign planet → drains the ship's own stock**; the ship may
  **auto-trade** to refill (`if food < 20 buy 200 food best effort` = first
  available matching pair).

### Materials
- **Basic** (always mineable) & **advanced** (sometimes present) = **fungible**.
- **Derived** (industry-combined) = **non-fungible, per-unit, intrinsically
  rare** (a few units max at a time).
- Non-fungibles = derived materials, items, NPCs, planets → the mint/burn surface.

### Buildings (autonomous)
- Capability gated by type: **spaceport** (land), **marketplace** (trade),
  **workshop** (repair), **mining/industry** (mint/transform). Must land to use a
  planet.
- Configurable per building: mining/industry run at **% of current efficiency**;
  repair scope (which items/ships, friends-only); marketplace accepted trades +
  rates + **absolute & daily limits**; landing = self / friends / neighbours.
- **Card acquisition:** burn NFT · per-planet tech tree (resource sink) · buy
  from players (direct or auto-trade).

### Efficiency
- **Right-shifted bell curve; per-domain AND per-resource.** Never overpopulate
  or max any stock; optimum leaves headroom. Overcrowding → efficiency drop +
  illness.
- **UI required:** per-resource/unit curve + live position; **per-planet stats
  page** of all units and their curves.

### Governance
- Small = no governor; medium = 1; large = 3 (else **half efficiency**).
- Governor = NPC. **Permanent, never changeable.**
- **Effective capability = intersection (most-restrictive) of all governor
  masks** → large planets powerful but hard to steer.
- **Governance preview is required** (permanent choice).

### NPCs
- From **loot boxes (NPC-only)** or **burning NFTs**.
- **Permanent binding, shares host's fate** (building explodes / ship
  destroyed-or-stranded / planet conquered → NPC lost). Closes the loot-box sink
  loop.

### Economy / trading
- **No currency, ever.** Value denominated in universe resources; seller chooses.
- **Fungibles → AMM**, constant-product pool per pair, priced off planet-pair
  liquidity toward "perfect balance" (50/50). N² pair fragmentation & emergent
  reserve resources are intended.
- **Non-fungibles → stop-price buy-now or timed sealed max-bid auction** (funds
  escrowed, pulled from winner).
- **Any planet-available resource can pay.** Cross-resource trades route as two
  legs → **marketplace fee charged twice** ("double fee"); marketers leverage
  pair scarcity.
- **Loot box price** dynamic, recomputed several times/day (admin-configurable),
  based on **total universe supply per resource** (more abundant ⇒ costs more
  units ⇒ sinks common resources). Needs a global-supply aggregation job.

### The spine
- **One policy/instruction engine** powers all autonomous behaviour (ship
  missions, free-flight combat rules, building production, repair, market terms,
  landing, governor masks, auto-trade). Based on the original programmable-ship
  syntax. **MVP = predefined strategy library**, not full free-form programming.
- **Tick-based sim** + on-demand catch-up; client interpolates for real-time feel.

### Rendering
- Galaxy map = three.js star field (3D-styled, 2D nav). Planet interior =
  isometric 2D tiles + card hand (renderer TBD; Pixi/canvas likely).

### Process
- **Created `GAMEBOOK.md` (canon) and `JOURNAL.md` (raw log).** Journal is the
  rebuildable source of truth for decisions.

### Still open (carried forward)
Giant stars' role · full landing-permission list · planet-opening bootstrap
(no-spaceport first landing) · combat resolution · Stargate destruction edge
cases · loot-box randomness/rarity tables · tick-worker server language ·
inherited ship-catalog reconciliation · isometric renderer choice.

---

## 2026-07-11 — Session 2 (personal ship, starter/monetization, combat, tech tree)

### Personal ship — PROPOSAL, undecided
- Player incarnated; moves only between owned/ally planets; **invulnerable**
  (can't be attacked/stranded/die), consumes nothing.
- Author unsure — "maybe cosmetic and should be dropped."
- **Recommendation: keep but reframe** (drop "does nothing" framing). Three real
  jobs: (1) identity — pick governor archetype/politics at game start;
  (2) new-player governance bootstrap — lends your politics to the parked planet
  so a player with no spare governor NPC can access politics-gated tech (answers
  the planet-opening bootstrap open question); (3) governance-preview instrument
  for §11 (park to see a governor-of-your-type's mask before committing a
  permanent one). Value fades as real governors arrive — acceptable.
- **Not written to canon** — awaiting author decision (kept as GAMEBOOK §21).

### Starter & monetization — SETTLED
- Free start: 1 random planet + few lower-bound random resources.
- **Buying planets = the business model, the only fiat entry point** (via Stripe;
  purchase mints a new random planet). €2.99 one / €9.99 pack of 5. First planet
  always kept. Stuck starts escape by buying (but see guardrail).
- Framed non-pay-to-win: buying = more board presence + more tech-DNA rolls, not
  power; planets also won by conquest / bought from players for resources.
- **Guardrail (canon):** buying must never be the *only* escape — every seed
  guarantees a minimal telescope/probe path so a free player can always
  eventually reach the network. Fast escape, not only escape.
- OPEN: where a purchased planet spawns (near buyer vs fresh isolated pocket).

### Combat — SETTLED
- **Pure stats, deterministic, no RNG**, but **resolved at effective range using
  the target's state at arrival**. Travel takes days → target may change → I can
  win on paper at launch and lose on arrival. Risk is temporal, not random.
- Consequences: intel has a shelf life (telescopes/shares gain military value);
  ship speed buys certainty; feints/reinforcement-in-transit emerge; no
  save-scumming.
- OPEN: whether defender detects incoming attacks (ambush vs visible race).

### Tech tree — SETTLED (formal model)
- **One global tech DAG**; nodes = capability/cards (mostly buildings). Node
  fields: category, prerequisites (parents), unlock requirements (resource cost +
  buildings-present-with-min-stats + governor politics + industry present),
  placement cost, tile cost.
- **Per-planet seed deterministically masks the DAG**: which branches exist +
  max depth per branch. Availability = f(global DAG, seed); recomputable, nothing
  stored per planet.
- **Two phases:** (1) **Unlock** once per planet — meet prereqs + pay unlock cost;
  unlock is **permanent knowledge** even if a prereq building is later destroyed.
  (2) **Place** repeatable — pay placement cost + consume free tiles; limited by
  tiles + governor mask.
- Consequences: seed → forced specialization → mandatory trade; governor politics
  gate whole branches → on a large planet a node needs *all 3* governors to
  permit it (intersection); double resource sink (unlock + placement).
- Note: tech tree is expected to evolve during development; the model is stable,
  the node contents are not.

### Docs
- GAMEBOOK: added §18 Tech tree, §19 Starting & monetization, §20 Combat, §21
  Personal ship (proposal), renumbered Open questions → §22.

---

## 2026-07-11 — Session 3 (stars/junk, detection, starter guarantee, tech nuances)

### Starter guarantee — SETTLED
- A planet's minimum **extractable** resource total is always **≥ price of
  telescope + probe + spare**. **Telescope & probe are never gated** — first
  level of *every* tech tree. Makes the anti-paywall guardrail enforceable.

### Planet spawn — SETTLED (resolves prior OPEN)
- Free-first and bought planets spawn **as near to the player as possible**, but
  random → sometimes distant. Game never reveals whether it was luck.

### Defender detection — SETTLED (resolves §20 OPEN)
- **Telescope-gated intel**: by telescope level, defender reads incoming ship's
  **heading, destination, equipment**. Can also **ping a ship** to gauge intent.
  Telescopes = scope + combat-intel + defense.

### Tech tree nuances — SETTLED
- **Knowledge vs production:** unlock is permanent, but production of an accessory
  needs the live industry that mints it. Lose the beam-laser foundry → keep
  stock, can't mint more until rebuilt.
- **All buildings = exactly 1 tile.** Large planets valuable for *diversity*, not
  quantity.

### Personal ship — SETTLED → canon
- Author accepted the reframe. Promoted GAMEBOOK §21 from proposal to canon
  (identity + governance bootstrap + governance preview; invulnerable).

### Stars, black holes & space junk — SETTLED (resolves giant-stars OPEN)
- **Giant stars = finite fuel distributors.** Three fuel types **cold / hot /
  gas**, each alters ship travel. Harvest needs a **special accessory**.
- **Supernova on fuel-end**: annihilates everything in a radius; **remaining fuel
  is unknowable** → blind shared risk (tragedy of the commons).
- **Black hole = special star = clean junk sink** (dump junk, no consequences).
- **Space junk:** dumping in open space makes a **hull-damage hazard radius**
  (weapon / area denial); **recoverable** with right equipment; **destroyed ships
  become junk**. Black holes are the only consequence-free disposal.

### Control principle — SETTLED
- **Manual-first:** automation optional. Can manually order a hovering ship to
  attack a planet/ship in range now. **Stackable defensive conditions** (attack
  all-in-range / only-unknowns / respond-to-attack; stack e.g. attack-unknowns-
  in-orbit + respond-to-attack — retaliates even vs a friend who fires first).

### Deferred
- Stripe wiring left to development time.

### New opens
- Fuel-type travel effects; black-hole fuel/supernova behaviour; supernova vs
  owned/purchased planets (mitigation?).

### Docs
- GAMEBOOK: resolved giant-stars/spawn/detection opens; added §22 Stars/black
  holes/junk; folded manual-first + stacking into §15; fuel types into §8;
  knowledge-vs-production + 1-tile into §18; starter guarantee into §19;
  promoted §21 to canon; Open questions → §23.
