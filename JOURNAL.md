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

---

## 2026-07-11 — Session 4 (industry/construction, starter safety; ships opened)

### Industry & construction — SETTLED
- **An industry mints exactly one thing** (single recipe): consumes its exact
  inputs and produces its one output whenever inputs are available (throttled by
  efficiency %). Three outputs ⇒ three industries ⇒ three tiles.
- **Constructing a building** = pay its resource cost from on-planet resources +
  one free tile; any discovered/unlocked building can be built once payable.
  **Resources may be conveyed from other owned planets** (freighters) to
  accelerate the focused planet.

### Starter safety — SETTLED
- The **free starter planet is never within any supernova destruction radius** —
  guaranteed safe. Other owned/bought/conquered planets keep the risk.

### Ships — DISCUSSION OPENED (not yet canon)
- **Fuel types require engine optimizations or accessories.** Each engine
  optimization / accessory publishes how each fuel type (cold/hot/gas) modifies
  the ship's stats → build your ship for the fuel you can source. Details being
  brainstormed; §14 reconciliation pending.

---

## 2026-07-11 — Archaeology sweep (ALL branches, all 3 repos) — RECOVERED, pending triage

> Recovered from old branches; NONE of this is canon yet. Marked for owner triage.
> Sources: `.app` (Updates-ETHCC & martinobettucci-economics-1 `_economics/*`,
> whitepaper, `_config.yml`, asset trees), `.blockchain` (`src/*.sol`, tests),
> `.presale` (`PresaleNft.sol`, scripts, server).

**Contradicts current canon (already superseded by owner's newer decisions):**
- Old vision was a **multiverse**: many universes; a "too-balanced" universe
  spawns a fresh one; newcomers go to the newest, veterans keep the old; no
  cross-universe migration. → Superseded by single global universe + Fermi
  isolation. *Underlying concern survives: how does one global universe avoid
  stagnation once balanced?*
- Old vision was **fully on-chain, no server, open-source client**. → Superseded
  by Postgres-authoritative.
- Old **dual EGA(ERC721 external)/IGA(ERC1155 internal) economy with in-game
  tokens** + claim bridge. → Superseded by no-currency + opt-in NFT bridge.
- Old entry path **MATIC/Polygon + OpenSea/Rarible**; whitelist-mint funds the
  per-universe treasury. → Superseded by fiat/Stripe planet purchases.

**Recovered mechanics worth ADOPTING (recommend):**
- **Planet CLIMATE axis: cold / hot / exo / radio**, with named archetypes
  (iceage, swamp, ocean, desert, venus-like, high-CO2, extreme-radioactive,
  giga-one-continent, close-sun…). Ties planet type ↔ ship shields (hot/cold/
  radiation, old gamebook) ↔ fuel types (cold/hot/gas). Stars are cold vs hot in
  art. *This unifies three disconnected systems — highest-value recovery.*
- **Trade requires physical co-location:** to list a resource in a private store
  it must physically be on a planet the seller owns. Geography-gated markets →
  reinforces freighter logistics. Fits our model cleanly.
- **Ship model `Category {Combat, Harvest, Civil} × Size {S,M,L}`** (from
  `Ship.sol`). "Harvest" category = star-harvest/mining/salvage answer.
- **"Uninhabited Planet"** distinct object type (`Type{STAR,UNINHABITED_PLANET,
  PLANET}`) = the colonizable/explorer-payoff planet; buying = the fast lane.
- **Planet rarity `Class A–F`** orthogonal to Size (quality band: deposits /
  population ceiling / tech-DNA depth). We only have Size.
- **Premium purchase floors minimum rarity** (+10/20/40/100% → F→B), but top
  class never buyable (always luck) — a non-pay-to-win premium option for §19.

**Recovered ideas to DECIDE on:**
- **Factions / banners** layer (flag art exists: banners1/2, simpleflags; tagged
  `flag:true`) — never written up. Alliance/faction system?
- **Regulated price band** (economy min/max caps) on fixed-price stores "to
  encourage fair trades and a mastered curve for newcomers" — newcomer
  protection vs free AMM/auction pricing.
- **One-click liquidation exit:** burn licence → auto-list ALL your assets on the
  market → reclaim proceeds. (Reframe for no-currency: liquidate extracted NFTs.)
- **Perpetual creator royalties** on future sales of assets you minted (forever)
  or bought (limited) — could live on the NFT-bridge layer only.
- **One-mint-ever guarantee** per universe (contract locks the team out of ever
  minting more) — a trust/anti-inflation commitment; reconcile with fiat planet
  sales (which mint new planets continuously).
- **Fuel as de-facto reserve currency** — old code made Fuel the only freely
  transferable token; tagline "$FUEL your ambitions." Lean into it?

**Concrete old numbers (mostly obsolete, logged for reference):**
- Presale: base 100 MATIC (later 0.01 test), +10%/wave, premium tiers
  [0,+10,+20,+40,+100]% → min class [F,E,D,C,B]; supply caps ~2500 across 4
  waves; 10% royalty to treasury; burn-refund 90%; AAVE yield on funds; VRF
  randomness + stored `dna` word (origin of our tech-DNA seed).
- Old on-chain Planet traits: cristal/material capacity 5k–100k, production 1–10,
  block-based **linear** regen with `// for now linear` TODO (our efficiency
  curve is the intended non-linear successor).

**Lore / branding to preserve:**
- Studio **P2Enjoy**, hashtag **#P2Enjoy** (anti "play-to-earn" / "gamified
  Ponzi"); treasury = the **"game committee."** Tagline **"Explore, harvest and
  conquer: $FUEL your ambitions!"** Credits roster (Geppilihp, mbCrypto, Batuhan
  Karagol, mt_dev, Anna Gombos, av_grash). Reserved sci-fi font shortlist
  (Orbitron, Kepler-452b, Spacefrey, Dune Rise, Cryptex…). Easter-egg leetspeak
  HTTP header. Naming: OS-PLANET/SHIP/BUILDING, OS-CRISTAL/FUEL/MATERIAL.
- Two dangling unwritten pages referenced but never authored: a mechanics-side
  "stores" doc.

---

## 2026-07-11 — Session 5 (post-archaeology triage → canon)

### Ship taxonomy — SETTLED → canon (§14)
- **`Category {Combat, Harvest, Civil} × Size {S,M,L}`.** Old named ships become
  roles/loadouts. Ship = hull+slots+tanks+crew+cargo; **range derived** (fuel ×
  fuel-type efficiency − weight); fuel × engine matrix; survival caps crewed trip.

### Planet acquisition & expansion — SETTLED → canon (§19, §3)
- **Buy = fast pass** (fiat, spawns near you). **Colonize** uninhabited planets
  with **colony ships (very costly → mid-game)** = explorer's payoff. **Planets
  are tradeable between players**; also won by conquest. All non-buy paths free.
- **Uninhabited planet** added as a distinct body type (§3).

### Harvest accessory — SETTLED → canon (§14, §22)
- Harvesting needs the **harvest accessory** on a **Harvest-category** ship.
  **Closer = more yield + more hull damage**, with a **zero-damage / low-reward
  standoff distance**. Pairs with the star's unknowable fuel + supernova risk.

### Landing — SETTLED → canon (§14)
- Personal ship always; **small Combat ships land anywhere**; **colony ships land
  on wild/uninhabited planets** (bootstrap); everyone else needs a spaceport/dock.

### Factions — SETTLED → canon (§23)
- Players **collectively mint a faction**; **minter decides members** + grants
  **moderators** (invite/ban). Factions are **pingable**. **Affiliation shown on
  every player & planet.** **Rules are player lore, NOT game-enforced** (may
  demand tribute / threaten attack-and-ban, but the game only enables + displays).

### Dropped
- **Newcomer price bands** — dead mechanic.
- **One-click liquidation exit** — skipped.

### Still pending owner go/no-go (recovered, recommended)
- **Planet climate axis** (cold/hot/exo/radio) unifying climate ↔ shields ↔ fuel.
- **Physical co-location trade** (must own the planet the resource sits on).
- **Planet rarity Class A–F** (quality band orthogonal to size).

### Docs
- GAMEBOOK: rewrote §14 (ships), expanded §3 (body types) & §19 (expansion),
  added harvest gradient to §14/§22 refs, added §23 Factions, Open questions → §24.

---

## 2026-07-11 — Session 6 (climate, quality/depletion, local-goods/remote-mgmt)

### Planet climate — SETTLED → canon (§3, §8)
- Climate = **cold / hot / exo / radio**; **determines presence/absence of
  advanced resources** and shapes what can operate there. Basic materials always
  mineable regardless. **Fuel is NOT climate-derived — fuel = stars** (owner:
  "fuel is tied to the stars now, it's better game design").

### Planet quality & depletion — SETTLED → canon (§3, §8)
- **Quality** (Class A–F band, orthogonal to size) sets **caps + abundance**
  (deposit/population ceilings + starting richness).
- **Deposits are finite and deplete with extraction — planets run dry.** Higher
  quality lasts longer; nothing is infinite. Drives expansion + partially answers
  anti-stagnation.

### Goods-local / management-remote — SETTLED → canon (§13)
- **Goods are planet-local:** buildings/industry/markets act only on the resources
  physically on their planet; haul with freighters to move value. Nothing
  teleports.
