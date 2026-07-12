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