- **Management is remote:** you manage any owned planet from the UI **without
  moving the personal ship** — only resources co-locate, not the player. Personal
  ship still a governance boost when parked, never required (owner: "requiring to
  move the personal ship to manage is too much of a hassle").

### Open items closed
- The three parked recovered items (climate / co-location / rarity Class) are now
  all resolved into canon. Remaining climate question: whether hostile climates
  require ship/building **shields** (left open).

### Docs
- GAMEBOOK: §3 climate+quality+depletion, §8 climate→advanced + depletion, §13
  goods-local + remote-management; trimmed §24.

---

## 2026-07-11 — Session 7 (characters/settlers new canon + 2021 art-brief archaeology)

### NEW canon (owner's own words) — SETTLED
- **Characters = human / robot / humanoid alien; he / she / androgynous** (§12).
- **Pilot is dual-role:** can be **ship crew** OR **governor** (§12).
- **Civil pilots:** crew → reduce population/settler trip accidents; governor →
  safer landing & leaving for you and visitors (§12).
- **Colonization needs settlers:** move population from an existing planet to the
  new colony (Civil transport), with **accident risk** mitigated by a Civil pilot
  (§19).

### ARCHAEOLOGY — 2021/2022 concept-art briefs (RECOVERED; some pending forks)

**Salvageable design facts:**
- **Modular upgrade sprites:** ship upgrades are **visual overlays composited onto
  emplacements on the base ship sprite** (engine/armor/cargo/fuel, 2 levels each)
  — confirms the hull+slots model visually. Ships **512×256 px, 16-bit**.
- **Buildings: 3 levels — basic / normal / advanced** (= building stats/tech-tree
  depth), each with **climate-adaptation art variants**. Isometric **512×256,
  16-bit**. Icons **256×256**.
- **Refinery chain:** planets extract **crystals** (color-coded by planet type:
  blue/white/violet/black) → refinery outputs **"fuel cells," a universal
  resource ("the spice, à la Dune")**. Refinery drawn in 3 levels × 3 planet
  types.
- **Poison planets: NO buildings can be built, BUT they yield poison crystals** →
  implies **unbuildable / harvest-only** planet climates.
- **Concrete RESOURCE MASTER LIST (first real one):**
  - *Low-level (12):* oxygen, carbon, hydrogen, ore, lithium, sulfur, gold,
    uranium, deuterium, aluminium, phosphor, silicon.
  - *Special (combination or events):* water (normal, heavy), food (×3 types),
    medicine (×3 types), steel (light, heavy).
  - *Crystals:* per planet type — hot, cold, poison, oxygen (colored).
  - *Fuel cells:* single universal card.
- **Market/lore:** city markets with humans/robots/aliens trading crystals,
  spices, scrap metals, scattered spaceship parts; **social classes** (poor & rich
  humans/robots); **aliens are ALWAYS very rich**. Futuristic look; official
  artwork style is the reference.

**FORKS raised to owner (need decision before promoting to canon):**
1. **Planet climate taxonomy conflict:** this session set **cold/hot/exo/radio**;
   2021 briefs use **hot/cold/temperate/poison** (+ "oxygen" for crystals). Need
   one canonical set (+ whether poison = unbuildable/harvest-only).
2. **Fuel cells vs star-fuel:** 2021 = refinery(crystals)→fuel cells = universal
   "spice"; current canon = fuel from stars (cold/hot/gas). Coexist (star-fuel =
   propulsion; fuel cells = universal reserve resource) or one supersedes?
3. **Adopt the 2021 resource master list** as the canonical starting set?

**Superseded / art-pipeline only:** exact 512×256 / 256×256 / 16-bit sprite specs
and delivery cadences are asset-production notes, not game rules (kept for the art
pipeline doc, not GAMEBOOK).

---

## 2026-07-11 — Session 8 (forks 1A/2A/3A settled + Silviu 2022 archaeology)

### Forks resolved → canon
- **1A Climate = hot / cold / temperate / poison** (map exo→temperate,
  radio→poison); **poison = unbuildable / harvest-only** (yields poison crystals).
  Updated §3, §8.
- **2A Fuel cells & star-fuel COEXIST:** propulsion fuel = star-sourced
  (cold/hot/gas); **fuel cells = universal refined "spice"** (crystals→refinery),
  the de-facto reserve. Two distinct things, do not conflate. §8, §24.
- **3A Adopt 2021 resource master list as v0 base** (extensible for 2026). New
  §24: basic (12 low-level) / crystals (climate-gated) / refined (steel, water,
  food, medicine) / fuel cells / derived items / star propulsion fuel.

### Silviu 2022 concept-art conversation — RECOVERED
- **Visual direction (§26):** isometric, colourful/bright, old-school; deep
  blacks, dark purples, vivid yellow; consistent with Anna's environments +
  `palette.jpeg`. Modular assets composited by the engine (base + overlay layers).
- **Ships:** 3 categories × 3 sizes = 9 season-1 ships, **PRODUCED before
  2022-06-27** (PSDs). Category set in the art = **Combat / Cargo / Civil** (repo
  has `assets/icons/ships/` Fighter/Transport/Civilian icons confirming this) —
  conflicts with `Ship.sol` Combat/Harvest/Civil → FORK (§27).
- **Upgrade slots + business rules:** engine, armor, cargo capacity, fuel tank,
  primary a2a weapon, secondary a2g weapon; **only combat ships carry weapons;
  only cargo ships carry cargo upgrades**; 2 levels each; overlay layers.
- **Two build layers (§25, FORK):** ground layer (standalone buildings) + space
  layer (central space station + modules on Y-branch anchors; small=2, large=6
  modules; dynamic runtime assembly).
- **Building/district list (§25):** space station, spaceport, casino, business/
  commerce, diplomatic, military, research, industrial/factories, faction HQ.
- **Ground units (§25):** ~10 — light/heavy turrets, cannons, ground tank,
  anti-air tank, combined ground+air tank; 2–3 levels each.
- **Stall history:** production paused 2022 due to HQ move, company rename, bank
  account change, treasury needs, and other tech priorities. (Not a game rule.)
- **Assets on disk:** `assets/icons/ships/{Fighter,Transport,Civilian}` (16/32/48px
  nav icons); `assets/icons/{planets,factions}` also present. Full 512×256 ship
  PSDs referenced but not located in this repo — to hunt for.

### New forks logged (§27)
1. Ship categories: Combat/Cargo/Civil (art+assets) vs Combat/Harvest/Civil
   (code) — recommend Combat/Cargo/Civil hulls + harvest-as-accessory.
2. Orbital space-station build layer — in scope for 2026 or defer?
3. Resource tier nuance — fungible-refined vs per-unit-derived split.

### Docs
- GAMEBOOK: §3/§8 climate+fuel; new §24 Resources, §25 Content catalogue, §26
  Visual direction; Open questions → §27 (+3 forks).

---

## 2026-07-11 — Session 9 (ship categories, artificial planets, tier split)

### Ship categories — SETTLED → canon (§14)
- **Combat / Cargo / Civil × Small/Medium/Large** = the 9 season-1 hulls
  (confirmed by produced art + `assets/icons/ships/`). **Harvest is NOT a hull
  category — it's an accessory role** (harvest/junk-collector/scanner accessories
  on any hull; Cargo best for storage).
- **Upgrade slots** (2 levels each): engine, armor, cargo capacity, fuel tank,
  primary a2a weapon, secondary a2g weapon. **Only Combat carries weapons; only
  Cargo carries cargo-capacity upgrades.**

### Artificial planets / space stations — SETTLED → canon (§3, §6, §25)
- **A space station = an artificial planet.** Reuses the planet model (tiles,
  buildings, population) but **built from scratch in empty space for tremendous
  resources + time** (ultimate sink). **Arbitrary placement, moves slowly, and
  carries its own Stargate that moves with it** (mobile network infrastructure).
- **No natural deposits/climate crystals** → lives on imports; it's strategic
  infrastructure, not a resource source.
- 2022 Y-branch modular-station concept → kept as *visual* reference only.
- Sub-opens (§27): population/quality caps? conquerable? movement speed/fuel cost?

### Resource tier split — CONFIRMED (§24)
- Fungible-refined (steel/water/food/medicine/fuel cells) vs per-unit derived
  items (rare accessories). Locked.

### Docs
- GAMEBOOK: rewrote §14 (Combat/Cargo/Civil + harvest-accessory + upgrade rules);
  §3 body types + artificial planets; §6 mobile Stargate; §25 station=artificial
  planet; §24 tier split confirmed; §27 trimmed (3 forks resolved, station
  sub-opens added).

---

## 2026-07-12 — Session 10 (Game Bible, Design Guide, simulation balancing loop)

### New documents
- **GAME_BIBLE.md** — lore canon: the Silence (Fermi), the Starfall Wars &
  Scattering, three peoples (Humans / the Forged / the Vess — always rich),
  the Sovereign & personal-ship incarnation, places/substances/society lore,
  crystal names (Glace/Ignis/Virid/Nox), "cells" as the spice, themes & tone.
- **DESIGN_GUIDE.md** — complete mechanical spec: every system given concrete
  formulae & numbers (all invented values tagged [TUNE]): tick/lazy-eval sim,
  universe gen & spawn, population/illness/efficiency formulas, deposits &
  depletion, governance masks, v0 tech tree & recipes, hull tables, fuel
  matrix, movement/interception, deterministic combat + hijack/conquest,
  AMM/auctions/pods economy, colonization, artificial planets, NFT bridge,
  monetization, player journeys, anti-abuse, balance targets.
- **BALANCE_LOG.md** — the balancing loop record.

### Simulation balancing loop (subagent campaigns)
- **Round 1:** 4 archetype campaigns (Industrialist, Corsair, Voyager,
  Breaker) vs v0.1 → 20 critical findings (bootstrap deadlock, isolation >
  range, frozen population, cell chain ~30× off, risk-free piracy 14×,
  crusader one-round alpha, junk walls, NFT vault/RMT exploits, shill
  auctions, governance laundering) → 38 patches → v0.2.
- **Round 2:** 2 fresh verifiers vs v0.2 → bootstrap/growth/combat patches
  verified; found 1 mis-applied patch, colony-chain starvation
  (silicon/uranium/tiles), unmeetable trade target, disengage-rule abuses,
  auction/NFT vault re-breaks, colony sniping, + 5 canon conflicts → 17 more
  patches → v0.3.
- **GAMEBOOK canon amendments** (per its own change rule): §6 exit scatter,
  §12 governors transfer on conquest ("lost to the conqueror"), §13 AMM
  seeding wording + escrow exception, §16 token-is-a-deed-not-a-bunker +
  packing window, §22 star flares below ~5% + harvest attribution.
- **Round 3:** focused verification of v0.3 patched surfaces (results in
  BALANCE_LOG).

---

## 2026-07-12 — Session 11 (CLAUDE.md registered, repo reconciled to standards)

### Problem
Owner registered a durable conventions file (CLAUDE.md, in French) and asked to
reconcile the repo, write the full backlog, and update the design system to a
"groovy dark" direction (Out There-like, P2Enjoy palette shaded darker, 2D
sprites over 3D environments), with UI prototypes via OpenAI Images BEFORE
finalizing. Still preproduction — no app code.

### Decisions & work
- **CLAUDE.md registered verbatim** + « Spécificités du projet » local block:
  preproduction status, design-doc precedence (GAMEBOOK > BIBLE > GUIDE),
  root JOURNAL.md = docs/JOURNAL.md equivalent, mandated session branch as a
  documented §13 exception, English docs / French commits, dark-theme
  exception to §4, balancing-sims as the sole subagent exception.
- **Compliance docs created:** README.md (status, corpus map, stack, limits),
  CHANGELOG.md ([Non publié] = design corpus; [Publié] = legacy Jekyll site),
  docs/DAT.md (target architecture: Postgres-authoritative, tick worker,
  relayer, Stripe; flows, data model, trade-offs, recovery),
  docs/BACKLOG.md (full scope P0→P7 with honest statuses).
- **docs/DESIGN_SYSTEM.md written as DRAFT [~]:** groovy-dark tokens derived
  from the P2Enjoy chart (bg #060810/#0D0D0D, violet ramp, yellow #D9CF4A as
  signature accent), Orbitron/Inter/JetBrains Mono, components (card hand,
  efficiency-curve widget, governance preview), a11y & responsive rules,
  documented deviations, and the §10 prototype prompt kit.

### Limitation (flagged, not assumed)
- **No `OPENAI_API_KEY` exists in this environment** (checked shell env, .env
  files, home configs). The prototype generation step is **blocked — human
  action required** (add the key). Consequently the design system stays [~]
  and P0.3 prototype/review items stay [ ] in the backlog. No prototypes were
  faked.

### Verifications
- Repo state inspected before changes (git clean, no docs/ dir previously).
- All new docs cross-checked against GAMEBOOK/DESIGN_GUIDE for consistency.
- No app code written (preproduction respected).

---

## 2026-07-12 — Session 12 (prototypes générés, design system finalisé)

### Problem
Le prototypage était bloqué faute de clé ; le responsable a précisé que la
variable du cloud worker s'appelle `OPEN_AI_KEY` (et non `OPENAI_API_KEY`).

### Observations & work
- Clé `OPEN_AI_KEY` vérifiée présente ; 4 prototypes générés avec
  **gpt-image-2** (1536×1024) : 01 carte galactique, 02 colonie isométrique +
  main de cartes, 03 marché, 04 gouvernance → `docs/design/prototypes/`.
- **Observation visuelle (§16)** de chaque image : direction « groovy dark »
  validée ; 02 et 04 quasi conformes au système (courbe d'efficience avec
  point vif et zones verte/rouge ; matrice d'intersection + modale
  d'irréversibilité avec confirmation tapée ; les trois peuples en portraits).
- **Décision d'art direction : identité pixel-sprite généralisée** (y compris
  planètes de la carte galactique — pas de rendu photoréaliste).
- **Corrections canon consignées** (artéfacts de prompt à ne jamais
  reproduire) : aucun « CREDITS » (pas de monnaie, GAMEBOOK §13) ; aucun
  « END TURN » (temps réel à ticks) ; planètes en sprites ; ancrage palette
  sur #111A30 + profondeur violette.
- `docs/DESIGN_SYSTEM.md` → **FINAL v1** (§11 = revue des prototypes) ;
  backlog P0.3 mis à jour ; variable corrigée dans CLAUDE.md et README.

### Verifications
- 4 images ouvertes et observées avec les capacités de vision (pas de
  validation sur mémoire) ; conformité des tokens vérifiée à l'œil sur
  chaque écran ; aucune clé ni valeur secrète écrite dans le dépôt.

---

## 2026-07-12 — Session 13 (pipeline d'assets, props HTML, stubs, itération HTML→image)

### Décisions (canon assets, dictées par le responsable)
- Tailles : planètes 128/256/512 ; étoiles/trous noirs 2048 ; bâtiments et
  vaisseaux 512×256 ; portraits 512×1024 ; cartes 512×1024 composites (art
  512×512 + zone stats HTML) ; icônes ressources 256×256. Unités sol :
  256×256 **hypothèse à confirmer**.
- **Mécanique de calques universelle** : base + overlays transparents de même
  taille (accessoires vaisseaux, niveaux/climat bâtiments, variantes unités,
  météo/conditions planétaires : smog, glace, feu, poison, radioactif…).
- **Companion maps obligatoires** : chaque image a `X.bump.png` (relief) et
  `X.light.png` (sources lumineuses en pixels blancs + alpha). Le moteur doit
  relighter les sprites (bump) et **propager la lumière à l'environnement et
  aux sprites voisins**.
- **Desktop + tablettes uniquement, pas de mobile.**

### Réalisé
- `docs/ASSET_PIPELINE.md` (le contrat) ; arborescence `assets/game/` +
  convention de nommage swap-ready.
- `generate_stubs.py` → 85 assets ×3 fichiers (255 PNG, 1,9 Mo), étiquetés
  « ce que l'art doit représenter » + `manifest.json`.
- **Prop sheet HTML** (`docs/design/props/index.html`) : chaque élément à sa
  taille exacte, toggles d'overlays, carte composite avec stats, démo lumière.
- **Vérification visuelle (§16)** : capture headless Chromium observée ;
  défaut trouvé et corrigé (§18) — les stubs d'overlay opaques masquaient
  leur base → régénérés transparents avec étiquette en coin ; labels étoiles
  2048 mis à l'échelle ; re-capture observée : empilement démontré.
- **Itération HTML→gpt-image-2 validée** : 05-card-html-render (fidélité
  quasi parfaite au prop) et 06-layered-lighting-scene (référence
  d'acceptation du rendu lumière/calques). Méthode officialisée
  (ASSET_PIPELINE §7, DESIGN_SYSTEM §11).
- DAT (exigence moteur lumière), DESIGN_SYSTEM (§7 plateformes, §9 renvoi
  pipeline, §11 round 2), BACKLOG P0.3, CHANGELOG mis à jour.

### Vérifications
- 2 captures du prop sheet observées (avant/après correction) ; 2 rendus
  gpt-image-2 observés ; 255 stubs présents (`find | wc -l`) ; aucun secret
  dans le dépôt.

---

## 2026-07-12 — Session 14 (reproche du responsable : couverture incomplète — corrigé)

### Problème (signalé par le responsable)
1. Les portraits suggéraient un couplage race↔rôle ; règle réelle : **tout
   peuple peut tenir tout rôle, gouverneur compris**.
2. Le set de stubs ne couvrait qu'un sous-ensemble (~15 %) : bâtiments
   précognisés absents (casino, districts, QG faction, chantiers…), upgrades
   par coque absents, unités sol incomplètes.
3. Question : ce vide existe-t-il aussi dans les mécaniques/simulations ?

### Réponse factuelle (consignée au BALANCE_LOG)
- Les SYSTÈMES étaient complets et simulés (tours 1–3) ; la LARGEUR de
  contenu (stats de tous les bâtiments/unités/upgrades) était mince comme les
  props. Rien n'était simulé sur le catalogue complet. Corrigé aujourd'hui ;
  **tour 4 d'équilibrage contenu planifié et requis** avant de considérer ces
  valeurs comme testées.

### Corrections
- Canon : GAMEBOOK §12 + DESIGN_GUIDE §4.2 — peuple ⟂ rôle (cosmétique).
- DESIGN_GUIDE §5.1 : catalogue complet 27 bâtiments (tier, politique, effets
  L1→L3 [TUNE], mapping spaceport/shipyard/market = niveaux du même bâtiment).
- DESIGN_GUIDE §10.1 : table complète unités sol (6 types, 15 sprites, stats).
- generate_stubs.py réécrit data-driven : **576 assets ×3 = 1 728 fichiers**
  (bâtiments ×3 niveaux ×climat hot/cold ; upgrades PAR COQUE selon slots —
  armes Combat only, cargo Cargo only, OBS M/L Combat, colony_fitting Civil
  M/L ; + vaisseau personnel, sonde ; météo sur tous climats×tailles ;
  portraits matrice 3 peuples × 6 rôles ; 42 cartes ; 30 ressources) +
  gallery.html auto-générée.
- Prop sheet : références réparées (unit_l1, card_npc_diplomat), vérif
  automatique des src (aucune référence cassée) + preuves observées
  (overlay arme Combat-M, portrait vess_soldier, casino L3).

---

## 2026-07-12 — Session 15 (GIF animés, unités 512×256, règle de complétude, tour 4 lancé)

### Décisions du responsable
- **Unités sol : 512×256** — elles se posent comme des bâtiments, mêmes
  dimensions (l'hypothèse 256×256 est annulée).
- **Tous les props hors cartes sont des GIF animés** ; les cartes restent en
  PNG statique. Les companions bump/light suivent le format et la cadence de
  leur sprite (GIF synchronisés). Contrainte GIF documentée : transparence
  binaire → l'intensité des light maps est portée par la luminosité du pixel.
- **Règle de complétude inscrite dans CLAUDE.md** (« Spécificités du
  projet ») : aucun livrable à moitié ; tout ensemble énumérable est livré
  exhaustivement ou les manques sont listés explicitement ; toute valeur non
  testée reste [TUNE] et déclenche un tour de vérification.

### Réalisé
- Générateur réécrit : sorties GIF 2 frames (label/lueur pulsés) via
  quantisation P + transparence binaire ; unités 512×256 ; cartes PNG.
  Régénération complète : **1 602 GIF + 126 PNG (576 assets ×3), 11 Mo.**
- Références du prop sheet migrées .png→.gif (hors cartes), zéro référence
  cassée (script de contrôle) ; ASSET_PIPELINE §1/§1bis/§4 mis à jour ;
  DESIGN_GUIDE §10.1 précisé (placement visuel type bâtiment, pas de tuile).
- Vérification visuelle : GIF unité cannon L2 observé (512×256, étiquette).
- **Tour 4 d'équilibrage lancé** (2 campagnes : économie du catalogue +
  militaire du catalogue) — correctifs à l'atterrissage.

---

## 2026-07-12 — Session 16 (tour 4 appliqué → DESIGN_GUIDE v0.4)

### Problème
Valeurs du catalogue (session 14) non testées ; règle de complétude exige le
tour d'équilibrage avant fiabilité.

### Observations (2 campagnes, arithmétique fermée)
- Économie : pas de stratégie dominante (>60 %) dans les lectures saines,
  MAIS ambiguïtés dangereuses (casino en points de pourcentage = cassé ;
  remises de recherche empilables jusqu'à −105 % = déblocages gratuits ;
  « ×2 per level pair » indéfini) et 19 coûts T2+ manquants (bloquant).
- Militaire : échelle des unités saine ; tank_ground sans cible atteignable ;
  tank_combined dominé ; « atmosphérique » indéfini ; rasage a2g en minutes ;
  mondes mercantiles sans AUCUNE défense possible ; forteresse à 28 croiseurs.

### Décisions / correctifs (v0.4)
Frais en points de base (LP 25 bp, maison 25 bp, casino +5 % relatif) ;
remises multiplicatives cap −50 % ; fuelcell_plant 40/80/160 batches/j +
1 extracteur/gisement ; fonderie en continu (M6) ; district diplomatique →
quota de pings + slots de partage (canon scope préservé) ; table des coûts
T2+ adoptée ; tank_ground anti-débarquement ×1.5 ; canon = bande d'orbite ;
« atmosphérique » défini + matrice de ciblage ; tank_combined ATK 70 ;
slots de garnison pondérés L1/L2/L3=1/2/3 (M7) ; bâtiments inciblables si
garnison>0 + HP ×10 ; turret_light apolitique ; règle boucliers climat
adoptée (ouvert GAMEBOOK §27 clos — usure déterministe, temperate sûr).

### Vérifications
- Chaque correctif tracé constat→patch au BALANCE_LOG (tour 4) ; aucun
  patch des tours 1–3 rouvert ; GAMEBOOK amendé (ouvert clos).

---

## 2026-07-12 — Session 17 (correction canon : CONSTRUIRE ≠ INSTALLER)

### Problème (signalé par le responsable)
Le guide conflatait fabrication et installation des unités sol ; le patch
4b-F7b (turret_light apolitique) soignait le symptôme. Règle réelle, clef de
voûte de l'économie : on « monte la carte » et on PRODUIT là où la politique
et la tech le permettent ; l'objet produit (canon, tourelle, tank, upgrade,
accessoire) est un item portable — transporté, vendu, installé ailleurs.
L'installation n'est jamais gated par la politique du monde receveur. Les
mondes sans production militaire se défendent en important ou en faisant
hover des vaisseaux défensifs.

### Aveu de compréhension (demandé explicitement)
Compris à moitié seulement : la séparation existait pour les objets forgés
(fonderie → workshop/slots) mais PAS pour les unités sol. Corrigé.

### Corrections
- GAMEBOOK §9 : bloc canon « BUILD ≠ INSTALL » (unités/upgrades/armes/
  accessoires = items portables ; bâtiments = carte échangeable mais
  construction locale, jamais déplaçable).
- DESIGN_GUIDE v0.4.1 : §6 principe + install/désinstall 6 h [TUNE], unité en
  transit = 1 large item/container (§7) ; production turret_light re-gated
  Militarist ; « politics-free » retiré de §5/§10.1.
- BALANCE_LOG : erratum 4b-F7b (supersédé) + audit d'impact des tours 1–4
  (fortress/garnison et économie inchangés ; nouveau marché de la défense =
  voulu).
- **Tour 5 lancé** (sim ciblée) : viabilité de l'import de défense, fenêtre
  de rasage pendant l'import, exploits de la séparation (désinstallation
  sous siège, stockage anti-pillage, renforts en cours de bataille,
  mercenariat de garnison, mintabilité NFT), et spec manquante de la
  production d'unités (qui produit quoi, à quel débit).

---

## 2026-07-12 — Session 18 (tour 5 appliqué → guide v0.5)

### Verdict tour 5
La clef de voûte CONSTRUIRE ≠ INSTALLER tient : import de défense bouclé en
≈8 j (dans la grâce de colonie), escortes en orbite couvrent la fenêtre nue,
aucun patch antérieur rouvert.

### Correctifs (v0.5)
- R5-1 (bloquant) : le military_district PRODUIT les unités (1/48·24·12 h ×E
  par niveau, file unique, niveaux ≤ niveau du district, coût = colonne
  §10.1) + coûts de déblocage des 6 cartes d'unités.
- R5-4/6 : VERROU DE SIÈGE — ni install ni désinstall quand un hostile est
  engagé sur la planète ; hors siège, 3 installations parallèles max.
- R5-5 : les items entreposés comptent dans le pillage de conquête (25 % en
  valeur census) ; les unités installées sont capturées avec le monde.
- R5-7 : l'upkeep suit l'unité partout (garnison, entrepôt, cargo) ; impayé
  = unité hors ligne.
- R5-8 : unités sol ajoutées à la liste mintable (désinstallées seulement).
- R5-3 : règle documentée « 1 escorte Combat-M blindée ≈ 1 raider bird ».
- Moniteur M8 : coût du pack défense vs revenus d'un hub.

### Reste
Tour 5b de confirmation lancé (les calculs R5-2 utilisaient les taux
proposés ; re-vérification maintenant qu'ils sont dans le guide).

---

## 2026-07-12 — Session 19 (tour 5b : CONFIRMÉ, clôture — guide v0.5.1)

- Vérification texte : les 7 patches du tour 5 présents et corrects.
- R5-2 recalculé aux taux officiels : import défense 7,0 j (stock) /
  13,7 j (production) vs grâce 14 j — marge fine, nudge M8 porteur.
- Grief « bee solitaire » : pas de verrouillage durable (contre-jeu réel).
- 3 lignes appliquées (v0.5.1) : escrow d'enchères rendu au stock AVANT le
  calcul du pillage (ferme l'esquive 25:1) ; verrou de siège = événement de
  combat ACTIF uniquement ; unités hors ligne ≠ garnison pour la
  ciblabilité des bâtiments.
- **TOUR 5 CLOS — CONSTRUIRE ≠ INSTALLER est canon vérifié.** M1–M8.

---

## 2026-07-12 — Session 20 (WAREHOUSE : spec du responsable intégrée, tour 6 lancé)

### Décisions du responsable (réponses au questionnaire)
- **Warehouse** (bâtiment T1 commun) : entrepose véhicules terrestres ET
  spatiaux + items, en **balances séparées S/M/L véhicules + compteur
  items** (ex. L1 = 2L/4M/6S + 50 items) ; contenu = **zéro consommation** ;
  parking allié configurable **par planète ET par warehouse** (allié =
  membre de faction ou whitelist — le joueur sert sa lore) ; **seul le
  propriétaire retire** son véhicule ; à la conquête, **les warehouses sont
  LE butin** (matériel prêt à l'usage, non abîmé).
- **Plancher sans warehouse** : « genre 2 2 et 10 » → interprété 2 M + 2 S
  + 10 items [SIGNALÉ à confirmer] ; concerne les non-fongibles.
- **Usine bloquée** quand tampon gratuit plein ET warehouses pleins.
- **Dépôts fongibles = mécanique de jeu** : plafond du « prêt-à-servir »
  (extrait/vendable/transformable) → facilite le census ; **planchers à
  définir PAR SIMULATION (directive du responsable)** → mission du tour 6.
- **Allié installateur** : peut installer/renforcer chez moi ; occupe MES
  slots, consomme MES ressources, mais reste **seul maître de son
  paramétrage et de ses déplacements**.
- **Verrou de siège étendu aux warehouses** (« la guerre commence, c'est
  trop tard »).
- **Docks du spaceport = débit de commerce** : limite des visiteurs posés
  simultanés hors warehouse (= max de tradeurs en même temps) ;
  **réservations** de docks (soi/alliés, « prêts à partir ») ; sortir un
  vaisseau du warehouse = temps + **dock libre requis** ; unités sol se
  déploient direct au sol (minutes → quelques heures).
- **Exceptions warehouse (canon)** : seul état où un véhicule peut être
  **freeze pour export NFT** et seul moment où **l'équipage peut descendre
  et revenir dans la main du joueur** (amendement GAMEBOOK §12 — les
  gouverneurs restent à jamais liés).
- Upkeep : uniquement quand installé (remplace « l'upkeep suit partout » du
  tour 5 ; l'anti-abus devient la capacité).

### Interprétations signalées (à corriger si besoin)
1. Plancher « 2 2 et 10 » = 2 M + 2 S + 10 items (pas de L sans warehouse).
2. « Une seule enchère par trade centre » = une listing active de
   véhicule/item **par bâtiment market** [TUNE].

### Docs
GAMEBOOK §9/§12/§16 amendés ; DESIGN_GUIDE v0.6 (§3.3b plafonds fongibles à
définir par simulation, §5.1 warehouse, §6 refondu) ; stubs : +warehouse
(586 assets ×3) ; tour 6 lancé (logistique warehouse + étude des planchers).

---

## 2026-07-12 — Session 21 (tour 6 appliqué → guide v0.7)

### 6b — l'étude des planchers (directive responsable) a livré :
- **Franchise de base obligatoire** (sans elle : starter sur-plafond au
  spawn, mines à l'arrêt jour 0) : **S 800 / M 1 000 / L 1 200 T**.
- Échelle des dépôts conservée (+200/400/600 T) + coûts de niveau ; la
  vraie monnaie est la tuile ; les dépôts = endurance de siège (pression de
  blocus : starter 24 j — rétention sauve ; hubs 4–9 j — arme à la bonne
  échelle de temps).
- **Frein unilatéral** : libre ≤ 0,7, branche droite de la cloche au-dessus,
  arrêt à 1 — ne jamais punir le stock bas (spirale anti-logistique évitée).
- Fuel partage le plafond (pas de tankage séparé) ; **réserves AMM comptées**
  (fermes de dépôts = spécialisation mercantile) ; livraisons peuvent
  déborder, seule la production s'arrête.

### 6a — warehouse vérifié :
- Blocage d'usine → marché (stockage ≈ 55 % de la valeur + tuile) ; docks
  spécifiés 2S/+2M/+2L (colonie fraîche : docks S → nudge « upgrade
  spaceport à la fondation ») ; puits de pods survit à la libération
  d'équipage (M9) ; staging avancé accepté (M10) ; vente avec équipage =
  libération auto ; **règle d'impound** (trahison d'allié : gel des tirs →
  désinstallation 72 h) ; doctrine anti-raid par gate gravée (réserves
  warehouse = seule défense réactive, 0–12 h d'alerte).

### En attente du responsable
- Buffer sans slot L : la production lourde exige-t-elle un warehouse dès la
  première unité (statu quo, cohérent) ou faut-il 1 slot L au buffer ?
- Interprétations antérieures toujours ouvertes : plancher « 2 2 et 10 » ;
  « une enchère par trade centre » = par bâtiment market.

---

## 2026-07-12 — Session 22 (réponses responsable : marché par bâtiment, warehouses publics/privés)

### Décisions (canon)
- **Pas de slot L gratuit** : la production lourde exige un warehouse dès la
  première unité (statu quo confirmé).
- **Par bâtiment market, UN canal automatique** : une listing d'item
  (buy-now OU enchère) — ou — UNE paire de trading. La largeur de marché
  coûte des bâtiments et des tuiles (rareté des paires = physique).
- **La limite ne s'applique qu'au full-auto** : offre d'achat MANUELLE
  toujours possible, à n'importe quel prix, sur le contenu visible d'un
  warehouse public ; résolution manuelle entre joueurs.
- **Warehouses publics/privés** : public = contenu consultable UNIQUEMENT
  par un acheteur posé sur un dock de commerce ; privé = contenu caché,
  inutilisable comme stock de vente — réserve stratégique à entrées/sorties
  exclusivement manuelles.

### Docs
GAMEBOOK (bloc « Markets & manual trade ») ; DESIGN_GUIDE v0.7.1 (§6 ventes
confirmées, règle lourde confirmée, §11.2 un bâtiment = une paire).
Tour 7 lancé : économie de la topologie de marché (coût en tuiles des paires
vs viabilité des hubs, 4a re-vérifié) + exploits du canal manuel (spam
d'offres, intel via browse, réserve privée vs census).

---

## 2026-07-12 — Session 23 (tour 7 appliqué → guide v0.8)

- **Verdict : topologie viable.** Un canal par bâtiment force la
  spécialisation (hubs rationnels : 2–4 paires ; la largeur migre vers des
  réseaux multi-planètes) sans tuer les hubs (max-hub 7 canaux tient sur une
  grande 20 tuiles, ~1,4 % des mondes).
- **Étoile-cellules = fait de design** (N−1 bâtiments vs N(N−1)/2) ; trades
  croisés hors cellules = 100 bp. Triade d'hospitalité (food/water/fuel vs
  cells) + nudge UI.
- **Patches sérieux** : anti-DoS docks (dwell 24 h max configurable,
  éviction auto vers survol hors siège, browse orbital pour alliés avec
  share grant, réserver 1–2 docks) ; rate-limit d'offres manuelles (1 par
  couple acheteur-item, 20/j, expiration 48 h).
- **Clarifié** : warehouse public = vitrine ET fuite (les réserves de guerre
  vont en privé — le choix public/privé est stratégique) ; census publié en
  totaux globaux uniquement, jamais de ventilation par planète/warehouse ;
  le canal manuel ne peut pas contourner l'AMM (les fongibles n'entrent
  jamais en warehouse).

---

## 2026-07-12 — Session 24 (exception planète marchande)

- Responsable : le résultat du tour 7 est voulu — la lore vit hors des
  mécaniques hardcodées. **Une exception canon** : la **planète marchande**
  (gouvernance Mercantile effective) trade les **ressources de survie**
  (eau, nourriture, oxygène) de façon **innée** — toujours disponible, sans
  bâtiment market ; le joueur fixe un **plancher de réserve personnelle**
  par ressource, le surplus est marchandable. Le vrai privilège du monde
  marchand.
- Interprétations signalées : marchande = gouvernance Mercantile effective ;
  liste de survie stricte (fuel exclu — à confirmer) ; prix = taux fixe du
  propriétaire + house cut standard.
- GAMEBOOK (bloc Markets & manual trade) + DESIGN_GUIDE v0.8.1 ; moniteur
  M11 (cannibalisation éventuelle des paires food/water — vérif au prochain
  tour complet, pas de sim dédiée pour une règle unique).

---

## 2026-07-12 — Session 25 (fuel inné confirmé, slots de trade par niveau)

- **Fuel EST marchandable en inné sur planète marchande** (correction de mon
  interprétation stricte) : liste innée = eau, nourriture, oxygène, fuel.
- **Upgrader un trade centre ajoute un slot** : market L1/L2/L3 = 1/2/3
  canaux (listing item OU paire) — la topologie du tour 7 se détend dans le
  sens déjà vérifié (max-hub : 3 bâtiments au lieu de 7) ; pas de re-sim.
- Ouvert en discussion : spécialisations des gouvernances restantes
  (Industrielle, Scientifique, Civique, Diplomatique) — proposition soumise
  au responsable dans le chat, PAS encore canon.

---

## 2026-07-12 — Session 26 (spécialisations de gouvernance → canon, tour 8 lancé)

### Décisions (responsable : « j'adore tout » + 3 ajouts)
- **Les 6 privilèges innés adoptés** : Militariste (monopole de guerre),
  Marchande (trading inné survie+fuel), Industrielle (monde-forge : retool
  instantané, temps −25 %), Scientifique (regard profond : scans révèlent
  ADN-tech/gisements/qualité, +1 palier d'intel, vendable), Civique
  (monde-havre : maladie ÷2, accidents colons ÷2, zéro usure d'atterrissage),
  Diplomatique (terrain neutre : dock+trade sans contact établi, chats
  multi-parties).
- **Sanctuaire full-diplomate** : tous les gouverneurs Diplomates (1/moyenne,
  3/grande) ⇒ aucune hostilité ne peut être INITIÉE sur la planète (orbite +
  sol) et elle est INCONQUÉRABLE (ne change de mains que par commerce). Prix :
  branche militaire à jamais forclose + engagement permanent.
- **Stacking même archétype** : plusieurs gouverneurs du même type empilent
  les avantages de stats de la planète (magnitudes croissantes [TUNE]).
- **Stats individuelles des NPC** : même type/rareté ⇒ boosts différents,
  tirés au sort à l'ouverture du pod (RNG de génération seedé, canon
  déterminisme respecté) — baseline de rareté × U(0.5, 1.5) par stat [TUNE].

### Docs
GAMEBOOK §11/§12 ; DESIGN_GUIDE v0.9 (§4.1, §11.4). Tour 8 lancé :
parité d'attractivité des 6 privilèges, exploits du sanctuaire (parking de
flotte immunisé ? hub inattaquable ?), math du stacking, économie des rolls
de stats (profondeur du gamble des pods).

---

## 2026-07-12 — Session 27 (tour 8 appliqué → v0.9.1 ; UNE décision soumise)

- **Sanctuaire corrigé en trêve au sol** (fidèle au mot du responsable « en
  planète ») : sol + vaisseaux dockés avec droits ; la bande de survol reste
  espace normal ; coques Combat dockent uniquement sur permission explicite ;
  dédocker = espace normal immédiat. Le parapluie orbital (mon
  interprétation) créait un parking de flotte immunisé — supprimé.
- **Trade-off constaté et gravé** : full-diplo ⇒ market L2+ forclos — les
  sanctuaires sont des terrains de médiation et des bazars manuels, jamais
  des hubs AMM. C'est l'équilibre, ne pas « réparer ».
- **Stacking chiffré** : base × {1, 1.6, 2.0} ; militariste = cadence jamais
  files ; industriel = durées jamais débits, retool ≤1/24 h ; scientifique
  cap +1 palier ; les privilèges de permission ne stackent pas. Magnitudes =
  constantes d'archétype (jamais multipliées par le roll du NPC).
- **Terrain neutre** : lève l'exigence de contact, jamais la blacklist du
  propriétaire.
- **SOUMIS AU RESPONSABLE (F1d)** : exiger en plus un diplomatic_district L3
  pour activer le sanctuaire — sinon un seul diplomate Rare rend n'importe
  quelle moyenne minière inconquérable pour toujours (ré-ouvre l'anti-pillage
  R5-5). Statut : PENDING dans le guide, pas appliqué.
- Moniteur M12 (parts d'installation par archétype, seuil 50 %).

---

## 2026-07-12 — Session 28 (F1d approuvé : sanctuaire = statut qui se gagne)

- Responsable : « ok pour un statut qui se gagne » — le sanctuaire exige
  gouverneurs full-diplo ET diplomatic_district L3 construit. GAMEBOOK §11 et
  DESIGN_GUIDE v0.9.2 amendés ; R5-5 re-fermé ; tour 8 entièrement clos.

---

## 2026-07-12 — Session 29 (backlog exhaustif adossé au GAMEBOOK)

- Directive responsable : le backlog liste chaque mécanique/workflow du
  GAMEBOOK et la Definition of Done de chaque unité inclut la vérification
  contre les sections GAMEBOOK/DESIGN_GUIDE citées (réf de fonctionnement).
- BACKLOG réécrit : règle de référence dans l'en-tête (« an item with no
  reference may not start »), P1→P7 déroulés en ~60 unités couvrant les 27
  sections du GAMEBOOK + blocs canon récents (warehouse, docks, sanctuaire,
  privilèges, stacking, canal manuel, pods/stat rolls, sièges/impound,
  NFT-bridge warehouse-only…), chacune balisée `→ GB §x; DG §y`.

---

## 2026-07-12 — Session 30 (GO responsable : début de l'implémentation — P1)

### Problème
Le responsable a donné l'instruction explicite de **commencer la construction
du jeu** (« start building the full game while sending me evidence of the
progression in images and videos »). Le backlog conditionnait P1+ à ce feu
vert ; deux décisions P0.4 restaient bloquantes : langage du tick worker et
moteur de rendu isométrique.

### Décisions
1. **Tick worker : TypeScript (Node 22)** — DAT §2 amendé.
   - *Pour* : l'évaluation paresseuse `(value, rate, t0)` est calculée par
     l'API (lecture lazy) ET par le worker (matérialisation aux événements) ;
     le canon exige un résultat bit-identique (DG §1). Un seul langage/runtime
     élimine par construction la divergence double-implémentation. Types
     partagés client/API/worker via `@atg/shared` ; une seule chaîne d'outils.
   - *Contre (assumé)* : s'écarte de la préférence Python (§3 CLAUDE.md) —
     préférence applicable « lorsque ce choix est adapté » ; ici le couplage
     aux types du jeu domine. Python reste le choix pour d'éventuels outils
     IA/ML annexes (ex. campagnes d'équilibrage hors-ligne).
2. **Renderer isométrique : PixiJS v8** — DAT §2 amendé.
   - *Pour* : l'exigence moteur (ASSET_PIPELINE §3) — bump maps, light maps
     émissives, propagation de lumière aux sprites voisins — impose WebGL ;
     Pixi fournit batching, shaders/filters custom et un pipeline sprite
     mature. Un canvas 2D custom ne tient pas l'exigence d'éclairage.
   - *Contre (assumé)* : dépendance lourde de plus ; la validation finale
     (micro-prototype passe de lumière, backlog P0.4) sera faite sur la vraie
     vue planète — l'item backlog reste `[~]` jusqu'à cette preuve.
3. **Monorepo `game/` dans ce dépôt** (pnpm workspaces : `shared`, `server`,
   `client`, `e2e`) — le site Jekyll historique reste à la racine, intact.
4. **Auth v1 différée au chunk D** (email + mot de passe, scrypt natif Node,
   sessions serveur) — sera documentée au DAT avant implémentation (§5).

### Réalisé (chunk A — scaffolding vérifié)
- `game/` : workspace pnpm, `docker-compose.dev.yml` (Postgres 16 conteneurisé,
  image surchargeable `ATG_DB_IMAGE` pour egress restreint), `.env.example`
  documenté variable par variable, scripts `runDev`/`stopDev`/`resetDb`.
- `@atg/server` : Fastify (`/health`, `/ready`), migrateur SQL minimal
  (transactions + verrou consultatif + `schema_migrations`), squelette tick
  worker (heartbeat), seed placeholder honnête (pré-schéma).
- `@atg/client` : React + Vite, tokens design system « groovy dark » en CSS
  custom properties, polices auto-hébergées (Orbitron/Inter/JetBrains Mono),
  textes centralisés (i18n), coquille avec états chargement/succès/erreur.
- `@atg/e2e` : Playwright (Chromium préinstallé), 2 tests (liaison OK, état
  d'erreur API coupée), captures JPEG observées.

### Vérifications
- `pnpm -r build` : OK (3 paquets). Tests unitaires serveur : 2/2.
- Intégration (vraie base conteneurisée) : migrations idempotentes + `/ready`
  → 2/2. E2E : 2/2, captures `shell-ready.jpeg` / `shell-error.jpeg`
  observées : conformes aux tokens (fond violet-noir, panneau #111A30, titre
  Orbitron, accent jaune, états succès vert / erreur rouge + bouton Retry).
- Contrainte d'environnement documentée : le CDN Docker Hub est bloqué par la
  politique d'egress de la sandbox ; miroirs `mirror.gcr.io`/ECR publics OK →
  variable `ATG_DB_IMAGE` ajoutée au Compose.

### Conséquences
P1 est officiellement entamé sur la branche de session
`claude/game-build-progress-i77mxo` (CLAUDE.md « Spécificités » mis à jour).
Prochain chunk : noyau de simulation déterministe (schéma baseline, file
d'événements, lazy eval, RNG seedé) + catalogue de contenu complet dans
`@atg/shared`.

---

## 2026-07-12 — Session 30 (suite) : chunk B — noyau de simulation + catalogue

### Réalisé
- **Schéma baseline** (001_baseline.sql) : players/sessions, bodies (planètes
  + étoiles avec stock caché et R_nova), deposits & planet_stock en modèle
  lazy (amount, rate_per_day, as_of), buildings (1 tuile = contrainte UNIQUE,
  statuts constructing/active/demolishing), tech_unlocks, npcs (stat_rolls
  individuels), ships, events. docs/SCHEMA.md (conventions et pourquoi) +
  PROD_MIGRATIONS.md (contrat §12, baseline « jamais déployé »).
- **Sim core** : evalLazy/whenReaches/rebase (pur, borné min/max) ; file
  d'événements avec réclamation FOR UPDATE SKIP LOCKED, transaction par lot,
  handlers idempotents (construction/demolition), garde anti-boucle sur
  handlers manquants ; worker branché sur TICK_MS.
- **Catalogue COMPLET @atg/shared** : 30 ressources (ids = clés d'assets),
  28 bâtiments, 6 unités sol, 9+2 coques, 16 recettes, 9 items, arbre tech
  35 nœuds avec masque de seed (95/80/55/30/12 %) + élagage DAG + masques
  de gouvernance par intersection. Formules §3.2/§3.3b/§3.4 + RNG sfc32
  cyrb128 (bit-identique tous moteurs JS).

### Décisions/écarts (visibles, en attente d'équilibrage)
- `CostBundle.crystal_any` : les coûts « crystal » du catalogue s'acquittent
  dans le cristal climatique de la planète payeuse (résolution au paiement).
- TUNE_GAPS (buildings.ts) : coûts de montée de niveau génériques L2=3×/
  L3=6× placement (ratio du ladder depot) là où le guide ne chiffre pas ;
  spaceport/market L3 = double du nœud L2 chiffré ; scanner coûté.
- TECH_TUNE_GAPS (techtree.ts) : arêtes de prérequis proposées (le guide ne
  livrait pas le graphe) ; plafond de profondeur L1/L2/L3 = 20/30/50 %.
- Correction de robustesse pendant les tests : fuite de client Postgres sur
  lot vide (break sautait release) → restructuré en finally ; test de
  concurrence 2 processeurs × SKIP LOCKED = exactement-une-fois vérifié.

### Vérifications
- shared : 34/34 (déterminisme RNG, propriétés E(u), complétude 30/28/6/9,
  DAG acyclique, jamais-masqués, élagage sur 200 seeds, intersection des
  masques). server : 8/8 unit (lazy, health) + 7/7 intégration vraie base
  (migrations idempotentes, file d'événements, idempotence, concurrence,
  kind sans handler signalé). Builds tsc verts.

---

## 2026-07-12 — Session 30 (suite) : chunk C — univers, poche de Fermi, seed

### Réalisé
- `gen/rolls.ts` : rolls purs depuis seed (tailles 50/35/15, climats
  40/25/25/10, qualités F→A, tuiles par classe, gisements 3–7 avec cristal
  climatique — poison ⇒ Nox toujours, 0 tuile), starter dédié (tempéré, D–F,
  ≥ 10 tuiles, 7 gisements garantis), étoiles (F0 caché, R_nova), noms
  procéduraux seedés.
- `gen/spawn.ts` : poche de Fermi transactionnelle avec collision-check en
  base (isolement ≥ 150 pc, anneau voisin 150–240 pc quand l'univers a des
  actifs), grants de départ, vaisseaux (personnel + Cargo-S), pilote commun
  (people 60/30/10, roll individuel ×U(0.5,1.5)), anti-abus (bind 45 j,
  is_starter jamais mintable).
- `services/players.ts` + `passwords.ts` : inscription = joueur + spawn en
  UNE transaction ; scrypt natif Node (format auto-décrit) ; erreurs typées.
- Seed dev via le VRAI flux (CLAUDE.md §8) : demo@atg.local /
  neighbor@atg.local (mots de passe de démo documentés au README), idempotent.

### Décisions/écarts documentés
- **Bande dégénérée étoile-starter** : R_nova(S) = 40 pc et garantie
  « étoile ≤ 40 pc » ⇒ l'étoile de poche est S, posée à 40 pc exactement.
  TUNE-GAP signalé (élargir la bande ou réduire R_nova(S) à discuter en
  tour d'équilibrage).
- **Bootstrap du premier joueur** : dans un univers vierge, la garantie du
  voisin 150–240 pc est vide par définition — le premier compte naît sans
  voisin ; tous les suivants l'ont (vérifié : 159,6 pc entre les 2 démos).
- **Base de test dédiée `atg_test`** : les tests d'intégration polluaient
  l'univers seedé (le voisin de démo s'ancrait sur un joueur de test à
  ~404 pc). Séparation stricte test/dev sur la même instance Postgres.

### Vérifications
- 15/15 intégration (8 garanties spawn + événements + migrations) sur
  vraie base ; 42 unit au total ; seed rejoué idempotent ; géométrie de
  démo contrôlée en SQL (starters à 159,6 pc, tuiles ≥ 10, tempérés D/F).

---

## 2026-07-12 — Session 30 (suite) : chunk D — tranche verticale jouable

### Réalisé
- **API** : sessions serveur (jeton opaque httpOnly, seul le SHA-256 stocké,
  30 j) ; routes register/login/logout, /me, /galaxy (visibilité = union des
  cercles par planète : BASE_SKY 60 pc [TUNE-GAP] + 200 pc/niveau de
  télescope actif ; le stock caché des étoiles ne quitte jamais le serveur),
  /planets/:id (détail lazy-évalué, propriétaire uniquement), POST unlock &
  build (transactions : propriété, ADN du seed, prérequis, masque
  d'intersection, coûts crystal_any résolus au climat, tuiles, maxInstances,
  chantier 6 h + événement construction_complete ; TIME_SCALE dev/test
  documenté comme instrumentation §15).
- **Client** : écran d'éveil (login/register, 6 politiques, états d'erreur),
  HUD (rail avec sections futures désactivées AVEC raison), carte galaxie
  three.js (pan/zoom 2D, sprites pixel des stubs, anneau de possession,
  labels projetés, panneau de sélection, avertissement étoile), vue planète
  PixiJS (île isométrique, tuiles cliquables, sprites 512×256 + overlay
  climat hot/cold, anneau jaune de chantier, polling 4 s), main de cartes
  EXHAUSTIVE (28) triée plaçables/déverrouillables/bloquées avec raisons,
  courbe d'efficacité SVG avec point vivant (équivalent numérique a11y).

### Défauts trouvés par les tests (corrigés)
1. **Départ non sain sur starter medium** : E_planet 0,20 avec pop fixe
   1 200 sur cap 12 000 — contradiction interne du guide (« 1 200 » vs
   « u = 0,6 ⇒ E ≈ 0,95 »). Résolution : pop initiale = 0,6 × popCap
   (1 200 EST 0,6 × 2 000 du cas small-F). Starter medium-D : 12 240/20 400,
   E = 96 % — vérifié en E2E.
2. **Canvas Pixi jamais monté** : l'effet d'init (deps []) courait pendant
   l'état « loading », avant l'existence de la div. Init conditionnée à
   l'arrivée des données + .catch explicite (jamais d'échec silencieux §18).

### Vérifications
- Intégration : 26/26 (11 API — authz par requêtes directes : 403 lecture
  étrangère, 403 construction étrangère, masque militariste refusé à un
  industrialiste, tuile occupée, double unlock, kind d'erreur explicites).
- E2E Playwright : 4/4 (état d'erreur d'identifiants ; éveil → galaxie ;
  vue planète avec 28 cartes ; unlock → pose → chantier → persistance après
  rechargement). 8 captures JPEG observées + 3 vidéos .webm envoyées au
  responsable. Conformité design system contrôlée sur captures (tokens,
  Orbitron, accent jaune, états, focus).
- Base de dev réinitialisée puis re-seedée (comptes démo au nouveau départ
  sain) ; suite unit 42 + build verts.

### Limites connues du chunk
- Sprites = 1re frame des stubs GIF (animation + passe bump/light : chunk
  renderer dédié — l'item P0.4 Pixi reste [~]).
- La production/industrie n'existe pas encore (chunk E) : stocks à taux 0.
- Détail planète réservé au propriétaire ; l'intel télescope à niveaux
  (L1–L3) viendra en P3.

---

## 2026-07-12 — Session 30 (suite) : chunk E — la boucle colonie vivante

### Réalisé
- `sim/production.ts` (PUR) : potentiel par industrie = base(niveau) ×
  E(workforce/optimal) × runPct × E_planet×G × frein§3.3b ; extraction sur
  gisement (max 1, tarissement définitif) ; minage de trace 2 T/j EXEMPT
  d'efficacité ; point fixe déterministe de partage des arrivages quand un
  intrant est à sec (≤ 8 itérations, ordre stable) ; consommation de survie
  par familles (food_1→3, med_1→3) ; facteurs limitants explicites.
- `sim/rebase.ts` : matérialisation + écriture des taux + replanification
  du bord le plus proche (zéro-cross de stock, seuils 0.7/0.85/1.0 du
  frein, tarissement) + garantie d'un pop_daily par monde habité.
- Handlers : stock_edge, deposit_dry (0 pour toujours), pop_daily (H depuis
  les saturations, maladie, ΔP logistique, re-planification), activation/
  démolition rebasent.
- Commandes : recette obligatoire à la pose pour les industries (validée :
  bâtiment/ressource/gisement/max-1/trace), workforce par défaut 0,7 ×
  optimal si la population le permet [TUNE], PATCH réglages (workforce ≤
  60 % pop, runPct 0–100), unlock/build rebasent.
- Client : RecipePicker (gisements d'abord, trace ensuite ; cristaux jamais
  en trace), débits colorés par ressource, date de tarissement projetée,
  BuildingPanel (facteur limitant lisible, courbe E(u) de l'unité,
  réglages), clic-tuile → panneau du bâtiment.

### Approximations documentées (à revalider en tour d'équilibrage)
- Frein §3.3b en constantes par morceaux (recalcul aux seuils) ;
- saturation de survie évaluée à la matérialisation quotidienne ;
- partage au prorata des demandes quand un intrant est à sec.

### Vérifications
- 22 tests unitaires production (nominal, understaffed, dry, trace, brake,
  halt, cascade des familles, point fixe demi-cadence) ; intégration 32/32
  dont boucle colonie 6 (activation par événement → +9,5 T/j ; runPct 0 ;
  refus workforce ; max-1-extracteur ; tarissement à l'échéance exacte —
  stock figé ≈ gisement initial ; nourri +24 hab/j vs famine 0 ; rattrapage
  hors-ligne stepped == direct à 1e-6) ; E2E 5/5 (nouveau parcours : recette
  → pose → production visible +9,6/j → panneau → cadence 50 % → +4,8/j).
  Captures 09–12 observées : conformes (débits verts/rouges, « dry on »,
  « Running clean », curve u=70 %). Vidéo envoyée au responsable.
- Correctif d'infrastructure de test : base atg_test TRONQUÉE par fichier
  (l'ancrage du voisin fuyait entre fichiers de test).

---

## 2026-07-12 — Session 30 (suite) : chunk F — niveaux, démolition, page stats

### Réalisé
- `levelUpBuilding` : actif requis, plafond absolu L3, plafond de
  profondeur roulé par l'ADN du seed (maxLevel), politique de niveau par
  INTERSECTION (market L2+ exige une gouvernance toute mercantile), coût du
  palier, montée EN PLACE avec production coupée pendant le chantier
  [TUNE interp] ; heures du niveau cible (6/24/72 h).
- `demolishBuilding` : remboursement 50 % de l'investi (placement +
  paliers) crédité AU LANCEMENT, overfill permis (physique §3.3b), statut
  demolishing (production stoppée), suppression et tuile libérée à 6 h.
- **Décision documentée** : un extracteur EN DÉMOLITION ne réserve plus son
  gisement — le remplaçant peut être lancé sans attendre (aucune double
  extraction possible : jamais deux extracteurs ACTIFS sur une veine,
  vérifié par test).
- Client : boutons Level up (coût en title, raisons de blocage : plafond
  seed, chantier) / Demolish (confirmation en deux temps, danger ramp) ;
  page stats planète (canon GB §10) : chaque unité avec u, E, débit,
  facteur limitant + lignes planète (population) et stockage.

### Vérifications
- Intégration 39/39 (nouveaux : L1→L2 coût payé + production coupée +
  débit L2 ×1,7 après re-staffing ; plafond L3 ; plafond ADN via recherche
  déterministe d'un seed plafonné L1 ; market L2 mask_denied ; 403 des
  commandes d'autrui ; remboursement 5 ore exact ; re-construction sur
  tuile libérée ; un seul extracteur actif par veine).
- E2E 6/6 (nouveau parcours compte neuf : mine → L2 « Understaffed »
  attendu — monter de niveau exige de re-staffer —, page stats, démolition
  confirmée remboursée). Captures 13–16 observées, conformes.
- Leçon de test : les grants de test avaient dépassé 0,7 × cap → le frein
  §3.3b a écrasé les débits (le système a fonctionné contre le test) ;
  grants calibrés et fuel retiré du stock de test.

---

## 2026-07-12 — Session 30 (fin) : chunk G — animations & passe de lumière v1

### Réalisé
- GIF animés : pixi.js/gif (aucune dépendance nouvelle) ; cache
  d'ArrayBuffer + GifSource NEUVE par sprite — le destroy en cascade du
  plateau (options truthy → destroyData) détruisait la source partagée.
- Lumière (ASSET_PIPELINE §3, réf. prototype 06) : extractLights (binning
  16 px, ≤ 3 sources, intensité/couleur), halos additifs écrasés iso qui
  débordent sur les tuiles et sprites voisins, filtre WebGL bump (normale
  par gradient, 4 sources UV locales + ambiante 0,76 + lumière clé).
- Débogage : « Could not initialize shader » sans log — interception de
  linkProgram → « Precisions of uniform 'uInputSize' differ » → fragment en
  highp. Étalonnage des halos (stubs light = gros amas blancs → scène brûlée
  au 1er essai ; intensité /150, alpha 0,1–0,4).

### Verdict P0.4 renderer
PixiJS v8 VALIDÉ sur la vraie vue planète : GIF animés + filtres WebGL par
sprite + couche additive coexistent sans heurt. Item passé à [x]. Limites
v1 assumées : propagation portée par les halos (pas de champ de lumière
global), relief discret sur bump plats de stubs — à réétalonner sur art réel.

### Vérifications
Captures 17 observées (avant/après étalonnage), vidéo de la scène animée ;
suite E2E complète rejouée : 6/6, aucune régression ; typecheck vert.

---

## 2026-07-12 — Session 30 (suite) : chunk H — vol libre, sondes, vision

- Migration 002 (missions), moveShip/launchProbe/fleet, handler ship_arrival,
  vision étendue (sondes 60 pc, vaisseaux 20 pc [TUNE-GAP]). v1 documentée :
  pré-brûlage au départ (pas de panne en vol), matrice fuel 1.0, personnel
  restreint aux mondes possédés (canon §21 — refus vérifié par requête
  directe ET par l'E2E, qui a d'abord cliqué le personnel superposé : les
  marqueurs dockés sont désormais déployés en éventail).
- Tests : 45/45 intégration (fuel exact 0,25 u/pc, interpolation 0,5 ± 0,05,
  la sonde arrivée révèle le starter voisin, cap 5/j/pad) ; E2E 7/7 ;
  capture 18 observée (ligne de transit, ETA/fuel).

---

## 2026-07-12 — Session 30 (suite) : chunk I — la Silence se brise (ping/ping-back/canaux)

### Problème & canon
GB §5 : aucun contact unilatéral — un ping doit recevoir un ping-back pour
que le canal existe. Cible d'un ping : un monde POSSÉDÉ, DANS le ciel de
l'émetteur (la règle est un scope serveur, jamais une aide d'UI).

### Décisions
- **Canal canonique par couple** : `channels(player_a < player_b)` —
  contrainte SQL `channel_pair_order` + UNIQUE ; le ping-back fait un
  `INSERT … ON CONFLICT DO UPDATE … RETURNING id` (idempotent, un seul
  canal quel que soit le sens de l'ouverture). Miroir pur `canonicalPair`
  testé en unitaire.
- **Quota 20 pings/jour [TUNE]** (DG §15, bonus diplomatique remis à plus
  tard) + **1 hail en attente par couple** (anti-spam) : re-ping possible
  seulement après réponse ou expiration (expiration non implémentée — noté
  au backlog).
- **Fuite d'information évitée** : la portée est vérifiée via
  `visibleBodies` (même source de vérité que /galaxy) ; un monde hors ciel
  répond « hors de portée », identique au monde inconnu côté sémantique.

### Trouvaille : l'infrastructure sans tuile était inconstructible via l'UI
Le flux de pose exigeait un clic-tuile, mais le serveur refuse (à raison)
un tileIndex pour `telescope`/`probe_pad`. Correctif : « Place » construit
directement ces cartes, et un panneau **Infrastructure** (vue planète,
sous les gisements) rend visibles ces bâtiments hors plateau — sans lui,
rien n'attestait à l'écran de l'existence d'un télescope.

### Flake corrigé (§18) : test market L2 non déterministe
Symptôme : ~1 run d'intégration sur 4-5, `max_level` au lieu de
`mask_denied`. Cause : le test roulait l'ADN du starter (seed d'univers
aléatoire par run) — market absent (~20 %) ou plafonné L1 (20 % des
présents), et le plafond d'ADN est vérifié AVANT la politique de niveau.
Correctif : patron « Capworld » — recherche d'un seed PUR garantissant
market profondeur ≥ 2, monde synthétique + gouverneur ingénieur
(industrialist) inséré : l'intersection « tous mercantiles » échoue
toujours, quel que soit l'univers. 6 runs consécutifs verts. Au passage,
l'unlock de `depot` (never-masked, déterministe) migre dans le test de
démolition qui en dépendait.

### Vérifications
- 27 unit serveur (dont 5 comms purs) + 34 shared ; 50/50 intégration ×6 ;
  E2E 8/8 dont le nouveau parcours bi-navigateur : Demo bâtit un télescope
  L1 (ciel 60+200 pc ≥ 159,6 pc du couple seedé Kala↔Alkex), ping depuis la
  carte, Neighbor voit le hail, ping-back (« the Silence breaks »), échange
  bilatéral vérifié dans les deux navigateurs. Rerun-tolérant (télescope
  déjà bâti → saut ; hail déjà en attente → réponse quand même) — validé
  par 2 reruns isolés.
- Captures 19–25 observées : panneau Infrastructure (télescope L1 actif),
  panneau Alkex + Ping, notice d'envoi, hail entrant, canal ouvert,
  conversation des deux côtés (bulles mine/theirs, historique stable).
- Limite documentée : quota épuisable en re-runs massifs (20 pings/j pour
  demo) → `resetDb` si la limite est atteinte ; pas de notification de
  hail hors de l'écran Comms (backlog).

---

## 2026-07-12 — Session 30 (suite) : chunk J — atterrissage & fret (fondation de l'économie physique)

### Pourquoi ce chunk avant les marchés
GB §13 : « goods are hauled, never teleported ». Un marché sans jambe
physique (soute, quai, droit d'atterrir) serait un mensonge mécanique. Le
chunk K (marché L1 taux fixe) s'appuiera sur cette fondation.

### Décisions v1 (documentées)
- **Arriver ≠ se poser** : l'arrivée laisse le vaisseau en survol avec
  `hover_body_id` ; « Land » est une commande. Migration 004.
- **Ses mondes accueillent toujours** [TUNE-v1 interp] : précédent du
  spawn (les vaisseaux du starter naissent dockés sans spaceport). Monde
  étranger : spaceport ACTIF + politique `everyone` (v1 self|everyone,
  friends/neighbours arrivent avec les factions). Monde sauvage : refus
  (la colonisation est un autre chantier). Sonde : ne se pose jamais.
- **Config par bâtiment** : `buildings.config jsonb` — politique
  d'atterrissage du spaceport aujourd'hui, slots de marché demain.
- **DG §7 appliqué à la lettre** : 1 conteneur = 1 T d'UN fongible,
  tonnes partielles monopolisent leur conteneur (`containersUsed` pur,
  testé unitaire) ; Cargo S = 3 conteneurs.
- **Fret réservé aux mondes possédés** (v1) : échanger sur le monde d'un
  autre, c'est du commerce — chunk marché.
- **Gaps annoncés** : aucune limite de docks (comptes par niveau au
  backlog), pas d'usure d'atterrissage (le suivi d'armure n'existe pas
  encore), pas de poids/loadFrac sur le vol.

### Vérifications
- 7 unit purs (conteneurs, canLand) + 9 intégration (matrice spaceport
  self/everyone via la vraie commande, cap de stockage refusé, refus
  d'autorisation par requêtes directes) + E2E 9/9 dont la boucle fret
  complète (charge 2 T → décolle → se repose → décharge) ; captures 26–29
  observées (soute 2/3 conteneurs, Land vert en survol, formulaire à quai).
- Correctif de test au passage : l'ordre capacité-avant-stock rendait un
  refus ambigu — test ajusté pour vérifier chaque refus isolément.

---

## 2026-07-12 — Session 30 (suite) : chunk K — marché L1 à taux fixe

### Décisions v1 (documentées)
- **Slot directionnel** : le marché ACHÈTE `give` et paie en `get` au taux
  posté (get par 1 give). Le taux EST le prix : aucun frais séparé en taux
  fixe [TUNE-v1] — les 25 bp/leg sont un mécanisme AMM (L2, à venir).
- **Slots = niveau** (GB §9) : L1 = 1 slot, vérifié serveur ; la config vit
  dans `buildings.config.slots` (le jsonb du chunk J).
- **Re-tarification ≤ 1/min** (DG §11.1) : throttle sur (paire identique,
  taux différent), horloge injectable pour les tests.
- **Physicalité totale** : consultation à quai (owner OU vaisseau docké),
  échange = soute (conteneurs vérifiés) ↔ stock planétaire (paiement sur
  stock disponible, encaissement sous cap), journal `trades` (migration
  005) porte les limites quotidienne/absolue. Auto-échange permis
  (« self-wash pointless, not dangerous »).
- **E2E déterministe par construction** : le seed d'un starter est
  `universe:starter:email` — l'e-mail fixe `e2e-market@test.local` garantit
  market (cap L3) dans l'ADN du monde, rerun-tolérant (login/register).

### Défauts trouvés et corrigés (§18)
- **Ordre de flotte instable** : `ORDER BY created_at` seul — personnel et
  cargo naissent dans la même transaction (même timestamp) ; après un
  UPDATE (trade → cargo réécrit), l'ordre du tas flippait et l'éventail des
  marqueurs échangeait personnel/cargo à l'écran. Correctif : ordre TOTAL
  et sémantique (personal, cargo, civil, combat, sondes ; puis created_at,
  id). Reproduit par l'E2E (2 échecs consécutifs au même endroit), vérifié
  par 2 reruns + suite complète.
- **Clic d'unlock avalé par le re-tri de la main** : re-clic jusqu'à preuve
  d'état (bouton Place visible) — l'assertion sur la notice était trompeuse
  (texte identique entre deux unlocks).
- **Sonde de « déjà bâti » trop précoce** : remplacée par une introspection
  API en lecture seule (les actions restent pilotées par l'UI).

### Vérifications
47 unit shared (6 marché) + 27 unit serveur ; 71/71 intégration (12 marché :
slots=niveau, throttle, physicalité 2 côtés, limites, whitelist, refus
directs) ; E2E 10/10 ×2 (chemin premier passage ET rerun) ; captures 30–32
observées (formulaire de slot, offres à quai, échange réglé +0,5 T water).

---

## 2026-07-12 — Session 30 (suite) : chunk L — l'hospitalité du monde marchand

### Canon appliqué (GB §9, exception marchande)
Sous gouvernance Mercantile, survie + carburant se vendent innément — sans
bâtiment de marché. Périmètre EXHAUSTIF (règle de complétude) : water,
oxygen, food_1..3, fuel_cold/hot/gas. Plancher keep-for-self par ressource,
jamais entamé.

### Décisions v1
- **Hospitalité en SURVOL** [TUNE-v1 interp] : l'hospitalité est la nature
  du monde marchand — elle ne demande pas de droit d'atterrissage (le canon
  la distingue du marché « browsable by a buyer docked »). À quai OU en
  survol du corps.
- **La gouvernance se re-vérifie à CHAQUE lecture et achat** : si elle
  cesse d'être toute mercantile (ex. gouverneur soldat), l'inné se tait —
  les offres restent stockées mais ne sont plus servies.
- **Config sur le corps** (`bodies.config`, migration 006) : c'est une
  propriété de gouvernance, pas d'un bâtiment. Journal `trades` réutilisé
  (market_building_id NULL, slot −1) — le census y verra tout.
- **Seed** : le voisin mercantile publie son offre via `setInnateOffers`
  (vraie commande, §8) ; base dev existante alignée sur le même contenu.

### Vérifications
50 unit shared (périmètre exhaustif, planchers) ; 78/78 intégration (7
innées : gouvernance, périmètre, plancher, survol, extinction, refus
directs) ; E2E 11/11 — publier (vue planète, section Hospitality) puis
acheter sur place (panneau vaisseau : marché ET hospitalité côte à côte) ;
captures 33–35 observées. L'achat trans-joueur est vérifié en intégration :
l'autonomie v1 d'un Cargo S (240 pc) ne garantit pas le vol du couple
seedé en E2E — annoncé au backlog.

---

## 2026-07-12 — Session 30 (suite) : chunk M — le chantier naval

### Canon appliqué (GB §14, DG §381)
L1 construit S+M ; L2 = M en masse (−25 % de coût, `shipBuildCost` pur
testé) ; L3 construit les L. Le vaisseau naît À QUAI, réservoirs et soute
vides — l'armement, les slots et les accessoires restent au backlog.

### Décisions v1
- **Temps de chantier S/M/L = 12/24/72 h [TUNE-GAP]** : le guide ne les
  chiffre pas ; proposition alignée sur le ladder bâtiments, en attente
  d'un tour d'équilibrage.
- **MIN_CREW différé (annoncé)** : l'enforcement d'équipage arrive avec le
  lifecycle NPC (P4) — cohérent avec les vaisseaux du spawn.
- **Propriété à l'achèvement = propriétaire ACTUEL du monde** : une
  conquête pendant le chantier capture la production (GB §9 : les
  chantiers sont le butin).
- **Exactement-une-fois structurel** : handler + processed_at commitent
  dans la même transaction — l'insertion du vaisseau ne se rejoue pas.
- **Instrumentation §15** : /test/grant (ATG_TEST_ENDPOINTS=1, E2E
  uniquement, interdit en prod — PROD_MIGRATIONS) : le chantier coûte
  steelL+cells absents du stock starter, la chaîne smelter serait un
  parcours d'une heure ; le grant rend l'E2E déterministe sans simuler le
  comportement testé.
- **E-mail fixe e2e-shipyard@test.local** : ADN shipyard+spaceport garanti
  (seed = universe:starter:email) ; chaîne d'unlocks réelle via l'UI
  (depot → spaceport → shipyard — prérequis découvert par l'échec du
  premier run, corrigé).

### Vérifications
53 unit shared (gate, remise, temps) + 27 serveur ; 84/84 intégration
(6 chantier : gate L, coût exact, remise L2, événement→docké vide, refus
directs) ; E2E 12/12 (premier passage 19,9 s + rerun 13,7 s) ; captures
36–38 observées — panneau chantier avec file « Under construction », le
nouveau marqueur dans l'éventail de flotte. Observation honnête : le stock
sur-cap (grants répétés) s'affiche en ambre 1813/1000 T — comportement
d'affichage correct, le cap clippe à l'évaluation suivante.

---

## 2026-07-13 — Session 30 (suite) : chunk N — colonisation v1, la deuxième planète

### Instruction du responsable & méthode
« keep going, do not ever stop and ultracode implement as much as you can » —
opt-in ultracode explicite. Par §26 (rang 2 : instruction explicite du
responsable), exception ponctuelle au §1 « pas de sous-agents » : un
workflow de spécification (4 agents parallèles — colonisation, intel
télescope, drains de survol, census — plus vérificateurs adverses) a
produit les specs des prochains chunks. La limite de session des
sous-agents est tombée en cours de route : 3 vérifications adverses ont
manqué ; les affirmations porteuses des specs ont été re-vérifiées
inline contre le code avant usage. Toute l'implémentation elle-même est
restée séquentielle et directe.

### Canon appliqué (GB §19/§14/§12, DG §3.2/§12/§8.6/§10.3)
Civil M/L + fitting colonie + ≥ 200 settlers + stock d'amorçage ; 72 h
d'établissement ; « the ship is spent » : coque convertie en depot L1 +
spaceport L1 ; grâce de 14 jours pour la colonie fraîche.

### Conflit de canon découvert — provisions du kit [TUNE interp]
Le stock d'amorçage (30 T nourriture + 30 T eau) ne TIENT PAS dans les
2 conteneurs d'un Civil M (1 conteneur = 1 T d'un fongible, DG §7). Deux
lectures possibles : (a) exiger un cargo d'escorte, (b) le kit arrive
provisionné. Décision v1 : **le kit embarque ses provisions** — payées au
fitting, déchargées à l'établissement. C'est la lecture qui préserve
« one ship, one colony » du gamebook ; à re-trancher en équilibrage.

### Décisions v1
- **Péage de trajet déterministe** (DG §3.2 « no free sub-20 cohorts ») :
  espérance settlers × risque ajoutée au report fractionnaire DE LA ROUTE
  (`settler_routes`, PK origine+destination) ; morts = partie entière,
  reste = nouveau report. Aucun dé. **Quantification 1e-9** : 300 × 0,03
  donne 8,999999… en IEEE 754 → sans quantification le péage perdrait un
  mort à la poussière binaire (bug attrapé par le test d'intégration).
- **Réduction pilote v1** : stat seedée `settler_risk_reduction` du
  pilote lié (l'échelle « 2 % × civilPilotLevel » par rareté reste
  [TUNE-GAP] pour le chunk lifecycle NPC). Liaison pilote↔coque
  permanente (GB §12), max 1 équipage v1.
- **Anti-course** : `colonizeShip` verrouille le corps et refuse si un
  `colony_established` est déjà en attente sur la cible ; le handler
  re-vérifie à l'arrivée (le perdant reste en survol, settlers intacts).
- **Grâce 14 j : données + UI seulement** — l'enforcement (pas de
  conquête, pas d'a2g) ne peut exister avant le combat (P5) ; annoncé au
  backlog, badge et `graceUntil` API déjà en place. Observation assumée :
  les mondes STARTERS portent le badge (colonized_at posé au spawn) —
  cohérent avec le canon, un starter est une colonie fraîche.
- **Réservoir natal typé** : une coque neuve naissait avec `fuel = {}` ;
  l'auto-chargement au départ défaultait sur `cold` même sous une étoile
  chaude (« Carburant insuffisant : 0/22 u (cold) » en E2E). Correction :
  `shipBuilt` résout l'étoile la plus proche et type le réservoir
  `{<type>: 0}` — vide mais typé.
- **Le rail apprend la colonie** : `me.planets` n'était chargé qu'au
  login ; la carte galaxie détecte la disparition d'une coque
  « colonizing » (établissement) dans son poll de flotte (5 s) et
  rafraîchit `me` — bug UX réel trouvé par l'E2E.

### E2E — déterminisme durci
- `pickColonyEmail` : itère des e-mails candidats jusqu'à un ADN de
  compte garantissant spaceport + shipyard + workshop L2 (le seed pur
  `universe:starter:email` rend l'ADN précomputable — aucun re-roll de
  chance en test).
- **Géométrie de plateau EXACTE** : les tuiles sont projetées par le même
  calcul isométrique que le client (cols = ceil(sqrt(n))…) — fini les
  pixels devinés qui rataient les starters à 10 tuiles.
- **Pose vérifiée par l'état** : chaque placement re-lit l'API
  (`hasBuilding`) au lieu de croire un toast — les notices identiques
  entre déverrouillages masquaient des clics avalés par le re-tri de la
  main.
- **Péage vérifié à l'unité près** : le test lit le roll RÉEL du pilote
  lié (`/npcs`) et recalcule le péage attendu avec les MÊMES fonctions
  partagées que le serveur — un pilote fort peut annuler le risque, zéro
  mort est alors le résultat correct (l'assertion « < 300 » naïve était
  fausse ; leçon : ne jamais encoder une hypothèse sur un roll seedé).
- Surface UI manquante découverte : `colony_program` est un nœud de tech
  SANS carte — la section « Programs » (vue planète) a été ajoutée pour
  lui donner un point de déverrouillage réel.

### Vérifications
60 unit shared (7 colonisation : risque, pertes, accumulateur « pas de
cohorte gratuite », grâce, éligibilité) + 27 unit serveur ; 93/93
intégration (9 colonisation : coût du fitting, refus workshop/programme/
coque, embarquement + caps pax + garde workforce, liaison pilote
permanente, péage déterministe 300→291 avec pilote fixé, refus poison/
possédé/vide, établissement complet — population, bâtiments actifs,
provisions + carburant déchargés, PNJ re-liés, coque supprimée, refus
d'intrus en requêtes directes) ; E2E 13/13 dont colonisation ×2 (1,9 min
et 1,8 min) ; captures col-01..05 observées à la vision (§16) : quille,
Arche parée (300/800 + kit), survol du sauvage (296 — péage exact de 4),
compte à rebours d'établissement, Dratath au rail avec badge de grâce,
population 296, provisions 30+30 en stock. Vidéo .webm du parcours
complet conservée (preuve n°12).

---

## 2026-07-13 — Session 30 (suite) : chunk O — drains de loitering, échouage & ravitaillement

### Canon appliqué (GB §7/§13/§21, DG §3.5/§9.1)
« A ship is either in space or hovering over a planet; both consume
resources » : hovering ET idle drainent, au même taux (le guide n'en
chiffre qu'un — 0.2 u/j × {1,2,4} par taille [TUNE]). Sur SON monde, le
drain frappe le stock planétaire (resupply round-trips) ; sur monde
étranger, sauvage, à sec, ou dans le vide, le réservoir paie. Le
personnel ne consomme rien (GB §21) ; la sonde n'a pas de réservoir.

### Architecture — le réservoir devient paresseux (migration 008)
Le montant reste dans `ships.fuel` (jsonb mono-type v1) ; le taux et
l'as_of gagnent leurs colonnes. `rebaseShipDrain` suit EXACTEMENT le
patron des bords de stock : matérialiser, écrire le taux, purger les
`ship_fuel_out` non traités, replanifier via whenReaches. Le drain
planétaire s'injecte dans `computeRates` (hoverFuelNeeds, servi APRÈS la
survie de la population, même règle « stock > 0 OU arrivage ») ; le
rebase planétaire re-base ensuite CHAQUE coque en survol — servie ⇒
réservoir figé, non servie ⇒ réservoir paie. Tout-ou-rien par ressource
[TUNE-v1] : le bord de stock à 0 déclenche la bascule au recompute
suivant.

### Découverte majeure — TIME_SCALE n'accélère pas la dérive lazy
Le vérificateur adverse de la spec étant tombé sur la limite de session,
la vérification inline a attrapé une affirmation FAUSSE : « TIME_SCALE=
7200 ⇒ 1 jour jeu = 12 s réels » ne vaut que pour les ÉVÉNEMENTS
(construction, vols, établissement) — evalLazy/whenReaches courent en
jours RÉELS (GAME_DAY_SECONDS fixe). Un drain de 0.2 u/j met des heures
réelles à échouer une coque, quelle que soit l'échelle. Décision :
l'échouage E2E est rendu déterministe par l'instrumentation
POST /test/ship-fuel (fixe le réservoir à 1e-6 u → bord en ~0,4 s), qui
RE-ARME le drain selon l'état réel. Leçon consignée : toute future
horloge (survie, transit) devra choisir explicitement son référentiel.

### Décisions v1
- **Auto-chargement = plein réservoir** [TUNE-v1] : charger exactement le
  trajet laissait 0 u à l'arrivée — la coque s'échouait au premier survol
  (uniforme : whenReaches d'un montant nul → asOfMs, échouage immédiat,
  voulu). Correctif au passage : le monde quitté est rebasé au départ
  (le rebase manquait après l'auto-chargement, taux planétaires
  mensongers).
- **Transfert vaisseau→vaisseau** : entre VOS coques (v1), ≤ 1 pc
  [TUNE-GAP — le guide ne chiffre aucun rayon], même type de carburant
  [TUNE-v1], instantané [TUNE-v1] ; verrouillage des deux lignes par id
  CROISSANT. Un receveur échoué repart (survol si un monde est dessous,
  sinon idle).
- **Refuel** : monde POSSÉDÉ seulement (v1 — le carburant d'autrui
  s'achète au marché/à l'hospitalité) ; à quai, en survol ou échoué
  au-dessus ; verrou corps AVANT vaisseau. Convention de verrouillage
  consignée : les nouvelles commandes prennent corps→vaisseau ; les
  commandes historiques (moveShip…) prennent vaisseau→corps — fenêtre de
  deadlock rare assumée : PG avorte l'un, la file at-least-once rejoue,
  l'API renvoie une erreur re-tentable (compromis connu, DAT §11).
- **Drain de survie INERTE** : la constante reste exportée mais 0.01 T ×
  0 équipage = 0 — s'active avec le chunk NPC/équipages [TUNE-GAP].

### Vérifications & correctifs de tests
15 unit shared (taux par taille, exemptions, table de vérité COMPLÈTE de
shipDrainTarget) ; 12 intégration (planète paie/à sec/idle/échouage/
refuel/transfert + refus directs §10 : monde d'autrui, coque d'autrui,
trop loin, type incompatible, caps) ; E2E hover-drain ×2 (1,4 min) +
suite complète 14/14. Deux bugs de TEST préexistants attrapés :
(a) ships.test.ts comparait `bodies[1]` d'un `IN (...)` SANS ORDER BY
(l'ordre de heap a tourné — résolution par id désormais) ; (b) mon
premier « clic de vide » E2E ignorait la taille des SPRITES (une étoile
fait ~150 px au zoom par défaut) — le point de vide est maintenant
CALCULÉ : projection affine ancrée sur deux labels + dégagement par
rayon de sprite, destination re-vérifiée par l'API (destBodyId null).
Captures hov-01..04 observées à la vision (§16) : « loitering paid by
the planet below », chip rouge « Stranded — out of fuel » sans boutons
de départ, transfert 20 u à taux −0.2 u/j affiché, jauge pleine 60/60
après Refuel. Vidéo .webm conservée (preuve n°13).

---

## 2026-07-13 — Session 30 (suite) : chunk P — census global de l'offre

### Canon appliqué (GB §13, DG §11.5)
Le job d'agrégation périodique est canon (« recomputed several times per
day (admin-configurable) ») ; la publication est GLOBALE uniquement —
jamais de ventilation par planète/entrepôt, les contenus privés comptent
dans les valorisations serveur mais ne sont jamais énumérés. Pas de
monnaie : des tonnes PAR RESSOURCE, jamais une valorisation agrégée.

### Décisions v1
- **Récurrence dans la file events** (DG §1, aucun cron) : patron
  pop_daily — dédoublonnage puis re-INSERT à now + intervalle ; la
  migration 009 amorce le premier événement, le worker RÉ-AMORCE au boot
  (idempotent — un DELETE FROM events des tests d'intégration sur la
  base partagée tuerait la chaîne sinon).
- **Un census mesure l'état COURANT** : nowMs = Date.now(), pas dueAt —
  après une panne du worker on ne rattrape pas des snapshots du passé ;
  un seul census immédiat puis reprise de cadence.
- **Sources v1 = stocks (lazy, min 0) + soutes (tous statuts)** ; les
  gisements sont EXCLUS délibérément (non extraits ≠ offre) ; pools AMM
  et escrow d'enchères n'existent pas encore — le manque est ENREGISTRÉ
  dans meta.sources de chaque snapshot (règle de complétude : le trou
  est visible dans la donnée, pas silencieux).
- **Ventilation interne** : census_snapshots.totals garde
  planetStockT/shipCargoT (debug + futures valorisations plunder/bonds) ;
  le service latestCensus ne projette QUE totalT — l'assertion négative
  du test d'intégration vérifie qu'aucune clé de ventilation ne sort du
  JSON sérialisé.
- **CENSUS_PER_DAY** (config zod, défaut 4 [TUNE]) : « admin-configurable »
  réduit v1 à une variable d'environnement + redémarrage — surface admin
  runtime au backlog.

### Bug d'infrastructure E2E attrapé — les workers zombies
Le teardown de global-setup tuait le wrapper pnpm, pas son enfant tsx :
34 tick workers zombies s'étaient accumulés au fil des runs. Sans
conséquence jusqu'ici (handlers idempotents, SKIP LOCKED), ils sont
devenus toxiques avec la FACTORY censusRun : un zombie à l'env figé
(sans TIME_SCALE) réclamait l'événement et replanifiait à 6 h réelles au
lieu de 3 s. Correctif : spawn detached + kill du GROUPE de processus au
teardown ; purge des zombies. Leçon : un handler paramétré par la config
rend l'identité du worker significative — les processus fantômes ne
sont plus inoffensifs.

### Vérifications
5 unit (agrégat : sommes, lazy au nowMs, clamp 0, clés hors catalogue
ignorées, exhaustivité du catalogue contre ALL_RESOURCE_IDS) ; 3
intégration (agrégat exact delta lazy compris + meta honnête +
replanification dédoublonnée + exactement-une-fois ; 401 anonyme +
aucune ventilation ; récurrence présente) ; E2E complet (Market actif,
onglets désactivés avec raison, table exhaustive 31 lignes, grant 500 T
d'ore → le snapshot suivant le reflète et l'UI suit, 401 en contexte
anonyme) ; suites 75/32/108/15 vertes ; capture cen-01 observée à la
vision (§16). Vidéo .webm conservée (preuve n°14).

---

## 2026-07-13 — Session 30 (suite) : chunk Q — intel télescope par paliers 0–4

### Canon appliqué (GB §20, DG §4.1/§5/§11.3)
« Depending on telescope level » : le canon chiffre l'échelle L1/L2/L3
pour les VAISSEAUX (DG §9.2) mais pas le contenu planétaire — le barème
par paliers livré est un [TUNE-GAP proposé] : 1 silhouette, 2
développement, 3 stratégique (gisements en PRÉSENCE seule — DG §11.3 «
surveyed level » minimal), 4 deep sight (+1 scientifique plafonné à +1,
DG §4.1 ; ou sonde à portée). La qualité est de l'intel de palier 4 :
la fuite de /galaxy (quality publié à la simple visibilité) est FERMÉE.

### Décisions v1
- **Projection par LISTE BLANCHE partagée** (`projectPlanetIntel`) :
  l'unique endroit qui décide « quel champ à quel palier » ; les clefs
  des paliers supérieurs sont ABSENTES (jamais null) ; le seed, les
  stocks, recettes, workforce, config ne figurent même pas dans la
  structure d'entrée. Tests unitaires : jeu EXACT de clefs par palier.
- **Palier 0 = 404** — la même réponse qu'un id inexistant : pas
  d'oracle d'existence. /planets/:id reste owner-only MÊME à palier 4
  (le détail opérationnel n'est pas de l'intel).
- **Indice = meilleur télescope couvrant** [TUNE-GAP] (couverture =
  scope additif de visibleBodies) ; calcul LIVE sans persistance.
- **UI : le manque est montré** — rangées cadenas « Télescope L2/L3
  requis », « Deep sight needs a scientific eye — or a probe on site » ;
  aide d'interface seulement, la règle vit au serveur.
- **Gap UI réel corrigé au passage** : les infrastructures sans tuile
  (télescope, probe pad) n'avaient AUCUNE surface de level-up à l'écran —
  bouton « Level up → L{n+1} » ajouté au panneau Infrastructure.

### Vérification de spec — la garantie voisin n'ancre pas l'observateur
Le déroulé E2E proposé par la spec s'appuyait sur « cible inscrite après
l'observateur ⇒ voisin 150–240 pc DE L'OBSERVATEUR » : FAUX en base de
dev partagée — l'ancre est N'IMPORTE QUEL actif. Parcours re-conçu
DÉTERMINISTE : un Souverain SCIENTIFIQUE observe un monde sauvage de SA
poche (≤ 60 pc, couvert à tout niveau) ; l'échelle 1→2→3→4 se joue par
level-ups du télescope (+1 scientifique dès L1). Le couple
observateur/cible étranger reste couvert en INTÉGRATION (univers neuf à
deux joueurs : là, la garantie du second inscrit est réelle).

### Leçon Playwright — le clic « en attente » re-tire
Un `btn.click()` gardé par isVisible() dans une boucle toPass a produit
un DOUBLE level-up (télescope 1→3 sans passer par l'assertion L2) : le
clic en attente de visibilité part quand le bouton du niveau SUIVANT
apparaît. Règle adoptée : pour les actions à effet cumulatif, UN clic
sur un état PRÉ-STABLE vérifié par l'API, jamais de clic dans une boucle
de retry.

### Vérifications
86 unit shared (11 intel : paliers, +1 plafonné, sonde, listes blanches
EXACTES, invariants négatifs, estimation de population) ; 116/116
intégration (8 intel : 404 hors scope, montée L1→L3, +1 gouverneur
scientifique → L4, sonde → L4, /planets d'autrui 403 même à L4, étoile
refusée, fuite quality fermée dans /galaxy) ; E2E 16/16 dont intel ×2
(échelle complète 1→4 sur monde sauvage, refus directs 404/403) ;
captures int-01..04 observées à la vision (§16) : badge Intel L1 +
3 rangées cadenas, bloc Development (0/4 tuiles, pop ~0), bloc Strategic
(présence de 7 gisements SANS tonnage), Deep sight (qualité F, tonnages
2711/2711…, ADN tech complet). Vidéo .webm conservée (preuve n°15).
