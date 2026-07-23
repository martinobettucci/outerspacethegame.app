# ATG — Decision JOURNAL (raw log)

> Append-only, chronological log of raw design decisions as they were made.
> `GAME_BOOK.md` is the reconciled canon; it can be rebuilt from this journal.
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
- **Created `GAME_BOOK.md` (canon) and `JOURNAL.md` (raw log).** Journal is the
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

---

## 2026-07-13 — Session 30 (suite) : correctif « from scratch » (signalé Node 24)

### Problème (signalement du responsable)
« Broken on Node 24 » au lancement sur son PC. Reproduction sur clone
FRAIS (scratchpad, Node 24.18 téléchargé pour l'occasion) : `pnpm
--filter @atg/server seed` → `ERR_MODULE_NOT_FOUND
@atg/shared/dist/index.js`.

### Cause — pas Node 24 : le clone frais
Contre-épreuve : le MÊME clone frais échoue à l'identique sous Node
22.22. Les exports de `@atg/shared` pointent sur `dist/` (compilé), et
AUCUN chemin de lancement ne construisait le paquet — nos machines de
dev masquaient le défaut parce qu'un build avait déjà eu lieu. Tout
premier lancement (seed, API, worker, client Vite) échouait donc, quel
que soit Node ; le responsable l'a rencontré avec Node 24, d'où
l'attribution initiale.

### Correction
`runDev.sh` et `resetDb.sh` commencent par `pnpm --filter @atg/shared
build` (explicite et journalisé) ; README : prérequis (Node ≥ 22
vérifié sur 22 ET 24, pnpm ≥ 10, Docker) + note pour les lancements
manuels hors scripts.

### Vérifications
Clone frais + Node 24.18 : `pnpm install` (8 s), `pnpm runDev` complet —
build shared, conteneur DB healthy, migrations, seed, worker qui tick,
API `/health` ok, inscription réelle par HTTP (201), client Vite 200.
Suites sous Node 24 : shared 86, unit 32, intégration 116 — toutes
vertes. Limite honnête : pas de test AUTOMATISÉ « clone frais » (ce
serait un smoke de CI — noté au backlog outillage) ; la garde est le
script de bootstrap lui-même, documenté.

---

## 2026-07-13 — Session 30 (suite) : correctif — la chaîne census gelée par un worker lent

### Problème
La spec E2E census a échoué après le test from-scratch : dernier
snapshot à 15:50, prochain `census_run` planifié à 21:50 (+6 h). Le
worker du runDev de reproduction (TIME_SCALE=1 — configuration LÉGITIME)
avait réclamé l'événement et replanifié avec SON intervalle ; le worker
E2E (3 s) ne re-amorce pas la chaîne (un pending existe) et attend 6 h.

### Décision
Au boot, chaque worker RE-CLAMPE tout `census_run` non traité planifié
au-delà de son propre intervalle (UPDATE due_at = now(), idempotent).
Auto-guérison dans les deux sens : un runDev qui suit une session E2E
resserre à 6 h max, un E2E qui suit un runDev resserre à 3 s. Leçon
(suite de celle des workers zombies) : une récurrence UNIQUE partagée
entre workers de configurations différentes doit être re-normalisée par
chacun — jamais supposée conforme à sa propre config.

### Vérifications
File réparée puis spec census verte (8,3 s) ; suite E2E complète 17/17 ;
cadence re-observée en base (snapshots à 3 s d'écart).

---

## 2026-07-13 — Session 30 (suite) : chunk R — pods de recrutement

### Canon appliqué (GB §12/§13, DG §11.4)
Le pod est un PUITS de ressources : payé dans n'importe quelle
ressource, prix `max(5, 40 × (S_r/S̄)^0.7)` [TUNE] dérivé du census, les
achats comptent dans l'offre IMMÉDIATEMENT ; 1 PNJ par pod (rareté
62/24/10/3.4/0.6, rôle uniforme, peuple 60/30/10) ; rolls individuels à
l'ouverture (baseline +4 %/tier × U(0.5,1.5)) ; cap 10/jour ; comptes
< 45 jours interdits ; PNJ lié au compte 60 jours.

### Décisions v1 & interprétations
- **S̄ « trimmed supply-weighted mean »** [TUNE interp] : moyenne
  pondérée par l'offre (Σs²/Σs) sur les offres NON NULLES, après trim de
  10 % à chaque extrême. Première version : trim sur TOUTES les valeurs
  — dans un univers jeune (29 ressources à zéro sur 31) le trim avalait
  les seules valeurs non nulles et tout tombait au plancher. Décision :
  l'absence n'est pas un outlier ; les zéros sont ignorés (la
  pondération par l'offre les ignore déjà) — attrapé par le test
  d'exhaustivité du barème.
- **Impact immédiat** : S_r effectif = S_r du dernier census − tonnes de
  pods payées en r depuis le snapshot (journal pod_openings). La
  DIRECTION du prix n'est pas garantie (S̄ bouge aussi) — le test
  d'intégration assert l'ÉGALITÉ EXACTE avec la formule partagée, pas
  une direction ; l'E2E l'a rendue visible (115,64 → 115,29 T).
- **Déterminisme du roll** : seed = universe:pod:joueur:index d'achat,
  l'index étant sérialisé par le verrou FOR UPDATE de la ligne joueur
  (même mécanisme qui sérialise le cap quotidien) — le test rejoue
  rollPodNpc avec le même seed et obtient le MÊME PNJ.
- **Paiement physique** (co-location GB §13) : le prix se débite du
  stock d'un monde POSSÉDÉ, taux rebasés — pas de trésorerie abstraite.
- **Âge de compte** : la règle canon des 45 jours rend les pods
  invisibles en dev/E2E sans instrumentation — POST /test/age-account
  (§15, compte COURANT uniquement, jamais en prod) vieillit le compte ;
  l'E2E démontre LES DEUX branches (refus visible puis succès).
- **Strictest-bind au transfert d'hôte** : hors périmètre (les
  transferts d'hôtes arrivent avec enchères/NFT P4) — annoncé.

### Vérifications
94 unit shared (8 pods : formule, plancher, trim, exhaustivité,
déterminisme, bornes U(0.5,1.5), governor-grade) ; 122/122 intégration
(6 pods : barème exhaustif, âge refusé en direct, ouverture complète
— stock débité, PNJ lié 60 j, roll identique au seed rejoué, prix
suivant = formule exacte —, cap 10 refuse le 11e, refus monde
d'autrui/ressource inconnue/stock insuffisant, sans census refus
explicite) ; E2E 17/17 dont pods ×2 (10,7 s et 7,2 s) ; captures
pod-01/02 observées à la vision (§16) : refus « Compte trop jeune : 45
jours requis » verbatim, révélation merchant UNCOMMON humain +10,06 %
trade bonus, roster à 2 personnages avec date de liaison, impact de
prix à l'écran. Vidéo .webm conservée (preuve n°16).

## 2026-07-17 — Chunk S : docks de spaceport (GB §9/§14, DG §5.1/§8.6)

**Contexte.** Reste principal du chunk J (« AUCUNE limite v1 — annoncé ») :
les comptes de docks, réservations et l'éviction de séjour. Reprise après
`git pull` demandé par le responsable (la branche avait reçu d'une autre
session la suppression du site Jekyll et une refonte des styles UI).

**Décisions.**
- *Comptes cumulatifs* : L1 = 2 S ; L2 = +2 M ; L3 = +2 L [TUNE], une
  coque ≤ son dock ; faisabilité par algorithme GLOUTON de débordement
  (L d'abord, M déborde sur L, S sur M puis L) — correct pour 3 tailles
  ordonnées, testé sur les remplissages exacts.
- *Réservations « pour soi »* (canon « ready to depart », plancher
  anti-DoS 1–2) : 0–2 par spaceport [TUNE], défaut 0 (conservateur — le
  canon suggère 1–2, documenté). [TUNE-v1 interp] : les docks réservés
  sont soustraits du pool VISITEURS en commençant par les plus petits
  (S avant M avant L) — déterministe ; le propriétaire ignore les
  réservations (c'est leur raison d'être).
- *Exception bootstrap* [TUNE-v1] : SON monde SANS spaceport actif
  accueille toujours (chunk J conservé) — le canon strict bloquerait le
  début de partie, le starter naissant sans bâtiment. Dès qu'un
  spaceport actif existe, la capacité s'applique à TOUS, propriétaire
  compris. Effet de bord assumé : pendant une montée de niveau (port
  `constructing`, donc inactif), le propriétaire retombe sur l'exception
  bootstrap et les visiteurs sont refusés (aucun port actif) — cohérent,
  documenté ici.
- *Combat-S* : « se pose n'importe où, sans dock » (GB §14) étendu à
  l'ignorance de la politique d'atterrissage et des mondes sauvages
  [interp annoncée] ; le sanctuaire/siège (P5) arbitrera. Pour fermer le
  parking gratuit (à quai = aucun drain), l'éviction de séjour vise TOUT
  visiteur d'un monde possédé, coque exemptée ou non [TUNE-v1 interp] ;
  sur monde sauvage, pas d'éviction (personne pour évincer) — les
  horloges de survie (P3) borneront.
- *Éviction* : événement `dock_eviction {shipId, bodyId, landedAtMs}` à
  +dwell/timeScale ; dwell par port 1–720 h [TUNE], défaut 24 h, le plus
  généreux des ports actifs prévaut (miroir de la politique la plus
  permissive). Garde d'idempotence par `ships.docked_at` (migration
  011) : n'évince que si docked_at = landedAtMs — un départ/retour a
  replanifié SA propre éviction, l'ancienne se périme toute seule.
  Renvoi au survol avec réservoir armé (rebase tank).
- *Chantier* : les coques naissent à quai même docks pleins (annoncé —
  les docks bornent le débit d'ATTERRISSAGE, pas la production) ; l'UI
  montre honnêtement « S 3/2 ».
- *Verrouillage* : landShip passe à l'ordre CORPS avant vaisseau (idiome
  refuel, DAT §8) — les atterrissages concurrents d'un même monde se
  sérialisent sur la ligne bodies ; la propriété du vaisseau se vérifie
  AVANT tout état (§10 : pas d'oracle d'état sur la coque d'autrui —
  régression attrapée par le test direct existant, corrigée).
- *Visibilité visiteur* : v1, un visiteur découvre la saturation au
  refus (messages distincts « aucun dock ≥ taille » vs « saturés ») ;
  l'affichage distant de la disponibilité viendra avec l'intel/scan.

**Vérifications.** Shared 104 (dont 10 docks) ; serveur 32 unit + 134
intégration (dont 12 docks : capacité, structurel vs saturé, exemptions
en saturation, réservations propriétaire/visiteur, éviction + péremption
au re-atterrissage, jamais-le-propriétaire, sauvage/Combat-S, bornes et
refus directs §10) ; E2E 18/18 ; captures dock-01…05 observées (§16) :
usage S 1/2, réglages 48 h + 1 réservé appliqués, overfill chantier
S 3/2, refus « Docks saturés : aucun dock libre pour une coque S »
visible en notice, L2 avec S 3/2 · M 0/2 (débordement S en dock M).
Migration 011 appliquée en dev uniquement (PROD_MIGRATIONS.md : 011 en
attente d'instruction humaine).
## 2026-07-17 — Réparation E2E après synchronisation (§13)

**Problème.** Le pull a apporté une refonte UI d'une autre session
(étiquettes de corps devenues BOUTONS « Inspect X », index de contacts
listant les mêmes noms, restyle de la scène planète). 6 specs E2E sur 17
cassaient : violations strict-mode (`getByText(nom)` ambigu), clics-sprite
interceptés par les nouveaux boutons-étiquettes (l'Arche à +32 px SOUS le
corps tombe pile sur l'étiquette), géométrie de tuile « centre du canvas
− 20 px » périmée pour les comptes FIXES (market/chantier dont le
bâtiment historique vit sur une autre tuile), census flaky.

**Diagnostics et décisions.**
- `galaxyLabel(page, nom)` (lib) = SEUL localisateur d'étiquette ; les
  sélections de vaisseaux et de destinations passent par l'INDEX DE
  CONTACTS (`ship:<id>` / `body:<id>`, aria « Choose destination » en
  mode ciblage) — chemin clavier canonique de la refonte, déterministe ;
  la sélection par clic-sprite reste couverte par game-flow
  « mouvement » et hover-drain.
- Comptes fixes : la tuile du bâtiment se lit par l'API
  (`buildings[].tileIndex` + boardHelpers.tilePx), jamais un pixel codé.
- Census : le +500 T d'ORE se noyait dans la consommation des usines de
  TOUT l'univers dev accumulé (~300 comptes) à ×7200 — le grant porte
  désormais sur GOLD (aucun consommateur CONTINU ; les flux census sont
  conservatifs) : monotone, déterministe.
- Playwright : `workers: 2` (au-delà, la contention CPU affame les
  scènes three.js et le tick worker — hit-tests et cadence census
  flaky) ; fenêtres de clic 20→40 s.

**Vérification.** Suite complète : 18/18 (census 8 s, docks 1,4 min,
colonisation 2,4 min, hover 1,8 min). L'univers dev partagé qui grossit
à chaque run reste un risque de charge connu (backlog : reset
périodique documenté ou univers E2E dédié à discuter).

## 2026-07-18 — Chunk T : canal manuel (GB §9, DG §6 round 7)

**Contexte.** Backlog « Manual channel » : browse des warehouses publics à
quai, offres manuelles limitées, résolution manuelle.

**Décisions.**
- *Item v1* [TUNE-v1 interp] : (monde, ressource fongible) sur le POOL
  planétaire — le stock fongible v1 est un pool (planet_stock), les
  inventaires PAR entrepôt, véhicules et objets arrivent avec leurs
  systèmes (enchères P4). Browsable ⇔ ≥ 1 warehouse ACTIF PUBLIC ;
  chaque warehouse porte sa visibilité (config), défaut PRIVÉ (le canon
  ne fixe pas de défaut ; jamais de fuite accidentelle).
- *Browse à quai STRICT* : canon « docked at a commerce dock » — pas de
  survol (l'hospitalité innée, elle, sert en survol : différence
  volontaire). Montants seuls, arrondis 0,1 T, jamais les taux.
- *« Any price »* : bundle explicite get/give ; une PURCHASE offer paie
  quelque chose → give > 0 [TUNE-v1 interp]. Expiration en heures
  RÉELLES (règle sociale, pas de simulation — TIME_SCALE n'accélère que
  les événements) ; balayage paresseux à la lecture, aucun événement.
- *Vaisseau épinglé* : l'offre mémorise le vaisseau à quai de sa
  création ; l'acceptation exige qu'il y soit ENCORE (règlement
  physique stock ↔ soute, conteneurs DG §7). Parti = « plus à quai »,
  l'offre reste ouverte (retrait possible).
- *Stockage en delta NET* (§3.3b) : l'overfill EXISTE (grants, seules
  les productions s'arrêtent au cap) — on ne refuse l'acceptation que si
  l'échange AGGRAVE un dépassement (découvert par l'E2E : monde vendeur
  sur-cap, troc net-neutre refusé à tort par le contrôle strict).
- *Interaction chunk S constatée en E2E* : l'éviction de dock (dwell
  24 h-jeu ÷ 7200 = 12 s réelles) renvoyait l'acheteur au survol avant
  l'acceptation — « le vaisseau n'est plus à quai ». Comportement VOULU
  des deux systèmes ; le test règle dwell = 720 h-jeu (6 min réelles),
  exerçant au passage l'UI du chunk S.
- *Instrumentation* : POST /test/relocate-ship (gated ATG_TEST_ENDPOINTS,
  vaisseau PROPRE, drain réservoir armé) — les poches de spawn sont
  disjointes et l'autonomie Cargo S rend le vol inter-poches non
  déterministe ; l'atterrissage reste le VRAI chemin (politique + docks).
  Piège corrigé : le hauler naît à sec → échoué dès l'arrivée ; le test
  fait le plein d'abord (/test/ship-fuel).

**Vérifications.** Shared 108 ; serveur 32 unit + 149 intégration (15
canal manuel : visibilité §10, browse à quai/survol/privé, limites
1-par-item et 20/24 h (bourrage SQL puis fenêtre glissante), refus
propriétaire/pas-à-quai, retrait d'autrui refusé, décliner/accepter avec
deltas EXACTS et journal slot −2, échecs propres (parti/soute/stock),
sur-cap net-neutre vs entrée nette, expiration) ; E2E 19/19 dont
manual.spec.ts à deux comptes réels ; captures man-01…05 observées
(§16) : visibilité publique appliquée, browse à quai avec stock, refus
du doublon visible en notice, boîte de réception Accept/Decline, fret
« ore · 2.0 T » à bord de l'acheteur. Migration 012 appliquée en dev
uniquement (PROD_MIGRATIONS.md : 012 en attente).

## 2026-07-18 — Chunk U : pools AMM du marché L2 (GB §9/§13, DG §11.2)

**Contexte.** Suite de l'arc commerce (K taux fixe → L inné → T canal
manuel). Session sur la machine locale du responsable (WSL2) : bootstrap
de l'environnement (dockerd du poste PARTAGÉ avec d'autres projets — seul
le conteneur atg-dev-db est touché), migrations 011/012 appliquées au
volume local qui s'était arrêté à 010.

**Décisions.**
- *Pas de migration* : le pool vit dans le slot (`buildings.config`),
  variante `{mode:'amm', pool:{x,y,rx,ry,seededAtMs}, limites,
  whitelist}` aux côtés des slots taux fixe ; un slot AMM retiré laisse
  un TROU (null) réutilisable — tous les consommateurs le tolèrent.
- *Frais sur la jambe d'entrée* : dxEff = give×(1−50 bp) ; la jambe LP
  (25 bp, 20 bp au L3) rejoint la réserve d'entrée HORS produit (k
  croît — c'est la rémunération de la liquidité) ; la maison (25 bp
  [TUNE round 4a]) sort du pool vers le stock planétaire.
- *LP v1 = propriétaire seul* [annoncé] : add PROPORTIONNEL au ratio
  courant (préserve le prix — ajouter à un autre ratio le déplacerait),
  remove en pourcentage des deux jambes (delta net de stockage nul :
  réserves et stock comptent au même cap). Les LP visiteurs (« if the
  owner allows »), le retrait système-garanti et les liens survivant à
  la conquête arrivent avec les shares P4.
- *Réserves = stock physique* (canon DG §3.3b « pool reserves COUNT
  against the cap ») : pooledT injecté dans computeRates (frein/halt),
  storageUsedT, contrôles de cap des échanges — et le census gagne un
  compartiment `ammPoolT` (DG §11.5 « stocks + cargo + pools +
  escrow ») ; l'évolution de forme a été rattrapée par les tests
  existants (attendus mis à jour, sources +'amm_pools').
- *Gate L2 mercantile* : porté par le level-up du bâtiment
  (politicsFromLevel) — le seed vérifie le NIVEAU ; un changement de
  gouvernance après coup n'éteint pas les pools existants (même
  sémantique que les slots, documenté).
- *Jamais d'oracle* : le spot est affiché comme information ; les pods
  restent sur le census (canon).

**Vérifications.** Shared 115 (7 blocs AMM) ; serveur 32 unit + 158
intégration (9 AMM : seed physique et §10, stockage inchangé au seed
— la neutralité stock→pool PROUVE le comptage des réserves —, quote
partagée = règlement serveur à 1e-9, jambe inverse, whitelist/limite
quotidienne, liquidité proportionnelle, retrait libérant le slot,
census neutre avec compartiment ammPoolT ≥ réserves) ; E2E 20/20 dont
amm.spec.ts (gate mercantile réel via level-up, prix induit affiché
AVANT l'engagement, swap avec dérive du spot en notice, retrait
restituant les réserves au stock) ; captures amm-01…04 observées (§16).
Trébuchements instructifs : sur-cap du monde de test (le contrôle
net-delta a refusé à raison — dotations réduites), 5 T = 5 conteneurs
sur une soute S de 3 (DG §7, deux fois — décidément), trous null dans
les tableaux de slots (garde flatMap).

## 2026-07-18 — Chunk V : routage cells-étoile, double-fee, nudge triade (GB §13, DG §11.2)

**Contexte.** Clôture de l'arc commerce P1. En cours de chunk, le
responsable a activé la boucle autonome (/loop, puis /loop 1h avec
consigne de tenir docs/SUGGESTIONS.md — créé).

**Décisions.**
- *Meilleure exécution* : l'endpoint de route N'EST PAS un « swap à deux
  jambes » aveugle — il énumère pools directs ET routes à deux jambes,
  écarte les jambes inéligibles (whitelist/limites PAR slot), maximise
  la sortie, départage par clé déterministe. Le double frais reste
  canon : chaque jambe paie SON pool (prouvé en test : route < direct
  équivalent).
- *Atomicité physique* : l'intermédiaire ne touche JAMAIS la soute ;
  journal par jambe (le slot_index de chaque pool) ; commissions maison
  par jambe (ressources d'entrée distinctes par construction — x ≠ y).
- *Multi-bâtiments* [interp annoncée] : la route peut traverser deux
  marchés du même monde — les pools sont physiques et planétaires ;
  verrous marchés par id croissant puis corps puis vaisseau
  (anti-deadlock avec executeAmmTrade qui verrouille marché → corps).
- *Nudge triade* : portée TÉLESCOPE seule (canon « within telescope
  range ») — pas la vision des coques ; une paire FOOD fixe OU AMM
  éteint le nudge, la sienne comme celle d'un voisin VISIBLE ;
  l'hospitalité innée n'est pas une paire de marché [interp]. Calculé
  dans planetDetail (null sans marché actif — le nudge vise les hubs).
- *Import world↔planets* : cycle ESM bénin (usages en corps de fonction
  seulement) — surveillé, les 165 tests d'intégration l'exercent.

**Vérifications.** Shared 117 ; serveur 32 unit + 165 intégration (7
route/nudge) ; E2E 21/21 ; captures route-01…03 observées (§16) — la
02 montre les réserves des DEUX pools déplacées et la notice « +1.80 T
water (via fuel cells, 2× frais) ». Flake diagnostiqué en suite
complète : le roll de TAILLE du starter (S = 800 T de franchise)
sur-dotait les mondes E2E — les specs AMM/route posent désormais un
depot (+200 T), suggestion d'un filtre de taille consignée dans
SUGGESTIONS.md.
## 2026-07-18 — Chunk W : gouvernance v1 (GB §11/§21, DG §4.1)

**Contexte.** L'intersection des masques et le vaisseau-parqué-au-masque
existaient (chunks E/L/Q) ; manquaient exigences par taille, G ×0.5,
installation permanente et préview canon-obligatoire. Les pods (chunk R)
produisent des PNJ de grade gouverneur sans emploi — la boucle se ferme.

**Décisions.**
- *Échelle du bonus* : RARITY_TIER_INDEX est 1-based (common=1, chunk R)
  — un ensemble min-rare donne +6 %, min-legendary +10 % [TUNE].
- *G ×0.5 généralisé aux moyens* [TUNE-v1 interp] : le canon ne chiffre
  que les grands ; la symétrie est jouable PARCE QUE le vaisseau
  personnel parqué compte pour un siège (GB §21) — un starter moyen naît
  gouverné, et perd la moitié de ses débits si l'ancre décolle (tension
  voulue : « adds governance capability when parked »).
- *Vaisseau parqué et bonus* : il satisfait l'exigence mais ne porte NI
  ne dilue le bonus de rareté (calculé sur les INSTALLÉS seuls) — sinon
  parquer son vaisseau PÉNALISERAIT un monde à gouverneurs rares.
- *Interp chunk N amendée* : le pilote fondateur (souvent common) ne
  prend un siège de colonie QUE s'il est de grade gouverneur — sinon il
  redevient non hébergé. Sans cet amendement, l'installation étant
  permanente et sans retrait, chaque colonie moyenne naissait avec son
  siège unique squatté à jamais par un common (+2 % impossible, choix
  d'archétype impossible). Test colonisation mis à jour.
- *Préview* : serveur (candidats re-validés — pas de préview-oracle sur
  les PNJ d'autrui), retourne aussi les nœuds PERDUS vs le masque
  courant ; l'UI exige la confirmation TYPÉE du nom de la planète
  (patron de permanence du design system).
- *G dans le snapshot* : planetMultiplier = E(pop/cap) × G — l'affichage
  planetEfficiency reste E (la cloche) ; G est montré séparément
  (badge). Toutes les industries suivent (testé ×0.5 exact).

**Vérifications.** Shared 113 (5 blocs gouvernance) ; serveur 32 + 157
intégration (8 gouvernance : parqué/décollé sur débits réels, préview
exacte via effectiveMask partagé et sans mutation, caps S/M/L, grade,
§10 étranger/lié/monde d'autrui, 3 sièges + bonus min-tier 1.06) ; E2E
20/20 dont governance.spec.ts ; captures gov-01…04 observées (§16) —
gov-04 montre l'hospitalité mercantile (chunk L) apparaître dès
l'installation du merchant : les privilèges de gouvernance s'activent
par le même chemin `governingArchetypes`. Aucune migration.

## 2026-07-18 — Chunk X : sol de terrain par climat + slots discrets

**Demande du responsable (mi-session).** « since you have access to
fal.ai, you can make terrains slot less prominent (less visible unless
hovering) and add a terrain sol selon the planet type (like in the
prototypes screenshots). »

**Limitation constatée (§1).** Cette session n'a AUCUN canal fal.ai :
les hôtes fal.run/fal.ai répondent CONNECT 403 via le proxy d'agent, et
ni FAL_KEY ni OPEN_AI_KEY ne sont provisionnées dans l'environnement
(vérifié). Décision : livrer la demande en PROCÉDURAL — dalle organique
teintée par la rampe climatique existante, bruit stableNoise seedé par
planète — avec un point d'entrée clair pour substituer des textures
générées (fal.ai/OpenAI Images) dès qu'une clé sera provisionnée dans le
worker. La direction visuelle suit le prototype 02-iso-colony (masse de
terrain organique, coutures de tuiles discrètes).

**Décisions.**
- Dalle = contour 30 segments, rayon perturbé ±18 % (seed = tuiles +
  initiale du nom — stable par planète), épaisseur 24 px (edge.left),
  liseré éclairci, mouchetis 620 points en trois teintes masqué par le
  contour ; aura/ombre redimensionnées à l'étendue réelle de la grille.
- Slots fantômes : alpha 0.2 au repos, 1 au survol (tint or si carte
  armée et tuile libre), pulse 0.62±0.18 en mode placement (statique
  0.72 si prefers-reduced-motion), 0.08 sous un bâtiment. Synchronisé
  par un ticker dédié TOUJOURS actif (état, pas décor).
- Falaises par tuile SUPPRIMÉES (relief porté par la dalle) ; le losange
  interactif 148×74 et ses positions restent identiques — les contrats
  pointeur et la géométrie tilePx des E2E ne bougent pas.

**Vérifications.** game-flow 12/12 (pose par clic, ouverture de
panneaux, persistance) ; docks/gouvernance/colonisation/manuel 4/4 ;
§16 : tempéré (captures 05/06/10 observées — dalle, pulse de placement,
bâtiments au sol) + sonde jetable pour hot/cold/poison (3 comptes réels
re-teintés en base de dev, stack réelle, captures observées : ocre /
bleu-acier / vert acide, silhouettes distinctes par seed). L'état
survol partage le mécanisme du pulse (alpha 1 + tint) — observé en
placement, non capturé isolément (annoncé).

## 2026-07-19 — Réconciliation amont + chunk Y : retool & overfill (DG §5.1, §3.3b)

**Réconciliation.** Pull fast-forward des chunks W (gouvernance v1) et X
(sol organique) livrés par la session parallèle (qui avait déjà fusionné
mes U/V). Rejeu complet local : builds, 122 shared, 32 unit, 173
intégration ; la suite E2E a montré UN flake — « boucle colonie » à
16,8 s en solo mais > 60 s en suite à 2 workers (la scène au sol
organique est plus lourde sous WSL2) → timeout global 60→120 s
(commit dédié 1101a74).

**Chunk Y — décisions.**
- *Retool* : recette écrite IMMÉDIATEMENT + statut `retooling` (la
  production s'éteint par le filtre actives-seules du rebase — même
  mécanique que la montée de niveau) ; réveil par retool_complete.
  Industrialist : instantané si gouvernance TOUTE industrialist ET
  fenêtre 24 h libre (config.lastInstantRetoolMs) ; fenêtre occupée →
  retool STANDARD plutôt qu'un refus [TUNE-v1 interp — canon muet].
- *Overfill-on-delivery* : la lecture COMPLÈTE du canon §3.3b
  (« swaps/deliveries may overfill (physics); only production halts at
  cap ») a révélé que les refus de cap posés depuis le chunk J étaient
  PLUS STRICTS que le canon — six sites levés, deux tests retournés.
  Le trop-plein est absorbé par le frein/halt de production, visible au
  census (§26 : le canon prime sur les choix d'implémentation passés).
- *Constante dormante* : un RETOOL_HOURS préexistait (inutilisé) dans
  buildings.ts — dédoublonné.
- Le responsable a signalé la clé OPENAI_KEY dans .env (jamais commitée)
  pour générer les textures de sol du chunk X — chantier suivant.

**Vérifications.** Intégration 178 (5 retool + 2 amendés) ; E2E
retool.spec.ts (instantané → fenêtre occupée → 24 h minutées à ×7200,
captures ret-01…03 observées — le retard d'affichage des badges de
chantier après l'éveil est consigné dans SUGGESTIONS.md) ; suite
complète en cours au moment du commit, résultat au compte rendu.
Migration 013 appliquée en dev uniquement (PROD_MIGRATIONS.md : 013 en
attente).

## 2026-07-19 — Chunk Z : sols générés par climat (gpt-image-2)

**Contexte.** Le responsable a provisionné OPENAI_KEY dans .env (local,
jamais commitée) et demandé gpt-image-2 pour les terrains — levée de la
limitation notée au chunk X (aucun canal d'images).

**Décisions.**
- Pipeline `scripts/genSoil.mjs` : prompts par climat (style « top-down
  seamless, painterly sci-fi, dark moody » aligné DESIGN_SYSTEM), taille
  1024², qualité medium ; repli gpt-image-1 si le modèle demandé
  n'existe pas sur le compte (gpt-image-2 a répondu directement) ;
  archive PNG pleine dans docs/design/prototypes (convention), asset
  webp 768² via ffmpeg (dépendance documentée dans le script).
- Intégration : TilingSprite (tileScale 0.42, alpha 0.88) masqué par le
  contour organique, ajouté SOUS le mouchetis — les accents procéduraux
  du chunk X (rim, specks, slots fantômes) restent par-dessus ; échec de
  chargement → rendu procédural inchangé (aucune régression possible).
- §16 : le roll de climat du STARTER est contraint (16 comptes = 1 seul
  climat) — la sonde jetable force le climat en base dev entre quatre
  captures du même monde (restauré ensuite), méthode consignée ici.

**Vérifications.** Captures soil-{temperate,hot,cold,poison} observées :
masquage propre, profondeur de dalle conservée, slots lisibles ;
suite E2E complète relancée après l'intégration (résultat au compte
rendu). Aucun test de simulation touché (changement purement visuel).

## 2026-07-19 — Chunk AA : texturation de l'UI (gpt-image-2)

**Contexte.** Après les sols (chunk Z), le responsable demande des fonds
texturés pour les panneaux et cartes de l'UI — texturation de chrome,
pas de remplacement d'art de jeu.

**Décisions.**
- Famille de QUATRE textures cohérentes (panel/card/shell/veil), prompts
  « extremely subtle, low contrast, near-black indigo » — la lisibilité
  du texte prime (§22) ; webp 512² (2–24 Ko, le bas contraste compresse
  très bien).
- Intégration en couche intermédiaire du background multi-couches
  existant : les gradients de teinte restent PAR-DESSUS (alphas 0.97 →
  ~0.88-0.92) et la couleur de base dessous — les états, bordures et
  accents des composants sont inchangés ; retirer la texture = retour
  exact à l'avant.
- Surfaces : ls-command-panel, ls-construction-card, ls-modal-layer
  (planet-panels) ; galaxy-panel, planet-inspector, planet-plaque
  (scenes) ; ls-command-rail (shell). Les micro-cartes (offres marché,
  hospitalité…) restent sur leurs rgba — trop petites pour une trame.

**Vérifications.** Sonde jetable : modale de recette sur deck (voile
nébuleux + cartes), vue planète (rail + inspecteur + deck), panneau
d'inspection galaxie — textures perceptibles sans jamais gêner la
lecture ; suite E2E complète relancée après le changement de styles
(résultat au compte rendu).

## 2026-07-19 — Chunk AB : horloges de survie, auto-flee, derelict (GB §6, DG §3.5/§8.8)

**Décisions.**
- *Réservoir paresseux* (motif fuel 008) : taux UNIQUE appliqué à food et
  water (0,01 × équipage), matérialisé au rebase — le rebase de survie
  est un PIGGYBACK de rebaseShipDrain (tous les points de bascule
  couverts d'un coup) + départ en transit + assignation d'équipage.
- *Où l'on mange* : partout où l'équipage vit à bord, TRANSIT compris
  (c'est l'horloge de mort du vol — le fuel, lui, reste pré-brûlé v1) ;
  exemptions [TUNE-v1] : quai/entrepôt (l'hôte nourrit), survol de SON
  monde (le chemin stock-planète viendra comme pour le fuel), colonizing
  (vivres du kit à part), derelict.
- *Garde d'armement* : l'horloge ne s'arme que si worst(food,water) > 0 —
  les tests d'intégration ont attrapé la régression (l'Arche de
  colonisation, équipée mais aux réservoirs de survie vides, mourait à
  l'instant du départ) ; l'avitaillement devient une boucle de jeu là où
  les réservoirs sont remplis (hauler de spawn 2/2).
- *Alarme 25 %* : ancrée à la CAPACITÉ de coque (survivalCrewDays × 0,01
  × équipage [TUNE-v1 interp — canon « 25% remaining » sans ancre]) ;
  auto-flee-home armée par défaut, désarmable ; la fuite ne part que si
  le monde possédé le plus proche est À PORTÉE du réservoir (sinon
  l'horloge court — pas de téléportation de complaisance).
- *survival_out* : host-fate (équipage supprimé), derelict DÉPOUILLÉE
  (owner NULL, migration 014) — l'épave disparaît de la flotte et de
  l'index ; salvage claims (items P4) et hijack (P5) : restent.
- *Complétude UI* : « Assign pilot » n'existait que sur les coques
  civiles — étendu à cargo/combat (l'horloge suit l'équipage, il faut
  pouvoir équiper).
- *Arithmétique piégeuse* : 1e-6 T à 0,01 T/j = 8,64 s (pas 8 ms) — la
  fixture d'expiration utilise 1e-8 (86 ms) et n'avance JAMAIS l'échéance
  avant as_of (l'évaluation à rebours remonterait au-dessus de la garde).

**Vérifications.** Shared 125 (3 blocs) ; 32 unit + 185 intégration (7
survie) ; E2E survival.spec.ts 20 s (jauge/politique/expiration), suite
complète au moment du commit ; captures sv-01…03 observées (§16) —
sv-03 : l'épave a disparu de la flotte ET de l'index de contacts.
Migration 014 appliquée en dev uniquement (PROD_MIGRATIONS : 014 en
attente). Boucle reconfigurée par le responsable : cron horaire :23
(2a10e521), l'ancienne boucle dynamique arrêtée.

## 2026-07-19 — Chunk AC : preuve E2E du rattrapage hors-ligne (GB §15, DG §1)

Preuve utilisateur : travaux lancés → logout → 120 s réelles → retour :
événements rattrapés (spaceport actif, quille née à quai) ET stock lazy
= témoin + taux × Δt_réel (±0,05 — l'arrondi API à 2 décimales borne la
résolution : 45 s d'absence tombaient SOUS le seuil, d'où la fenêtre de
120 s ≈ 0,013 T à ~9,6 T/j). L'assertion « ça a coulé » est au seuil de
précision (+0,005) ; le zéro-dérive est la borne |mesuré − projeté|.
Items 69 (sim core « reste la preuve E2E ») et 93 (« Offline catch-up
correctness E2E ») soldés au backlog.

## 2026-07-19 — Chunk AD : entrepôt de véhicules (GB §9, DG §6 round 6)

**Problème.** Backlog ligne « Warehouse: balances S/M/L véhicules… » :
le warehouse (bâtiment livré côté visibilité au chunk T) n'entreposait
encore AUCUN véhicule ; le lien d'équipage (GB §12) n'avait pas son seul
point de sortie canon ; aucun moyen de garer une coque sans payer de
drain ni occuper un dock.

### Canon appliqué

- Balances **SÉPARÉES** par taille (round 6 : « jamais de débordement »,
  contrairement aux docks S→M→L) : tampon au sol 2 M + 2 S (jamais de
  L — TRANCHÉ session 22), chaque warehouse ACTIF ajoutant
  6 S/4 M/2 L × mult(niveau) [1, 2, 3] — constantes DORMANTES de
  `units.ts` (chunk E) enfin branchées, pas dupliquées.
- **Libération d'équipage** à l'entreposage = seul point de sortie du
  lien permanent (GB §12) ; ré-embarquement possible AU warehouse
  (assignCrew accepte `warehoused` — même monde possédé).
- **Zéro consommation** : drains carburant ET survie désarmés
  (rebaseShipDrain 'none', l'équipage étant déjà parti).
- **Redéploiement** : « needs a free dock » → capacité d'atterrissage du
  chunk S rejouée au LANCEMENT (exception bootstrap sans spaceport,
  comme landShip) ; durée 1/3/6 h par taille [TUNE, interp du « 1–6 h »
  canon] ÷ TIME_SCALE ; événement `ship_retrieved` (idempotent : ne
  repose que si encore `warehoused`) ; double-retrieve refusé.

### Décisions v1 & interprétations (annoncées)

- personnel/probe exclus de l'entrepôt (le Souverain ne se remise pas ;
  la sonde n'occupe pas de dock) [interp].
- Balances d'ITEMS (50/niveau) et blocage d'usine : DORMANTS tant
  qu'aucune usine d'unités n'existe — listés au backlog en « Restent ».
- Parking allié : P4 (factions), refus explicite « On remise sur SES
  mondes ».
- Si les docks se remplissent PENDANT le redéploiement, l'événement
  repose quand même la coque (overfill toléré, cohérent §3.3b — la
  vérification du dock est au lancement) [interp annoncée].

### Vérifications

- Shared 128/128 (7 nouveaux blocs docks : capacités [] /[1]/[2]/[3]
  /[1,2], séparation sans débordement, SHIP_RETRIEVE_HOURS).
- Intégration warehouse.test.ts **16/16** : tampon 2S/2M/0L, libération
  + re-crew au warehouse, zéro-conso (taux 0, aucun bord), séparation
  stricte (3ᵉ S refusé avec M libre), L structurel sans warehouse,
  L1 → 8S/6M/2L, §10 directs (autrui/monde étranger/personnel/survol/
  double-retrieve/retrieve non entreposé), 1 h S ÷ timeScale +
  événement → re-quai, 3 h M, dock plein → refus.
- E2E warehouse.spec.ts : warehouse construit, Warehouse → notice de
  libération + « Assign pilot » réapparaît (npcs rafraîchis — correctif
  trouvé PAR le test : le pilote libéré restait lié côté client),
  re-crew au warehouse, balances `Vehicles S 1/8 · M 0/6 · L 0/2` sur
  le bâtiment, Retrieve → re-quai réel (7200×) + balance vidée ;
  captures wh-01…03 observées.
- Suites complètes rejouées après synchro : shared 128, unit 32,
  intégration 201/201, **E2E 26/26 (10,2 min)**.

## 2026-07-19 — Chunk AE : avitaillement & survol nourri par le monde (GB §6/§7, DG §3.5)

**Problème.** Restes annoncés du chunk AB : l'exemption de survie en
survol de SON monde était inconditionnelle [TUNE-v1] — le canon veut que
le STOCK PLANÉTAIRE paie (« resupply round-trips ») et qu'un monde à sec
laisse l'équipage sur ses provisions ; et AUCUNE commande joueur ne
remplissait les réservoirs de survie (spawn et §15 seulement).

### Canon appliqué (miroir exact du chemin fuel)

- `hoverSurvivalNeeds` (0.01 T/j/tête, familles food_1→3 et water) entre
  dans computeRates APRÈS la survie de la population (priorité canon) ;
  servi ⇒ l'horloge de la coque est exempte ; non servi (familles vides
  sans arrivage) ⇒ bascule au recompute suivant, les provisions paient.
- Tout-ou-rien par FAMILLE (food ET water couvertes ensemble) [TUNE-v1
  annoncé] — granularité identique au fuel par type.
- Défaut PESSIMISTE côté coque : toute entrée en survol possédé arme le
  drain, le recompute de la même transaction rétablit l'exemption —
  aucun double-paiement possible.
- Avitaillement `POST /ships/:id/provision` : sur SES mondes (à quai,
  survol, échoué — miroir refuel), remplit food ET water à la capacité
  de coque (survivalCrewDays × 0.01 × équipage), familles dans l'ordre
  du catalogue, partiel si le stock manque.

### Régressions débusquées (par relecture du seam, verrouillées par test)

- `recomputePlanetRates` sélectionnait les coques en survol avec les
  SEULES colonnes fuel ; le rebase en cascade de la survie évaluait des
  champs absents → **provisions écrasées à zéro** à chaque recompute
  d'un monde survolé par son propriétaire.
- Même ligne partielle dans le handler `ship_arrival` → toute VRAIE
  arrivée de transit vidait les provisions (et désarmait l'horloge).
- Correctif : lignes `ships` COMPLÈTES (SELECT *) aux deux seams + tests
  de régression dédiés (recompute et arrivée forgée rejouée).

### Vérifications

- Shared 128/128 (renommage `planetServes`), unit 32/32.
- Intégration provision.test.ts **12/12** : régression recompute,
  servi (besoin 0.01 visible + horloge exempte + zéro bord), monde à
  sec → la coque paie, re-serve → désarmée, régression arrivée réelle,
  remplissage exact 0.04→0.14, plein refusé, partiel famille dans
  l'ordre, §10 ×3 (garde monde d'abord — même ordre que refuel).
- E2E provision.spec.ts (12,9 s) : jauge 0.03 → Provision → 0.14/0.14,
  refus « déjà pleines » en notice, survol possédé « host feeds the
  crew » + ratePerDay 0 backend ; captures pv-01/pv-02 observées.
- Test AB « survol de SON monde : exempt » mis à jour vers la sémantique
  AE (exempt SI SERVI — stocks granted + relocate avec recompute §15) ;
  suites complètes rejouées après synchro : intégration **213/213**,
  **E2E 27/27 (10,2 min)**.

## 2026-07-19 — Chunk AF : récolte stellaire & Starfall (GB §22, DG §2.1/§8.8)

**Problème.** Backlog ligne 104 : l'ADN des étoiles existait (classe,
type, stock, R_nova, garantie starter hors rayon — spawn) mais rien de
DYNAMIQUE : pas de rig, pas de récolte, pas de flare, pas de supernova.
La tragédie des communs autour des étoiles riches est un pilier canon.

### Canon appliqué

- **Rig d'atelier** (DG §8.8) : 20 steelL + 5 crystal + 5 gold [TUNE],
  monté à quai sur SON monde avec workshop ACTIF (L1 [TUNE interp — le
  guide n'exige L2 que pour le terraform core]).
- **Gradient** : rendement = 120 × (1 − d/8)² u/j [TUNE], NET de
  l'entretien idle (net ≤ 0 ⇒ refus explicite — le gréement ne couvre
  pas sa propre consommation) ; récolte IMMOBILE (statut idle [interp :
  l'image canon est un gréement déployé dans le vide]) ; type de
  carburant apparié (mono-réservoir v1).
- **Deux ledgers paresseux face à face** : réservoir de coque à taux
  POSITIF (bord harvest_full au plein → le gréement se replie,
  annoncé) ; stock CACHÉ de l'étoile à −Σ rendements (bord
  star_supernova à 0). Aucune jauge n'est JAMAIS exposée (canon) — le
  refus « le gréement ne remonte rien ici » est neutre.
- **Flare ≤ 5 %** du stock initial (colonne cachée star_fuel_initial,
  ajoutée plutôt que de recomposer rollStar — un forceClass sautait le
  tirage de classe, la recomposition aurait divergé sur les étoiles
  naturelles futures) : booléen public sur toute étoile VISIBLE.
- **Supernova** : annihilation STRICTE < R_nova — le starter, généré À
  R_nova exactement (40 pc), est SAUF (canon « guaranteed safe ») ;
  coques détruites (équipages host-fate ; junk au chunk salvage,
  annoncé) ; mondes réduits en CENDRE (config.annihilated, tiles 0,
  owner NULL — jamais recolonisables) ; classe L → trou noir ; S/M →
  plus rien. Transits évalués à leur position INTERPOLÉE.

### Défaut débusqué par le test (et sa leçon)

Le bord star_supernova tombait à ~94 ms du start dans la fixture ; la
troncature du due_at laissait un résidu de ~4e-8 u > garde 1e-9 → le
handler « périmait » l'événement DÉFINITIVEMENT (aucune replanification)
— une vraie supernova ne tirait jamais après une course serrée.
Correctif : sur résidu positif, REPLANIFIER au whenReaches suivant
(jamais périmer en silence un bord de mort). Boucle de Starfall dans le
test d'intégration (jusqu'à 6 passes).

### Vérifications

- Shared 132/132 (stars.test.ts : gradient, dégâts préview, flare).
- Intégration harvest.test.ts **14/14** : fit (coût, §10, personnel),
  gardes (quai/distance/type/net), double ledger exact (91.875/91.675),
  stop, harvest_full replie, départ = arrêt auto, flare 4 %/50 %,
  supernova S (victime + récolteur détruits, npc host-fate, starter
  SAUF, étoile disparue), supernova L (trou noir + monde en cendre).
- E2E harvest.spec.ts : parcours complet (rig payé, vol réel ×7200,
  récolte +91.7 u/j affiché, flare chip, Starfall — étoile disparue de
  la galaxie, récolteur annihilé, starter intact) ; captures hv-01…03.
- Réparation collatérale : hover-drain.spec échouait (solo ET suite) —
  ses sélections par CLIC PIXEL sur l'éventail dérivaient dès que le
  panneau vaisseau s'allonge (les boutons des chunks AD–AF) ; migré vers
  l'idiome robuste « Galaxy contact index » (4 sélections), reste pixel
  uniquement le choix d'un point de VIDE (validé par API). Solo 1,6 min
  vert.
- Suites complètes après synchro : shared 132, unit 32, intégration
  **227/227**, **E2E 28/28 (10,8 min)**.

## 2026-07-19 — Chunk AG : usure de coque & boucliers (GB §27 SETTLED, DG §8.8)

**Problème.** Ligne 107 : les environnements hostiles ne coûtaient rien
— et les dégâts d_safe du harvest rig (chunk AF, « Restent ») n'avaient
pas de substrat de HP. Le canon (round 4) est un PÉAGE déterministe,
jamais un blocage ni une mort.

### Canon appliqué

- 5 % des HP max/jour par source hostile NON blindée, cumul additif
  [TUNE-v1] : climat hot/cold du monde SOUS la coque (à quai ou en
  survol), zone ≤ 5 pc d'un trou noir ou d'une étoile en FLARE (bouclier
  radio) ; les dégâts de proximité du rig (d < d_safe) s'ajoutent tels
  quels, sans atténuation [TUNE-v1]. Tempéré : jamais. Bâtiments :
  jamais. Transit/entrepôt/colonisation/épaves : exempts [TUNE-v1].
- Plancher canon **1 HP** — le péage ne tue jamais (la destruction
  arrive avec le combat P5). Aucun bord : ledger paresseux pur.
- Trois boucliers d'atelier (workshop **L2**, politics-free) :
  15 steelL + 5 cristal apparié [TUNE] — radio → crystal_nox [interp :
  le cristal des mondes poison, l'environnement radiatif par excellence].
- Poison-harvest : DORMANT (la récolte de gisement poison n'existe pas
  encore — annoncé).

### Leçon de la fournée : les spreads périmés

Le rebase de coque lit la position/statut/liens de l'OBJET passé — six
call sites passaient des spreads {...ship} SANS les champs qu'ils
venaient de modifier en SQL (hover_body_id au relocate/undock/éviction/
échec de colonisation, harvesting_star_id au release, rien au
re-quai du retrieved). Sans conséquence pour fuel/survie (leurs entrées
ne dépendaient pas de ces champs), mais l'usure UTILISE le monde sous la
coque : tous corrigés, spreads EXACTS partout + rebase complet au
ship_retrieved. Même famille que la régression AE (ligne partielle) —
le piggyback exige un objet fidèle.

### Vérifications

- Shared 137/137 (wear.test.ts : cumul, climats, coûts, plancher).
- Intégration wear.test.ts **9/9** : L1 refusé/L2 payé, §10, tempéré 0,
  chaud −4 sans / 0 avec bouclier, flare −4 puis rallumée 0, trou noir
  −4 puis radio 0, cumul flare+rig −24 avec récolte active, plancher 1.
- E2E shields.spec.ts : flare → vol 3 pc → jauge et ligne −4.0 HP/day →
  retour, workshop L2 réel (level up), bouclier radiatif payé → re-vol →
  péage éteint ; captures sh-01/02.
- Suites complètes après synchro : shared 137, unit 32, intégration
  **236/236**, **E2E 29/29 (11,6 min)**.

## 2026-07-19 — Chunk AH : réparation d'atelier (DG §8.7)

**Problème.** L'usure (chunk AG) était irréversible — l'effet
« repair 5%/h ×1/2/4 » du workshop, écrit au catalogue depuis le début,
n'avait pas de mécanique.

### Canon appliqué

- À quai de SON monde à workshop ACTIF : +5 % des HP max/heure ×
  mult(1/2/4) — le MEILLEUR atelier sert [TUNE-v1, un seul chantier par
  coque]. « Costs steel proportional to HP restored » : 0,1 T de steelL
  par HP [TUNE-v1], facturé au stock planétaire en CONTINU (motif
  hoverFuelNeeds : consumeFamily après la survie de la population,
  tout-ou-rien famille, flip servi/non-servi au recompute — acier à sec
  ⇒ arrêt propre).
- Bord hull_repaired au plein : l'acier cesse (le filtre hp < max du
  snapshot ET le rebase du handler se recoupent — pas de facturation
  fantôme).
- Usure et réparation se COMPENSENT : monde chaud possédé avec atelier
  L1 sans bouclier = net +92 HP/j.
- Mondes d'autrui : AUCUN service (la politique whom-to-serve du canon
  est P4) — refus structurel, pas de configuration.

### Vérifications

- Shared 139/139 (repairHpPerDay L1/L2/L3, acier 0,1 T/HP).
- Intégration repair.test.ts **6/6** : +96/−9,6 T/j L1, ×2 en L2, acier
  à sec → 0 puis reprise, plein → hull_repaired coupe tout, monde
  d'autrui → 0, net hostile 92.
- E2E repair.spec.ts : jauge 40/80 + ligne verte « +96.0 HP/day », HP
  qui REMONTENT en temps réel (poll API), acier facturé (−9,6 T/j au
  détail planète) ; capture rp-01 observée.
- Suites complètes après synchro : shared 139, unit 32, intégration
  **242/242**, **E2E 30/30 (12,4 min)**.

## 2026-07-19 — Chunk AI : champs de junk (GB §22, DG §10.4)

**Problème.** Lignes 105–106 : le junk n'existait pas — ni comme arme de
déni de zone, ni comme matière de récupération ; les trous noirs
n'avaient pas leur rôle canon de puits, et les épaves de supernova
disparaissaient sans trace (annoncé au chunk AF).

### Canon appliqué

- CELLULE de 0,5 pc, un champ max, fusion des apports, décroissance
  EXPONENTIELLE 10 %/j (0,9^jours évalué à la lecture — pas de taux
  linéaire, pas de bord : le champ se dissipe seul).
- Largage : 5/jour RÉEL/coque [TUNE], interdit à < 50 pc de TOUT starter
  (anti-grief), trou noir ≤ 5 pc = puits sans conséquence.
- Dégâts de présence 15 HP/j par 30 T [TUNE-v1 interp du « hazard 15 HP
  per 30 T » — appliqué en taux à qui S'ATTARDE ; la traversée de
  transit attend l'interception P5, annoncé] — aucun bouclier n'atténue.
- Épaves de supernova → junk : carcasse 10/20/40 T par taille [TUNE-v1]
  + fret répandu, fusionnés dans la cellule de la position interpolée.
- Collecte : junk collector (atelier L2, 15 steelL + 5 silicon), UN
  scoop de 30 T par 24 h-jeu [TUNE-v1 — discrétisation annoncée du
  « 30 T/day »], borné par les conteneurs libres.
- Le junk est une RESSOURCE : nouveau tier « salvage » (31e entrée du
  catalogue — les 30 fongibles canon restent intacts), destinée au
  recycleur (recette P4).

### Leçon de la fournée : les colonnes date et la TZ

Le quota journalier stockait le jour dans une colonne `date` ; node-pg
la relit en Date à minuit LOCAL → toISOString() dérive d'un jour selon
la TZ du process (Paris été : J−1) → le compteur se réinitialisait à
CHAQUE largage. Correctif : jour UTC en TEXTE. Verrouillé par le test de
quota.

### Vérifications

- Shared 143/143 (junk.test.ts : cellule, décroissance, hasard, quotas).
- Intégration junk.test.ts **12/12** : zone starter refusée, naissance/
  fusion matérialisée (3×0,9+2=4,7), quota 5 puis refus, §10, puits du
  trou noir, usure de présence −tonnage×0,5, collector L2+coût, scoop
  min(30, champ, conteneurs)=3 + cooldown + soute pleine, épave de
  supernova 15 T (carcasse+fret), visibilité par poche.
- E2E junk.spec.ts : atelier L2 réel, collecteur, largage UI (champ
  2,0 T + hasard −1,0 HP/j + usure affichés), collecte (junk 2,0 T en
  soute, champ dissipé, usure éteinte, /galaxy propre).
- Complétude découverte PAR la suite : le tableau census n'itérait que
  4 tiers — la 31e ressource (salvage) n'était jamais rendue ; TIER_ORDER
  complété + le spec census polle désormais l'instantané du catalogue
  COURANT (l'ancien « latest » d'avant restart a 30 clés).
- Suites après synchro : shared 143, unit 32, intégration **254/254**,
  E2E **31 specs verts** (30/31 au run complet de 13,1 min — census
  réparé puis validé solo avec junk ; les 29 autres inchangés).

## 2026-07-19 — Chunk AJ : claim rig & salvage (GB §6, DG §8.8)

**Problème.** Depuis le chunk AB, les épaves du survival-out (owner
NULL, « no honor ») disparaissaient de toutes les flottes SANS être
réclamables — l'économie du salvage promise par le canon n'existait pas.

### Canon appliqué

- Claim rig : atelier L2, 25 steelL + 5 gold [TUNE].
- Réclamation : IMMOBILE (survol/idle) à ≤ 1 pc [TUNE-v1 — « proximity »
  non chiffrée par le canon ; même échelle que le transfert de
  carburant], 2 h de JEU [TUNE], une réclamation à la fois.
- salvage_claimed RE-VÉRIFIE tout à l'échéance : réclamant vivant,
  toujours lié, stationnaire, à portée ; épave toujours sans
  propriétaire — partir (moveShip purge), dériver, ou se faire doubler
  = abandon propre, jamais de transfert fantôme.
- Transfert : l'épave devient une coque IDLE possédée, SANS équipage —
  la re-crewer exige un quai ; le remorquage et le transfert d'équipage
  en proximité restent P4 (annoncé). La soute de l'épave voyage avec
  elle (le butin est physique).
- Radar « Wrecks » : épaves visibles sous les scopes de vision standard.

### Vérifications

- Shared 144/144 (constantes claim).
- Intégration claim.test.ts **6/6** : coût/§10/double-fit, gardes
  (à quai, cible possédée, trop loin), réclamation complète (2 h ÷
  timeScale, vue flotte claimsAt, double-claim refusé, transfert
  owner+idle), épave déjà réclamée refusée, départ annule (lien +
  événement purgés), dérive à l'échéance = pas de transfert.
- E2E claim.spec.ts : chaîne COMPLÈTE — Cargo S né au chantier, pilote
  granté (§15), survol sauvage, survival-out réel → épave au radar
  Wrecks → rig monté → vol à 0,5 pc → Claim → 2 h ÷ 7200 → l'épave
  rejoint la flotte (idle) et quitte le radar ; captures cl-01/02.
- Suites après synchro : shared 144, unit 32, intégration **260/260**,
  E2E **32 specs verts** (31/32 au run complet de 13,6 min — governance
  retombé sur son flake DOCUMENTÉ de tirage de taille starter, p=1/32
  sur 5 essais, vert en solo 26,5 s ; le filtre DNA-taille reste en
  SUGGESTIONS).

## 2026-07-19 — Chunk AK : stargates v1 (GB §6, DG §9.3–9.4)

**Problème.** Ligne 110 : le « chemin sûr » du réseau n'existait pas —
tout vol était du free-flight risqué. Les stargates sont le contrepoint
stratégique de toute la couche interception/piraterie à venir.

### Canon appliqué & v1 (annoncé)

- Chantier au stargate_yard ACTIF : 250 cells + 400 steelH + 100
  crystal_any (résolu par climat — patron payCost existant) [TUNE] ;
  48 h de jeu [TUNE-v1 — durée non chiffrée par le guide] ; 1 chantier
  concurrent par NIVEAU de yard ; paire unique (les deux sens).
- **v1 même propriétaire** : le partage 50/50 avec consentement des
  deux propriétaires (canon) exige un flux de consentement inter-joueurs
  — patron des offres manuelles, proposé en SUGGESTIONS. Refus
  explicite en attendant.
- Traversée INSTANTANÉE, zéro carburant : péage « hard gate » depuis la
  SOUTE des non-propriétaires (pas de ressource ⇒ pas de passage),
  encaissé au stock du monde d'ENTRÉE [interp] ; propriétaire exempt
  [interp] ; capacité 1 vaisseau/tick/direction [TUNE] ; le personnel ne
  traverse que vers SES mondes (GB §21) ; récolte/réclamation
  abandonnées au passage (on quitte la zone).
- Sortie DISPERSÉE : U(0–15) pc, hash seedé (shipId, tick d'arrivée) —
  déterministe (rejouable), imprévisible pour les campeurs (bat le
  rayon d'engagement ~4,5 pc). Testé borné ET déterministe.
- Le gate MEURT avec l'un ou l'autre endpoint : CASCADE pour les
  endpoints supprimés, purge explicite pour les mondes ANNIHILÉS
  (cendre) au handler de supernova. Aucune « sortie void » v1 : la
  traversée étant instantanée, aucun état en vol n'existe (annoncé —
  les exits void arrivent avec les endpoints mobiles).

### Vérifications

- Shared 147/147 (scatter borné + déterminisme, constantes).
- Intégration stargates.test.ts **9/9** : §10 (endpoint d'autrui, même
  monde, sans yard), coût payé climat-résolu, doublon AVANT saturation
  (ordre des gardes corrigé par le test), activation, traversée
  propriétaire sans péage + dispersion ≈ scatterPc, capacité par tick
  refusée puis servie, péage hard (impayable → refus ; payé → soute
  débitée + stock crédité), personnel d'autrui refusé, supernova →
  gate mort avec l'endpoint annihilé.
- E2E stargates.spec.ts : colonie n° 2 par l'API (le parcours UI de la
  colonisation est déjà prouvé par colonization.spec — décision de
  périmètre annoncée), puis LE SUJET en UI : yard T4 débloqué/posé au
  plateau, section Stargates (destination + Build gate + notice),
  activation ~24 s, bouton « Traverse gate → colonie », arrivée idle
  dispersée ≤ 15 pc ; captures sg-01/02.
- Trois leçons d'outillage E2E au passage : les titres de cartes rendent
  les underscores en espaces (unlockCard/placeCard matchent désormais le
  libellé AFFICHÉ, clé API conservée pour hasBuilding) ; une coque à sec
  s'échoue dans le vide de sortie (avitailler avant de traverser) ; le
  kit colonie mange la trésorerie du gate (re-grant).
- Suites après synchro : shared 147, unit 32, intégration **269/269**,
  E2E **33/33 (15,4 min au run complet)** — un premier run avait été
  interrompu par la contention à 2 workers (2 timeouts + 6 non lancés),
  le run complet suivant est intégralement vert.

## 2026-07-19 — Chunk AL : consentement 50/50 des stargates (GB §6, DG §9.3)

**Problème.** Le chunk AK avait livré les gates MÊME propriétaire ; le
canon exige aussi la voie inter-joueurs : « the price is split between
the two owners — both consent ». Sans elle, le réseau ne peut pas
franchir les frontières politiques.

### Canon appliqué

- Proposition ÉPINGLÉE (patron des offres manuelles) : depuis un monde
  du proposeur à yard ACTIF vers le monde d'AUTRUI ; rien n'est débité
  à la proposition ; TTL 48 h réelles [TUNE-v1], balayage paresseux ;
  une seule proposition ouverte par paire ; §10 sur chaque verbe.
- Réponse : le propriétaire CIBLE uniquement. ACCEPTER re-vérifie tout
  (yard toujours actif, monde du proposeur non retourné, doublon,
  concurrence du yard) puis paie LES DEUX moitiés — 125 cells +
  200 steelH + 50 crystal_any chacun, chacune sur SON monde, cristal
  résolu par SON climat — atomiquement : trésorerie courte d'un côté =
  refus, rien n'est débité nulle part.
- Le gate créé porte owner = proposeur (écriture du péage) mais les
  DEUX propriétaires d'endpoints sont EXEMPTS de péage (co-payeurs
  [interp] — sinon l'accepteur paierait pour traverser son propre
  investissement).

### Vérifications

- Shared 147/147 (moitiés exactes du SPLIT).
- Intégration stargate-consent.test.ts **7/7** : §10 (départ d'autrui,
  vers soi → « construisez directement », sans yard, sauvage), doublon,
  proposeur ne répond pas, trésorerie courte = refus sans débit,
  acceptation = les 4 moitiés exactes débitées + chantier owner=Alice,
  activation + traversée SANS péage du co-payeur (soute vide), déclin,
  annulation (§10).
- E2E stargate-consent.spec.ts (2 comptes séquentiels, patron
  manual.spec) : Alice pose le yard au plateau, VOIT le monde de Bob
  (coque relocalisée §15), propose depuis la section Stargates ; Bob se
  connecte, accepte dans l'inbox « Gate proposals » de SON monde (ses
  moitiés partent : 75 cells/100 steelH restants), le gate s'active et
  Bob traverse SANS péage ; captures gc-01…03.
- Complétude collatérale découverte par le test : les coques ÉCHOUÉES
  n'avaient pas d'yeux (absentes des statuts de vision) — une coque à
  sec en survol étranger rendait le monde invisible. `stranded` ajouté
  aux quatre requêtes de scope (bodies/junk/derelicts/gates + présence
  intel).
- Suites après synchro : shared 147, unit 32, intégration **276/276**,
  E2E **34/34 (16,0 min)**.

## 2026-07-19 — Chunk AM : auto-trade du survol étranger (GB §7, DG §3.5)

**Problème.** Dernière mécanique de survol restante (ligne 103) : le
canon donne aux coques en orbite étrangère le droit de se ravitailler
TOUTES SEULES au marché local — sans elle, tout séjour prolongé chez
autrui est une horloge de mort sans recours.

### Canon appliqué & interprétations (annoncées)

- Règles par coque (max 3 [TUNE-v1]) : {ressource, seuil, quantité}.
  Destination par ressource : carburant du type embarqué → TANK,
  familles food/water → PROVISIONS (1:1 [TUNE-v1]), sinon SOUTE.
- « Best effort » : PREMIER slot fixe actif dont le monde VEND (give)
  la ressource ; la coque paie la contrepartie (get) depuis sa SOUTE ;
  encaissement au stock du monde ; caps physiques (tank, capacité de
  survie, conteneurs) ; journal des trades (slot −3). Les slots AMM
  restent hors périmètre v1 (annoncé).
- Borne de prix ≤ 3 T par tonne reçue [TUNE-v1 interp : le canon borne à
  « 3× la médiane census » mais le census ne publie pas de prix — la
  re-borne arrive avec le pricing des pods, listée au backlog].
- Déclenchement PARESSEUX (patron stock_edge appliqué à la coque) :
  auto_trade_check posé au whenReaches du seuil le plus proche, check
  immédiat si déjà dessous, armé aux vraies entrées en survol (arrivée
  de transit, undock, relocate §15) et à chaque exécution.

### Leçons de la fournée

- La fixture s'échouait AVANT le check (réservoir vide → ship_fuel_out
  → stranded → garde hovering) : sondes de debug aux points de skip,
  cause trouvée en deux itérations — avitailler d'abord.
- `step=0.1` sur un input number BLOQUE silencieusement la soumission
  d'un 0.05 (validation HTML) : `step="any"` sur les champs de règle.

### Vérifications

- Shared 151/151 (destinations, validation, borne).
- Intégration auto-trade.test.ts **6/6** : §10 + 4 règles refusées,
  rachat complet (provisions 0,02→0,12, soute −0,1, stock du monde ±,
  journal), borne 3:1 (aucun achat), soute vide (skip), monde possédé
  (no-op), planification au whenReaches (échéance future posée).
- E2E auto-trade.spec.ts (22,8 s, 2 comptes) : épicerie de Bob par
  l'API (le parcours UI marché est couvert par market.spec), règle
  configurée DANS l'UI d'Alice, survol étranger → rachat AUTOMATIQUE
  par le worker (0,12 food / soute 2,9) ; captures at-01/02 observées.

## 2026-07-19 — Chunk AN : anti-softlock du démarrage (GB §19, playtest responsable)

**Problème (signalé par le responsable en jouant).** « Je construis à
peine un télescope, je tombe à sec, et plus aucun moyen de poser une
mine » + « je ne comprends pas le colony program ». Diagnostic chiffré :
dotation ore 60–78 ; télescope 30 ore + 15 si (unlock + pose), dépôt
20 ore, mine 22,5 ore ; l'unlock (savoir) n'est JAMAIS remboursé et la
démolition ne rend que 50 % de la POSE ; tout revenu (trace comprise)
exige une mine POSÉE. L'ouverture « télescope + dépôt d'abord » laissait
10–28 ore < 22,5 : softlock définitif, contraire à la garantie GB §19.

### Décision (responsable, 3 leviers cumulés)

1. **Savoir de départ (canon amendé GB §19)** : le starter naît avec les
   T0 jamais-masqués DÉBLOQUÉS (telescope, probe_pad, depot, mine) — la
   pose reste payante. `STARTER_PRE_UNLOCKED` (shared), insertion
   `tech_unlocks` au spawn. colony_program reste payant.
2. **Dotation relevée [TUNE]** : `{ore 100, carbon 44, silicon 28,
   hydrogen 24, oxygen 20, food 32, water 32}` (somme 280).
3. **Onboarding** : bandeau « First steps » (starter sans mine, testid
   first-steps-hint), description du programme colonial, tooltip
   d'effets sur chaque carte.

### Leçon de la fournée — le plafond du frein

Premier jet à somme 375 (`ore 120…`) : la suite d'intégration a flanché
PAR INTERMITTENCE (levelup, dérive du rattrapage 0,18 T). Cause : roll
max ×1.3 + 150 u fuel = 637 T > 0,7 × 800 T — le starter S naissait
DANS le frein de stockage selon le roll, et le test de dérive suppose à
bon droit des taux stables sans bord. Recalibré somme 280 (max 514 T,
u ≈ 0,64) et VERROUILLÉ par invariant unit (spawn-grant.test) :
dotation ≥ 1,5 × coût d'ouverture par ressource ET roll max + fuel ≤
frein − 40 T. DG §2.2 documente la contrainte de plafond.

### Balayage des tests existants

7 `unlockNode` de nœuds T0 retirés (starters — colony-loop ×4,
levelup ×2, ships ×1), 3 parcours game-flow passés en pose directe,
bornes spawn.test 100–130/≥32, helper E2E unlockCard déjà tolérant.
api.test : le flux d'unlock par l'API se prouve désormais sur workshop
(prérequis mine = savoir de départ) et farm, plus « waterworks » pour le
refus not_unlocked ; already_unlocked prouvé sur depot pré-acquis.

### Directives responsable enregistrées (même session, à venir)

- **Chunk AO** : main de cartes FILTRÉE (posables/unlockables seulement,
  le reste vit dans l'arbre techno) + éventail semi-replié, carte sortie
  au survol.
- **Télescope = bâtiment SUR TUILE** (changement de canon DG §5.1 ; sort
  du probe pad à trancher par le responsable) + stubs à créer.
- **Stats planète** : production NETTE par ressource/jour (+ et −).
- **Pods/Recruitment** : expliquer dans l'UI le refus « compte < 45 j »
  (le responsable ne trouvait pas ses cartes NPC — l'onglet existe mais
  refuse en silence un compte neuf).

### Vérifications

- Unit shared 153/153 (savoir de départ : T0/never-masked/apolitique/
  sans prérequis, mine incluse, colony_program exclu, 25 seeds d'ADN).
- Unit server 34/34 (invariants dotation : marge 1,5× + plafond frein).
- Intégration 283/283 (savoir de départ au spawn + already_unlocked en
  direct §10, bornes de stock, suites complètes rejouées).
- E2E : suite complète sur BASE FRAÎCHE (resetDb — leçon : le quota de
  pings 20/j est fenêtré 24 h RÉELLES, 3 runs sur la même base
  l'épuisent) : 35/35 puis game-flow 12/12 ; onboarding.spec (hint →
  pose mine SANS unlock → hint dissous → colony program expliqué),
  captures onb-01…03 OBSERVÉES (onb-03 re-cadrée : scroll de la section
  Programs — une assertion vraie ne suffit pas, la capture doit montrer
  la preuve §16). Durcissements honnêtes au passage : attente de
  l'ACTIVATION du chantier naval avant d'exiger la section quille
  (flake révélé par la base fraîche), « population » → « colonists »
  dans le bandeau (collision de localisateur getByText).


## 2026-07-19 — Décision responsable : pop de départ u₀ = 0,35 (chunk AP à venir)

**Constat (responsable, en jeu).** 0,6 × cap = 720+ assignables sur un
starter S-F pour ~500–600 postes optimaux (50/industrie L1) : on staffe
TOUT à l'optimum, aucun arbitrage de main-d'œuvre, jamais. Sur un
starter medium (cap 12 000+), la tension est impossible par
construction.

**Réponse à « comment évolue la population ? »** : DÉJÀ implémentée
(pop_daily) — logistique r = 0,05/j [TUNE] vers popCap, porte
H = min(vivres, eau) × (0,8 + 0,2 × médecine), maladie, surpeuplement
(E redescend au-delà de u = 0,7 ; les settlers de colonisation sont la
soupape). Restent les effets non-industriels (residential → cap) —
backlog ligne 84.

**Décision** : STARTER_POP_UTILIZATION 0,6 → **0,35** [TUNE] — S-F :
700 hab / 420 assignables ≈ 8 industries L1 → arbitrages réels ;
E_planet ≈ 0,6 au départ → 0,96 en ~13 j → pic ~18 j : arc de montée en
puissance porté par la croissance existante. Chunk AP dédié (après AN) :
re-balayage des tests qui supposent E_planet ≈ 0,95 + DG §2.2.

## 2026-07-19 — Brainstorm responsable : mécanique CENTRALE population/emploi/exode (v2)

**Décisions actées (2 tours de questions) — spec chiffrée à rédiger,
PUIS simulations d'équilibrage, PUIS code. Chunks AO/AP suspendus.**

- Croissance ∝ efficience moyenne de la planète × flux de vie (déficit
  local eau/vivres/oxygène freine ; abondance locale bonus ; VIVRE
  D'IMPORTS NE NOURRIT PAS LA CROISSANCE — mondes-comptoirs à
  démographie molle, volontaire).
- Cloche penchée CONSERVÉE entière par bâtiment (l'invariant « 35
  ouvriers = production fixe » du 1er tour est ABANDONNÉ) : l'optimum
  scale avec la population totale → à staff constant, u glisse à gauche
  et la production S'ÉRODE — négligence = érosion, pas stagnation.
  Effet « empire romain » assumé : trop d'expansion = fuites partout.
- E_planet(pop/cap) global : SUPPRIMÉ (lecture annoncée au responsable,
  sans objection à ce stade) — remplacé par optimums-par-pop +
  parabole maladie/mortalité au-delà du cap (dépassement AUTORISÉ).
- TOUS les bâtiments emploient (plus seulement les industries) ;
  niveaux = plus de postes ET meilleure productivité par ouvrier.
- Chômage : tolérance 7 % + période de grâce ; au-delà, mortalité par
  vagues frappant TOUTE la population (le staff décrémente
  proportionnellement → momentum de déclin vers l'extinction).
- Toute planète NEUVE naît en horloge de mort (« la vie du
  colonisateur ») — la grâce de colonisation (et starter) adoucit.
- Horloges de mort planétaires : eau 0 → tous morts en 3 j ;
  nourriture 0 → 10 j ; oxygène 0 → INSTANTANÉ (climats hostiles
  seulement — temperate = oxygène ambiant, différenciation climatique).
- Démographie 3 catégories : enfants —20 j→ actifs —60 j→ seniors
  (mortels, ~30 j [TUNE]) ; rations réduites enfants/seniors [TUNE] ;
  seuls les actifs sont employables ; pyramide affichée dans les stats.
- Natalité : residential L1 l'ÉTABLIT, L2/L3 la boostent (quasi
  obligatoire pour l'autosuffisance ; alternative = importer de la
  population via transporteurs civils — aucun marché de population
  mécanisé, la lore et le chat font le reste).
- Cliniques : NOUVEAU bâtiment (stubs à créer) — baisse la maladie ;
  surpopulation → maladie → morts.
- Embarquement de settlers PAR catégorie, sans garde-fou moral (jeu
  « no honor ») ; contrepartie : morts/exodés par catégorie visibles à
  l'intel télescope de bon niveau — la réputation émerge.
- Extinction : perte de propriété, bâtiments CONSERVÉS (bonus du
  recolonisateur, grâce applicable), gouverneurs morts (host-fate).
  À surveiller en simulation/P5 : siège → extinction → recolonisation
  = conquête lente sans pillage.
- Fréquence des ressources (question du responsable) : aucune — stock
  continu lazy à la seconde, UI 4 s, tick 60 s = événements seulement.

**Reste ouvert** : ancres d'équilibrage Q20 (moments cibles proposés :
postes saturés J+20 / exode rentable J+35 ; négligence 10 j réversible,
30 j fatale ; pyramide stable ≈ 18/55/27) — en attente du responsable.

## 2026-07-19 — Population v2 : ancres Q20 validées, SPEC RÉDIGÉE

Le responsable valide les 4 ancres proposées (saturation J+20 / exode
J+35 ; négligence 10 j réversible, 30 j fatale ; famines 10 j / 3 j /
oxygène instantané ; pyramide 18/55/27). Deux ancres ajoutées par
l'agent : (5) une colonie de 200 settlers qui construit normalement se
STABILISE ; (6) le chemin siège→extinction est mesuré, pas découvert.

**Spec écrite** : DESIGN_GUIDE §3.2-v2 (a–m) — démographie C/A/S
(20/60/30 j), rations 0,6× enfants/seniors, oxygène ambiant sur
temperate seulement, natalité 0 sans residential (0,020/0,030/0,040 par
actif/j [TUNE]), modulateur M_eff × M_life (imports ≠ croissance),
emploi universel (table baseJobs EXHAUSTIVE — 28 bâtiments + clinique),
popScale = clamp(√(P/2000), 0,5, 2) [TUNE], levelMult 1/2,4/5, formule
de production SANS E_planet, chômage tolérance 7 % + grâce 3 j [TUNE]
+ γ = 0,02 [TUNE] frappant tout le monde (staff décrémenté), parabole
au-delà du cap (1,2 o² maladie, 0,015 o² morts [TUNE]), clinique
−0,10/−0,20/−0,35, horloges 3/10/instant, settlers par catégorie +
compteurs morts/exodés à l'intel palier ≥ 3 [TUNE], extinction avec
bâtiments ET savoirs conservés, spawn ≈ 650 hab [TUNE] à la pyramide
stable (dimensionné pour τ ≤ 7 % à la fin de la grâce de 14 j). GB §10
réécrit en canon v2 ; §3.2 et E_planet de §3.4 marqués SUPERSEDED
(le code livré reste v1 jusqu'à l'implémentation).

Prochaine étape (séquence responsable) : campagnes simulées
d'équilibrage sur les 6 ancres — en attente du GO sur la spec.

## 2026-07-19 — Round 9 : la mécanique population v2 simulée — 6 ancres VERTES

Premier round d'équilibrage au **simulateur numérique**
(tools/balance/pop_v2_sim.py — la v2 est dynamique : vagues, momentum,
spirales ; l'arithmétique fermée des rounds 1–8 ne suffisait pas).
Cinq patchs majeurs (détail BALANCE_LOG Round 9, guide → v0.10) :
natalité ×6 (0,12/0,18/0,24 — sans boom, l'exode arrivait à J+500),
plancher popScale 0,5 → 1,0 (sinon saturation à J+3), starter 650 → 350
(naître SOUS la capacité d'emploi), horloges de mort LINÉAIRES à
échéance fixe (le P/3 naïf est exponentiel et ne finit jamais),
parabole de sur-cap 0,015 → 0,25 (sinon équilibre à 2,3 × cap).

Comportements démontrés sans patch : le piège du sur-staffing (épingler
τ à 7 % écrase Ē à 0,12, production ÷8 — la boucle rationnelle est
optimum + exports de cohortes ≥ 200), le monde sans exode se noie à
J+55, la négligence 30 j ne se rattrape que par amputation, le monde
sans residential s'éteint lentement (÷2 tous les 45 j), le siège d'un
comptoir (stocks 30 j) éteint à J+38 — signalé P5.

Verdict : saturation J+21,1 / exode J+39,1 / horloges exactes /
pyramide stationnaire 18,2/54,5/27,3 / colonie stabilisée / siège
mesuré. Les mondes en boom penchent jeunes (55 % d'enfants) — identité
« monde-pouponnière » assumée. **Prêt pour l'implémentation (v0.10).**

## 2026-07-19 — Chunk BA : population v2, le cœur démographique (guide v0.10)

**Découpage imposé par les dépendances** (découvert à la conception) :
la mortalité de chômage exige l'emploi universel + popScale (sinon tous
les mondes actuels — où seules les industries emploient — meurent), et
le starter 350 exige la suppression d'E_planet (sinon E(0,17) ≈ 0,32
écrase la production). BA livre donc la DÉMOGRAPHIE seule ; BB livrera
emploi + E_planet† + starter 350 + chômage d'un bloc.

### Livré (BA)

- Migration 022 : `pop_children`/`pop_seniors` (population = TOTAL,
  actives dérivés ; backfill pyramide stationnaire), `clock_deadlines`,
  `demo_counters`.
- shared/popv2.ts pur : époques, pyramide, rations pondérées, oxygène
  par climat, natalité par residential, M_growth, parabole de sur-cap,
  cliniques (crochet), horloges linéaires à échéance fixe, applyDeaths.
- pop_daily v2 : vieillissement → natalité (Ē staff-pondéré des
  industries, neutre 0,7 sans emploi ; ρ par famille = flux LOCAUX) →
  maladie/parabole → horloges (posent pop_clock, morts quotidiennes,
  levée au retour du stock) → oxygène instantané. pop_clock re-vérifie
  la famine à l'échéance (périmé = silencieux). L'oxygène instantané est
  AUSSI vérifié au stock_edge exact. wipePopulation : compteurs imputés,
  pyramide à zéro (la perte de propriété attend BD — annoncé).
- production.ts : têtes pondérées + besoin oxygène ; kit colonial +20 T
  d'oxygène (coloniser hot/cold sans bouteilles = suicide immédiat).
- Spawn : pyramide stationnaire ; colonie : settlers tous ACTIFS (choix
  par catégorie au chunk BD). planetDetail expose pyramid +
  clockDeadlines (UI au chunk BC).

### Vérifications

- Unit shared 167/167 (+14 popv2 : pyramide=point fixe du
  vieillissement, imports≠croissance, parabole, horloge intégrée qui
  tue TOUT LE MONDE, cliniques).
- Intégration 285/285 dont 3 nouveaux blocs v2 : natalité EXACTE au
  berceau (mêmes fonctions pures que le handler) vs vieillissement pur
  sans residential ; horloge eau (échéance +3 j posée, pop_clock,
  mort totale, compteurs) ; oxygène hostile instantané vs temperate
  ambiant. L'ancien test de croissance logistique v1 est REMPLACÉ.
- E2E : suite complète de non-régression (l'E2E propre à la démographie
  reste impossible à l'échelle réelle — 1 jour = 1 jour — précédent
  documenté ligne pop sim du backlog ; la preuve UI arrive avec la
  pyramide/alarmes du chunk BC).

## 2026-07-19 — Chunk BB : emploi universel, E_planet supprimé, le chômage tue

Le bloc indissociable identifié au chunk BA, livré d'une pièce :

- **Emploi universel** : table BASE_JOBS EXHAUSTIVE (29 bâtiments),
  jobsOptimal = base × [1/2,4/5] × popScale(P) avec
  popScale = clamp(√(P/2000), 1, 2) — le « point qui shifte ». Les
  industries produisent sur CET optimum (le 50/120/250 historique est
  préservé à popScale = 1) ; les autres bâtiments emploient pour
  l'économie démographique (postes, Ē, natalité) mais leur FONCTION
  reste binaire active/inactive [TUNE-v1 interp — le gating fonctionnel
  par staffing est un raffinement futur, annoncé].
- **E_planet SUPPRIMÉ** : planetMultiplier = G seul ;
  planetEfficiency (vues) = Ē staff-pondéré (neutre 0,7) ;
  workforceAssignable = les ACTIFS (l'ancien 60 % × pop est retiré,
  remplacé par la démographie réelle ≈ 55 %).
- **Starter 350** à la pyramide stationnaire (Round 9) ; les fixtures
  de test qui embarquaient 300 settlers « mûrissent » leurs mondes via
  /test/grant-population (§15 — la natalité réelle y arrive vers J+40).
- **Le chômage tue** : τ sur les actifs, tolérance 7 %, grâce 3 j
  consécutifs (colonne unemp_over_days, migration 023), INERTE pendant
  la grâce de colonie 14 j (starter compris) ; morts γ(τ−7 %)×P
  frappant toute la pyramide ET décrémentant le staff de chaque
  bâtiment (la vague ampute l'outil de production — momentum).
- Embarquement de settlers : prélève des ACTIFS, garde « les actifs
  restants couvrent la workforce assignée ».

Leçons : paramètre SQL dans une multiplication d'entier → cast ::float8
explicite (le floor(workforce × $2) inférait $2 en integer) ; les morts
séniles naturelles s'additionnent aux morts de chômage dans les bornes
de test (−10,9 − 20,4).

Vérifications : shared 171/171 (+4 : BASE_JOBS exhaustif vs catalogue,
popScale planchers, jobsOptimal dérivant, γ), intégration 286/286
(+ chômage v2 : grâce épuisée → −31,3 têtes, staff 50 → < 50, compteurs
actifs ; spawn 350 + pyramide ; colonisation sur fixtures mûries),
E2E complet en cours.

## 2026-07-20 — Chunk BC : clinique, ledger population et alarmes projetées

- **Clinique** : 29e bâtiment du catalogue, un exemplaire par monde,
  nœud T2 politics-free [TUNE-v1] dépendant du laboratoire, coûts explicites
  et emplois universels ; niveaux L1/L2/L3 réduisent l'indice de maladie de
  10/20/35 %. Les 27 variantes bâtiment et les trois cartes ont été générées
  par le pipeline canonique et observées. Le balayage exhaustif a aussi révélé
  puis ajouté les trois variantes `junk` que le manifeste omettait.
- **Projection autoritative unique** : `populationIndicators` alimente à la
  fois `pop_daily` et la vue serveur. Le ledger montre pyramide C/A/S, part
  consommatrice inactive, emploi/chômage, Ē staff-pondéré, maladie brute et
  effective, facteurs de natalité, flux nets signés et emplois/optimum/u/E de
  chaque bâtiment. Aucune courbe ni multiplicateur `E_planet` ne subsiste.
- **Alarmes** : chaque famille de survie expose stock-out, échéance de perte
  totale et état stable/à-sec ; l'oxygène hostile garde sa sémantique de mort
  instantanée. La capture E2E 1440×900 a été inspectée sans clipping, overlap
  ni texte illisible.
- **Durcissement DoD adjacent** : le worker compare désormais les gardes
  métier à l'échéance réclamée par l'événement, pas à l'horloge SQL de la
  transaction (race sub-milliseconde reproduite en intégration). Les fixtures
  E2E de taille de starter, ADN tech et sélection de coque sont déterministes ;
  le run complet utilise un worker, zéro retry.

Vérifications finales : typecheck ; shared 172/172 ; server unit 37/37 ;
client unit 11/11 ; intégration PostgreSQL 288/288 ; build production ; E2E
38/38 sur base recréée en 28,4 min. Capture dédiée :
`game/packages/e2e/captures/pop-bc-clinic-stats-alarms.jpeg`.

## 2026-07-20 — Intégrité documentaire : nom du canon et statuts Codex

- Le fichier canonique présent sur disque est `GAME_BOOK.md`. Tous les liens
  vivants qui visaient le chemin inexistant `GAMEBOOK.md` ont été corrigés
  dans les règles d'agent et les volumes de conception. Les mentions
  conceptuelles « GAMEBOOK §… » restent valides ; les anciens messages de
  commit sont immuables.
- Le Codex n'est plus « E2E à exécuter » : son scénario dédié a passé le
  balayage complet 38/38 sur base recréée pendant le DoD de BC. BACKLOG,
  CHANGELOG et MANUAL_PLAN reflètent désormais cette preuve.

## 2026-07-20 — Chunk BD : contrat figé avant implémentation

- L'embarquement devient explicitement C/A/S sans garde morale. Le total
  historique du vaisseau reste matérialisé mais doit égaler la somme des
  trois cohortes ; les données antérieures sont nécessairement migrées en
  actifs, seule cohorte qu'autorisait l'ancien flux. Si tous les actifs
  partent, le staff est réduit proportionnellement jusqu'à zéro.
- `[TUNE-v1 interp]` : les morts de trajet déjà calculées par l'accumulateur
  déterministe sont ventilées au plus fort reste sur le manifeste C/A/S,
  avec départage stable enfants → actifs → seniors. L'exode est compté sur
  le monde d'origine dès l'embarquement ; les morts de route y sont ajoutées
  à la résolution. Aucun débarquement ne réécrit cet historique cumulatif.
- L'extinction est une transition DB unique appelée par toutes les voies
  menant à zéro : propriété/account/starter/offres innées/horloges retirés,
  gouverneurs hôtes morts, population et emplois à zéro. Bâtiments, techs,
  stocks et gisements survivent. La production d'un monde sans propriétaire
  est forcée à zéro, ce qui ferme l'incohérence d'une industrie fantôme sur
  des données de staff héritées.
- Une recolonisation repart exactement du manifeste C/A/S, remet les
  compteurs démographiques à zéro et redonne la grâce. L'intel expose les
  morts/exodés normalisés seulement à partir du palier télescope 3. Le seed
  prouve les vraies pyramides des chemins register/landing, sans inventer
  d'historique.

## 2026-07-20 — Correctif de contrat BD : médicaments optionnels par âge

- Décision responsable : les médicaments ne partagent pas la ration C/S
  réduite de l'eau, de la nourriture et de l'oxygène. Burn validé
  `[TUNE-v1]` : actifs 1×, enfants 1,25×, seniors 1,5×, sur la base existante
  de 0,1 T/1 000 têtes pondérées/jour.
- La médecine n'est jamais une ressource de survie obligatoire : aucun
  stock-out ne tue et aucune horloge de mort n'est créée. Elle réduit la
  pression de maladie tant que le stock familial existe ; le bonus tombe au
  bord exact zéro si la production live ne couvre pas le besoin complet.
  Une couverture live intégrale reste une fourniture continue ; un flux
  partiel peut être brûlé mais n'accorde pas le bonus.
- Invariants physiques : aucun stock négatif ; `med_1 → med_3` en cascade ;
  la production au-delà du burn s'accumule et reste vendable. L'addendum
  analytique du BALANCE_LOG confirme que les six ancres Round 9 ne bougent
  pas, la médecine restant hors horloges et hors facteur de natalité.

## 2026-07-20 — Correctif majeur : cartes déverrouillées invisibles (bug probe)

- **Problème.** Le responsable signale que certaines cartes deviennent
  invisibles une fois déverrouillées, sans aucun moyen de les construire
  (`probe_pad` cité en exemple).
- **Cause.** Le filtre de la main introduit le 2026-07-19 (`CardHand`) ne
  conservait que `placeable` + `unlockable` et écartait tout `blocked`. Le
  statut `blocked` mélangeait deux natures : blocage PRÉ-unlock (hors-ADN,
  masque, prérequis manquant, unlock trop cher — légitimement délégué à
  l'arbre « Technology DNA ») et blocage POST-unlock (pas de tuile libre,
  `maxInstances` atteint, placement trop cher). Un bâtiment déjà déverrouillé
  mais momentanément non posable basculait en `blocked` et disparaissait de
  la SEULE surface de construction : l'arbre tech ne fait que déverrouiller.
  `probe_pad` illustre le cas — unlock `ore 15 + carbon 10` peut laisser le
  stock sous le coût de pose `ore 8 + carbon 5`, rendant la carte invisible
  juste après l'unlock.
- **Décision / correctif.** `CardState` gagne un booléen `unlocked` qui
  distingue les deux familles. Le filtre garde désormais `placeable`,
  `unlockable` ET tout `blocked` déverrouillé ; la carte reste visible,
  désaturée (`data-blocked`), sa raison AFFICHÉE (icône d'alerte + libellé,
  jamais un grisé muet). Le catalogue pré-unlock reste exclusivement dans
  l'arbre tech. La directive 2026-07-19 (« la main est filtrée ») est
  préservée dans son intention et corrigée : une carte déverrouillée n'est
  jamais masquée.
- **Vérifications.** Test unitaire `CardHand.test.tsx` (4 cas, échoue avant
  correctif via l'ancien filtre) ; typecheck + build client verts ; E2E
  `game-flow` « vue planète » mis au nouveau contrat (action OU raison
  visible sur chaque carte) ; scénario dédié au plafond `maxInstances` vert.
  La capture `cardreg-telescope-maxed-visible.jpeg` a été observée à 1440×900 :
  carte télescope toujours présente, état `blocked` et raison `max 3` lisibles.

## 2026-07-20 — Chunk BD livré et clôturé sur le DoD complet

- **Livraison.** Le manifeste C/A/S contraint, l'embarquement et le
  débarquement par catégorie, les morts de route au plus fort reste,
  l'extinction centralisée, la recolonisation exacte, l'historique intel
  palier 3 et le seed 64/191/95 sont tous actifs. Le dernier re-balayage a
  aussi verrouillé deux incohérences découvertes pendant la clôture : le
  ledger d'extinction est lu après rebase autoritatif et le libellé accessible
  du vaisseau annonce son vrai manifeste, pas un statut de fuite voisin.
- **Preuve PostgreSQL.** Après reset local et migrations 001→024 : intégration
  289/289. Les suites unitaires passent shared 176/176, server 38/38 et client
  15/15 ; typecheck monorepo et build production sont verts.
- **Preuve parcours.** Playwright complet 39/39 en 29,8 min, un worker
  déterministe, zéro retry. Le premier balayage avait isolé un unique délai
  implicite de 5 s sur l'écran de chargement onboarding ; l'attente explicite
  de la planète est désormais bornée à 30 s et le second balayage est propre.
  Les anciens workers orphelins des runs interrompus ont été arrêtés par leurs
  groupes précis avant cette preuve afin de garantir l'isolation du serveur.
- **Preuve visuelle.** `col-02-ark-ready.jpeg`,
  `col-06-extinct-recolonization-ready.jpeg`,
  `col-07-recolonized-windfall.jpeg`, `int-03-strategic.jpeg` et la capture de
  non-régression de main ont été inspectées à 1440×900 : aucun clipping,
  chevauchement bloquant ni texte illisible.

## 2026-07-20 — Médicaments optionnels par âge livrés

- **Simulation.** Le burn médical utilise désormais ses propres têtes
  pondérées : enfants 1,25×, actifs 1×, seniors 1,5×, sur la base
  0,1 T/1 000/j. Le rebase le sépare des rations de survie C/S×0,6 et le
  recalcule après chaque évolution de pyramide. Une réserve positive paie le
  plein besoin jusqu'au `stock_edge`; à zéro, un flux live intégral maintient
  la mitigation, un flux partiel est brûlé sans bonus. Le surplus du lab reste
  un stock fongible positif et vendable.
- **Santé et invariants.** Le prédicat partagé de couverture pilote
  `pop_daily`; aucun stock ne descend sous zéro et la médecine ne crée ni
  `clock_deadlines` ni événement `pop_clock`. L'ancien helper v1
  `habitability()` ne lui accorde plus de bonus de natalité. Les libellés
  runtime, tests, architecture et manuel distinguent désormais partout la
  médecine optionnelle des ressources de survie.
- **Preuve PostgreSQL.** Sur quatre mondes identiques, le stock et le lab à
  flux complet donnent la même pression de maladie réduite ; le monde vide et
  la petite réserve épuisée rejoignent la même pression non mitigée. Le lab
  conserve plus de 9 T/j de surplus et aucune horloge médicale n'existe.
  Intégration complète : 290/290 après reset et migrations 001→024.
- **Preuve finale.** Shared 178/178, server unit 42/42, client 15/15,
  typecheck monorepo et build production verts. Playwright complet 39/39 en
  32,2 min, un worker, zéro retry, puis Codex ciblé 1/1 sur une nouvelle base
  recréée. Les captures `codex-03-population-medicine.jpeg` (1440×900) et
  `codex-06-tablet-min.jpeg` (1280×800) ont été inspectées : chiffres live,
  texte final, aucun clipping, chevauchement ni texte illisible. Aucun
  changement de schéma n'était nécessaire.

## 2026-07-20 — Décisions responsable : télescope sur tuile, politique d'instances, refonte des sondes

Rafale de décisions (à persister AVANT code, CLAUDE.md §5). Statut :
[DÉCIDÉ] = ferme ; [PROPOSÉ] = attend confirmation du responsable.

### Télescope [DÉCIDÉ]
- Passe **sur tuile** (`usesTile: true` ; change le canon DG §5.1 « no
  tile ») et **max 1 par planète** (`maxInstances: 1`, était 3). Le scope
  monte désormais par NIVEAU d'un unique télescope, plus par instances.
- Stubs bâtiment PRÊTS (27 fichiers `building_telescope_l*` × variantes).

### Politique d'instances par bâtiment [VALIDÉ responsable 2026-07-20]
État ACTUEL du code : seuls **clinic (max 1)** et **telescope (max 3)** ont
un plafond ; tous les autres sont illimités, et la plupart EMPILENT leur
effet par instance (depot/warehouse/spaceport/market/industries).
Proposition (deux classes) :
- **MULTIPLE** (l'effet empile — plafonné par tuiles/gisements) : mine* &
  crystal_extractor* (*1/gisement), farm, waterworks, smelter, refinery,
  fuelcell_plant, depot, warehouse, spaceport, market, shipyard,
  military_district, weapon_foundry, probe_pad.
- **SINGLE** (2ᵉ instance redondante ou effet unique) : telescope, clinic,
  terraformer (une fois), residential (natalité = niveau max), workshop
  (réparation = meilleur atelier), lab, research_center, obs_station,
  diplomatic_district, commerce_district, casino, faction_hq,
  stargate_yard, artificial_planet_yard.
- **DÉBATTUS** (dépendent d'un choix P5/économie du responsable) :
  shipyard / military_district / weapon_foundry (multiple = production
  parallèle ?), residential (logement empilable ?).

### Sondes (refonte P3) [DÉCIDÉ]
- **Découpler build et lancement** : une sonde construite **HOVER autour de
  son monde d'origine** (statut hovering) au lieu d'être envoyée aussitôt.
  Aujourd'hui `launchProbe` fait build+move d'un coup — à scinder.
- **Aucune limite** du nombre de sondes construites/en hover par planète.
- **« Envoyer une sonde »** = envoie la **PREMIÈRE sonde disponible** en
  hover.
- **Vitesse** : très rapide — **≥ 3× la coque légère la plus rapide
  pleinement améliorée**. Fait : la plus rapide = `combat_s` 30 pc/j ×1,3
  (moteur L2) = 39 pc/j → sonde **≥ 117 pc/j** [TUNE] (actuel : 10 pc/j).
- Stubs sonde PRÉSENTS (`ship_probe.gif` + companions).

## 2026-07-20 — Contrat de clôture de la file suspendue après BD

Le responsable demande de reprendre puis terminer « AO card hand,
telescope-on-tile, net-stats/day, pods refusal ». Les critères manquants sont
figés avant code :

- **AO fold** : le filtre fonctionnel et la conservation des cartes
  déverrouillées sont acquis. Le fold final expose une tranche NOMMÉE de 64 px
  par carte non finale (cible ≥44 px), puis la carte entière au survol, au
  focus clavier ou lorsqu'elle est sélectionnée. Reduced-motion coupe
  l'animation, jamais l'accès au contenu.
- **Télescope** : applique la décision ferme ci-dessus (`usesTile: true`,
  `maxInstances: 1`). Les 27 stubs existants sont utilisés sur le plateau et
  le panneau bâtiment standard porte niveau/workforce/démolition. La migration
  choisit le plus petit index libre pour un unique télescope legacy et ABORT
  explicitement face à plusieurs instances ou à une planète pleine — aucune
  propriété supprimée ou tuile inventée. `probe_pad` reste sans tuile ; la
  politique globale d'instances et les sondes v2 restent hors de cette file.
- **Stats nettes/jour** : aucun nouveau calcul — BC est autoritatif et déjà
  complet ; cette clôture rejoue ses tests et sa preuve visuelle signée +/−.
- **Pods** : la raison après clic ne suffit pas. Le GET authentifié du barème
  projette l'éligibilité du joueur, le seuil et la date de déverrouillage ; le
  panneau montre ce verrou AVANT interaction et désactive l'ouverture. Le POST
  verrouille/revérifie toujours le joueur à l'instant de la commande.

## 2026-07-20 — Directives responsable : halo télescope, cercles d'autonomie, sprites de stock, GO file en attente

Persisté AVANT code (CLAUDE.md §5). Le télescope-sur-tuile + politique
d'instances sont EN COURS D'IMPLÉMENTATION PAR LE RESPONSABLE lui-même
(migration 025 + buildings.ts dans son arbre) — l'agent n'y touche pas.

### Halo de portée télescope à la sélection (carte galaxie) [DÉCIDÉ]
- En sélectionnant une planète QUI A un télescope : halo « subtil mais
  visible » de la portée + animation de scanner ROTATIF.
- Seulement pour la planète actuellement sélectionnée, seulement si elle
  a un télescope. PUREMENT COSMÉTIQUE : le brouillard réel reste l'union
  de tous les télescopes accessibles (aucun changement fonctionnel).
- Rayon dessiné = ciel de CE monde : BASE_SKY_PC (60) + 200 × niveau du
  télescope (source : world.ts ; lecture client via planetDetail du
  monde possédé sélectionné).

### Cercles d'autonomie à la sélection d'un vaisseau (carte) [DÉCIDÉ]
- Cercle « lignes tratteggiate » (POINTILLÉS) ROUGE : distance maximale
  avant panne sèche, avec tolérance 5 % → rayon = 0,95 × autonomie.
- Cercle pointillé VERT : distance maximale aller-RETOUR → rayon =
  0,45 × autonomie (95 %/2, même tolérance).
- Autonomie = fuel embarqué / burnUPerPc de la coque (le poids/loadFrac
  reste hors périmètre v1 — déjà annoncé au backlog vol libre).

### Sprites de ressources : DEUX emplacements, DEUX tailles [DÉCIDÉ]
- Ledger stats : LIVRÉ (commit 1630d61, 18 px).
- Panneau de stock du HUD (PlanetView) : à câbler avec une taille PLUS
  PETITE adaptée à la densité de cet écran. PlanetView est dans l'arbre
  du responsable → implémentation à la détente de l'arbre (annoncé).

### GO d'implémentation parallèle (avec spec-first) [DÉCIDÉ]
Le responsable autorise l'agent à implémenter la file en attente pendant
qu'il travaille en parallèle, staging chirurgical obligatoire. Périmètre
agent (recadré pour éviter ses chantiers) :
1. Halo télescope + cercles d'autonomie (GalaxyMap/scenes.css propres).
2. Refonte sondes : build → HOVER au monde d'origine → « envoyer » =
   première sonde disponible ; aucune limite de flotte de sondes ;
   vitesse 120 pc/j déjà commitée (e31151d).
3. Codex : descriptions par TYPE de bâtiment (single/multiple + rôle),
   affichées contextuellement dès que le type est DISPONIBLE sur la
   planète ouverte (fichiers codex/ propres).
HORS périmètre agent (chantiers du responsable) : télescope-sur-tuile,
caps d'instances dans buildings.ts, panneau de stock HUD.

## 2026-07-20 — Spawn randomisé : pocket luck & frontière latente (directive responsable)

- **Directive.** Le spawn doit être légèrement randomisé : toujours 1 étoile ;
  1 planète starter (1 % → 2, 0,1 % → 3) ; 2 planètes inhabitées proches
  (1 % → 3, 0,1 % → 4). Chaque inscription sème AUSSI quelques planètes
  inhabitées très lointaines, hors de portée du nouveau joueur ET hors de la
  visibilité de tout joueur existant — l'univers se peuple lentement dans les
  contreforts au fil des inscriptions. Ces mondes « bonus » sont très riches
  (stats, qualité, ADN tech), peuvent porter des bâtiments abandonnés (plus
  loin du centre = plus nombreux, plus hauts niveaux, plus de stocks
  résiduels) : la récompense latente des explorateurs tardifs. Si un monde
  bonus ne peut pas être placé hors de toute visibilité → il n'est PAS créé
  (l'encombrement auto-étrangle le flux ; attendu).
- **Clarifications responsable (2 questions posées).** (a) Chaque starter
  supplémentaire naît **colonisée + dotation complète** (pop 350 pyramide
  stable, grant ×U(1.0–1.3) propre, savoir T0, account-bound 45 j,
  is_starter ; vaisseaux/pilote uniques sur la primaire). (b) Mondes bonus :
  **25 % [TUNE] de chance d'étoile propre** (stock ×(1+2ρ), géométrie de
  poche) ; les autres restent des déserts à carburant, richesse payée en
  logistique.
- **Décisions de mécanique** (spec chiffrée : DG §2.2b ; canon : GB §19).
  Seuils littéraux (u<0,001 → +2 ; u<0,011 → +1) ; deux tirages indépendants
  starters puis wilds (ordre de flux figé). Bonus : N = 1–3 [TUNE] candidats,
  distance U(800–4000) pc du centre de poche — plancher 800 > 660 pc (scope
  máx starter L3), donc invisible même à un futur télescope L3 du starter ;
  invariant d'invisibilité DUR contre la visibilité COURANTE de tous les
  joueurs (corps 60+200×niveau télescope actif, sondes 60, vaisseaux hors
  transit 20), K=8 tentatives puis skip silencieux. Richesse
  ρ_eff = 0,25 + 0,75·clamp((d_centre−20k)/80k, 0, 1) — plancher : tout bonus
  est au moins riche ; gradient spatial depuis le centre de l'univers
  (500k, 500k), progression temporelle émergente via la marche du cluster.
  Qualité/taille mélangées vers un profil riche, tuiles moitié haute,
  gisements ×(1+2ρ_eff). ADN enrichi via un flux séparé `tech-dna-bonus`
  (les mondes standards restent identiques octet pour octet) ; clés des
  bâtiments abandonnés forcées dans la disponibilité. Bâtiments abandonnés :
  prédicat de catalogue (usesTile, apolitique à tous niveaux, non-industrie),
  jamais une liste en dur (règle de complétude) ; tuiles ≥ 2 (0/1 réservées
  au kit de colonisation §12.3, inserts ON CONFLICT-safe) ; inertes sans
  propriétaire (règle extinction), hérités à la colonisation.
- **Conséquences.** La table bodies accueille des corps riches non possédés
  invisibles de tous ; /galaxy inchangé par construction (visibleBodies filtre
  déjà par scope) ; aucun changement de schéma requis (ρ_eff dérivée de x/y
  stockés ; DNA dérivée de seed + ρ_eff côté serveur).
- **Vérifications prévues.** Unit : seuils de luck, déterminisme et
  monotonicité ρ_eff, stabilité octet du DNA standard, prédicat bâtiments.
  Intégration : spawn multi-starter (seeds chanceux trouvés par balayage
  déterministe), invariant d'invisibilité vérifié par requête directe,
  saturation → skip. E2E : inscription → mondes bonus ABSENTS de /galaxy,
  existence prouvée en base.

## 2026-07-20 — Décision responsable : les sondes carburent (fin du scout infini)

Persisté AVANT code (§5). SUPERSÈDE partiellement la refonte V2 : les
sondes ne sont PLUS exemptes de consommation.

- **Carburant comme tout vaisseau** : la sonde n'est pas un cheat
  d'exploration infinie.
- **Autonomie cible** : une sonde PLEINEMENT AMÉLIORÉE, réservoir plein,
  atteint AU MOINS l'aller-retour de la vue du plus puissant télescope,
  marge 5 % — soit ≥ 1,05 × 2 × (60 + 200×3 = 660) = **≥ 1 386 pc**
  [TUNE : dimensionner tank × burn en conséquence].
- **Télescope de bord** : une sonde pleinement améliorée porte
  l'équivalent d'un télescope L1 — où qu'elle soit, vue équivalente
  (ciel L1 = 60 + 200 = 260 pc autour de la sonde).
- **Survol** : les sondes SURVOLENT en consommant — extrêmement
  efficientes, ≥ 3× mieux que la coque la plus sobre (S 0,2 u/j →
  sonde ≤ 0,067, proposé 0,06 u/j [TUNE]) ; à sec, la sonde EST PERDUE
  (« gone » — pas d'échouage récupérable, contrairement aux coques).
- **[TUNE-GAP à trancher responsable]** : l'échelle d'amélioration des
  sondes (« fully upgraded » implique des niveaux/upgrades de sonde —
  où s'améliorent-elles, à quel coût, valeurs de base vs améliorées
  pour tank/vue ?). L'implémentation attend ces réponses OU une v1
  annoncée « toutes les sondes naissent au niveau max ».

## 2026-07-20 — Décision responsable : DEUX niveaux de sonde

Complète la spec « sondes v3 carburant » (le TUNE-GAP upgrade est
tranché). Persisté avant code (§5).

- **Sonde L1** : l'éclaireuse de base — vue à l'arrivée inchangée
  (60 pc), consommation de survol de référence.
- **Sonde L2** : embarque un TÉLESCOPE de bord (vue équivalente à un
  télescope L1 = 260 pc autour d'elle, où qu'elle soit) et consomme
  MOITIÉ au survol (usage espionnage — loiter longue durée).
- **Identiques pour le reste** : même vitesse (120 pc/j), même portée,
  même consommation en trajet.
- Chiffres proposés [TUNE] : réservoir 70 u × burn 0,05 u/pc → portée
  1 400 pc (≥ 1 386 exigés) ; survol L1 0,06 u/j (≥ 3× plus sobre que
  la coque la plus efficiente 0,2), L2 0,03 u/j ; à sec = sonde PERDUE.
- Interprétations annoncées [TUNE-v1 interp] : (a) le NIVEAU du
  probe_pad gate le niveau de sonde constructible (pad L1 → sonde L1,
  pad L2+ → sonde L2, surcoût L2 façon télescope) ; (b) carburant du
  type de l'étoile locale, plein au build depuis le stock (règle des
  coques). Le responsable peut invalider ces deux points sans casser le
  reste. Implémentation : chunk dédié ; la VUE de bord L2 touche
  world.ts (chantier responsable en vol) — séquencée à sa détente.

## 2026-07-20 — Décisions responsable : 25 % au build, refuel stellaire des sondes, sondes destructibles

Persisté avant code (§5). Complète la spec sondes v3.

- **TOUT véhicule naît avec 25 % de plein** (coques ET sondes — change
  la naissance « réservoirs vides » du chunk M et le plein-au-build
  proposé pour les sondes). Pour un plein : puiser au stock de la
  planète où le véhicule est À QUAI ou EN ORBITE — règles de refuel
  EXISTANTES (POST /ships/:id/refuel, monde possédé). [interp annoncée :
  l'auto-chargement plein au DÉPART depuis son monde (chunk O) demeure —
  le 25 % concerne la naissance.]
- **Refuel stellaire des sondes** : une sonde peut se remplir DIRECTEMENT
  auprès d'une étoile — mais sa COQUE est endommagée à chaque refuel de
  ce type. Chiffres proposés [TUNE] : portée du scoop ≤ 8 pc (aligné
  harvest d_max), plein complet, dégâts 10 HP par refuel stellaire.
- **Les sondes ont des points de coque** et peuvent être ATTAQUÉES et
  DÉTRUITES (hooks combat P5). MaxHP sonde proposé [TUNE] : 50 HP
  (fragile — ~4-5 refuels stellaires avant perte). À 0 HP = détruite
  (cohérent avec « à sec = perdue »).

## 2026-07-21 — Balance Round 10 : spawn §2.2b (pocket luck & frontière latente)

- **Méthode.** Simulateur Monte-Carlo `tools/balance/spawn_v2_sim.py` (univers
  rempli joueur par joueur, règles de spawn exactes) + 3 campagnes archétypes
  (Voyager, Breaker, Latecomer). Anchor A (fréquences de luck) vert.
- **Finding critique (F1).** Le gradient de richesse était mort-né : `ρ_eff`
  ancré sur la distance au CENTRE de l'univers (saturation 100k pc), or le
  cluster peuplé est une marche aléatoire √N (`max d_center ≈ 13 600 +
  117.6·√N`) qui n'atteint que ~31k pc à 40 000 joueurs → 0,000 % de mondes
  riches. La récompense promise ne se déclenchait jamais.
- **Décision responsable 2026-07-21 (4 questions).** (1) Ré-ancrer sur le
  CENTROÏDE vivant des mondes possédés : `ρ_eff = 0.40 + 0.60·clamp(dist/22000)`,
  plancher relevé 0,25→0,40, repli distance-poche si `n_owned < 50`. Origine
  DANS la population → variance spatiale réelle + mont ée temporelle émergente
  (⅔R ∝ √N). Sim : ρ 0.53→0.77 selon la cohorte, 97,5 % riches. (2) Chance
  d'étoile liée à la richesse `P = 0.25 + 0.5·ρ` (relais de ravitaillement pour
  les mondes lointains). (3) 4 correctifs de sécurité : retirer stargate_yard
  /tier≥3 du pool de ruines (défaut de prédicat), démolition rembourse seulement
  l'investi payé (`config.investedPaid`), verrou `pg_advisory_xact_lock` au
  spawn, LUCK_PEPPER (tirage de luck derrière un secret rotatif). (4) Tout
  appliquer maintenant + re-sim + persister.
- **Conséquences.** DG §2.2b réécrit (v0.11), BALANCE_LOG Round 10 détaillé,
  moniteur 10-M1 (blanchiment du bind 45 j via extinction — à câbler avant que
  le trade/conquête arrivent). Toutes les valeurs restent [TUNE].
- **Vérifications prévues (code).** Unit : formule centroïde bornée/monotone,
  pool de ruines tier≤2, `P_star`, HMAC luck déterministe sous pepper injecté,
  refund = investi payé. Intégration : centroïde servi au spawn, ruines sans
  stargate_yard, refund d'une ruine héritée = 0, luck reproductible via pepper
  de test, verrou de concurrence. E2E inchangé (frontière latente déjà verte).

## 2026-07-21 — Brainstorm responsable : sondes L3 tankers, réservoir multi-carburant, moteurs typés à l'usinage

Proposition du responsable (questions/avis demandés — décisions à
figer après le tour de Q/R ; persisté immédiatement, §5) :

- **Sonde L3 (NOUVEAU niveau)** : peut ANCRER un vaisseau et lui
  TRANSFÉRER du carburant (« à condition que ce soit le ciel
  compatible » — à préciser : compatibilité de TYPE moteur, ou
  co-localisation ?). Rôle stratégique : EXPANSION et SAUVETAGE.
- **Réservoir de sonde multi-carburant** : peut contenir N'IMPORTE quel
  fuel, stocks SÉPARÉS par type ; la sonde les consomme pour son propre
  fonctionnement L'UN APRÈS L'AUTRE dans un ORDRE SPÉCIFIÉ sonde par
  sonde.
- **Moteurs typés** : les autres vaisseaux ont un moteur spécifique et
  ne peuvent utiliser QUE le fuel adapté — CHOISI À L'USINAGE
  (chantier naval). [Impact : le typage par étoile natale du 25 %-au-
  build devient le DÉFAUT proposé au chantier.]
- Synergie remarquée (agent) : scoop stellaire + multi-tank + transfert
  = boucle de sauvetage/logistique bornée par la coque (10 HP/scoop,
  4 scoops par vie de sonde) — coût réel des missions de secours.

## 2026-07-21 — Sondes L3 & carburant : spec FIGÉE (réponses du responsable)

Tour de Q/R clos. Décisions FERMES :

- « Ciel compatible » = **FUEL compatible** (correcteur d'orthographe) :
  le transfert exige le type correspondant au moteur du receveur.
- **TOUTES les sondes sont multi-carburant** (stocks séparés par type,
  ordre de consommation configuré SONDE PAR SONDE) ; **seules les L3
  transfèrent**. **Sonde→sonde INTERDIT** (sinon OP — chaînes de relais
  exclues par conception).
- **Ancrage L3** : la sonde ancre un vaisseau et le remplit pendant que
  LES DEUX restent À L'ARRÊT, en OPENSPACE (ni landed ni hovering).
  Procédé **relativement lent** [TUNE — proposé 20 u/h de jeu] :
  l'immobilisation est un axe stratégique à peser, sans être pénible.
  Pendant le transfert, les deux sont des CIBLES VALIDES et ne peuvent
  pas se défendre (attaque 0 — hook combat P5). Montant AU CHOIX.
- **Moteur figé au build** : migration impossible. Le chantier naval
  peut usiner N'IMPORTE quel moteur via un simple RETOOLING de l'usine
  (le chantier gagne une ligne moteur re-toolable, patron industrie —
  24 h [TUNE], type de l'étoile natale = défaut).
- **L3 = L2 pour le reste** (télescope de bord, survol moitié, même
  tank 70 u / vitesse / portée) + la capacité d'ancrage/transfert.
  Gating naturel : pad L3 [interp], surcoût [TUNE].

## 2026-07-21 — Brainstorm responsable : ancrages multiples, refonte ACCESSOIRES, le Crusader-amiral

À VALIDER D'UN COUP après discussion (demande responsable). Proposé :

### Ancrages multiples (tranche les options a/b du tanker)
- Tank L3 70 u ASSUMÉ (option a). PLUSIEURS sondes peuvent ancrer le
  même vaisseau et remplir plus vite — MAIS multi-ancrage conditionné :
  le receveur doit porter le « système de ravitaillement avancé »
  (un ACCESSOIRE à fabriquer/installer). 1 sonde = de base [à confirmer].

### Refonte du pipeline ACCESSOIRES (ne plus les « définir dans le vaisseau »)
1. DÉCOUVRIR : arbre ADN des accessoires (à prévoir, façon tech tree).
2. FABRIQUER : non-fongible, usiné, occupe la place d'ITEM en ENTREPÔT
   (réveille les balances d'items 50/niveau, dormantes depuis chunk AD).
3. INSTALLER : vaisseau LANDED puis WAREHOUSED — alors seulement le menu
   des accessoires disponibles apparaît ; coût ressources + TEMPS ;
   l'accessoire occupe un SLOT du vaisseau. Slots par coque avec petit
   rnd au build : +1 slot à 1 %, +2 à 0,1 % [seedé].
4. RESSORTIR : entrepôt → deck → décoller. L'assemblage est stratégique.

### Le Crusader (Combat L) = vaisseau AMIRAL, « planète sans buildings »
- Ne peut JAMAIS atterrir (par définition).
- Ses propres STOCKS de ressources (acheminés par cargos).
- Arbre ADN COMPLET (recherches + accessoires, sans masque de seed).
- Peut TOUT fabriquer sur place.
- Équivalent 3 warehouses L3 + 3 spaceports L3 — les petits vaisseaux
  peuvent DOCK SUR le crusader.

## 2026-07-21 — Réponses responsable : boucliers morphiques, upgrades-items, usinage partiel, Crusader complet

Persisté avant validation groupée (§5). Décisions du responsable :

### Slots & accessoires
- **PAS de rnd de slots** — mauvaise idée, on garde le canon (aucun dé
  vivant) : les slots restent ceux de la coque (DG §8.1).
- **Upgrades = accessoires** (moteur, armure, OBS, armes…) : on ne
  « monte » plus L2→L3, on INSTALLE un item — un engine L3 en stock
  s'installe DIRECTEMENT. Non-fongibles : à DÉCOUVRIR (ADN — si on veut
  les fabriquer soi-même), à FABRIQUER et stocker (warehouse ; ou
  ACHETER ailleurs et acheminer par cargo), à INSTALLER (coût ressources
  + temps, vaisseau immobilisé DANS l'entrepôt).
- **Système de ravitaillement avancé** : permet d'attacher 2 sondes
  (1 = de base).

### Bouclier climatique — EXCEPTION (plus un accessoire)
- Lore : la coque de tout vaisseau est MORPHIQUE — elle s'adapte à tout
  climat via une « récriture moléculaire ». Le bouclier climatique est
  un RETOOLING SUR PLACE : coût en TEMPS seulement (pas de ressources).
- **Champs climatiques stellaires** : une étoile diffuse son influence
  climatique dans l'openspace autour d'elle (champ visualisé au CLIC
  sur l'étoile). Traverser de près le champ d'une étoile froide
  endommage les coques sans bouclier cold PENDANT la traversée. Survol
  ou dock sur planète cold sans bouclier cold = dégâts aussi (déjà le
  cas depuis le chunk AG). Rayon de diffusion [TUNE à proposer].

### Usinage partiel (NOUVELLE mécanique, usines L3)
- Une planète à l'ADN découvert peut LANCER une fabrication qui coûte
  plus que son stock : avec des usines L3, la fabrication (véhicules,
  accessoires ET bâtiments eux-mêmes) ne débite pas à la commande mais
  par PALIERS de 5 % (20 étapes), débit par étape, s'arrête « starved »
  si la ressource manque, REPREND dès disponibilité.
- Concurrence : un palier par usine en cours, dans l'ORDRE D'INSERTION
  en BDD.

### Le Crusader — complet
- **Fonctionne comme une PETITE PLANÈTE** : il lui faut de la
  POPULATION et il faut gérer ses ressources — mais ses infrastructures
  sont FIXES : on ne peut ni les détruire, ni en placer, ni les
  upgrader.
- Dotation d'office : residential L3 + usines L3 + docks (3 spaceports
  L3) + 3 warehouses L3 ; arbre ADN COMPLET ; fabrique TOUT sur place
  (usinage partiel D'OFFICE) ; PAS de markets (pas de vente).
- Stocks fongibles = équivalent planète S (800 T [TUNE]) — acheminés
  par cargos.
- **Flotte en orbite** : les vaisseaux peuvent orbiter le Crusader et
  profiter de la consommation réduite et de l'usage de ses ressources
  « au sol » ; si le Crusader BOUGE, TOUT CE QUI HOVER AVEC LUI bouge
  en même temps, en consommant comme en hovering (porte-avions mobile).
- **Jamais atterrir** : défaut de conformité relevé par le responsable
  (intention du gamebook première draft) — le texte GB actuel ne
  l'explicite pas : à AMENDER au GB lors de la validation. Correctif :
  les Crusaders à quai/en entrepôt sont FORCÉS en hovering sur leur
  planète, effet immédiat (migration).

### Addendum responsable (même session) : le Crusader a sa FICHE COMPLÈTE
- Le Crusader a droit à sa fiche de stats COMPLÈTE : pyramide/natalité
  (residential L3 d'office), taux de chômage (emplois = ses usines
  fixes), taux d'efficience, mortalité, horloges de survie — TOUTE la
  mécanique population v2 tourne à bord comme sur une planète.
- Implication (interp à valider) : dans l'espace, l'OXYGÈNE se respire
  AU STOCK (pas d'« ambiant » à bord) ; cap de population [TUNE —
  proposé : cap d'une planète S de qualité F = 2 000].

## 2026-07-21 — Réponses finales responsable (5 points) — tout est FIGÉ

1. Crusader : oxygène AU STOCK à bord ✓ ; cap de population 2 000
   (équivalent S-F) [TUNE] ✓.
2. Population à bord : à la FABRICATION, le Crusader naît directement
   en hovering et 25 % de la population de la planète source Y MIGRE —
   proportions des ÂGES respectées, les employés partants deviennent
   des postes vacants (staff décrémenté côté planète).
3. Usinage partiel : gated par N'IMPORTE quelle usine L3.
4. Champ climatique stellaire : PLUS PETIT que le champ de supernova.
   R_nova actuel = 40 × ∛(mult) → S 40 / M ≈ 63,5 / L ≈ 100,8 pc.
   Proposé : champ = 0,5 × R_nova (S 20 / M 32 / L 50 pc) [TUNE].
5. Combat M atterrit sans problème ; échelle des docks CONFIRMÉE telle
   qu'implémentée (L1 = S, L2 = +M, L3 = +L) ; seul le Crusader ne se
   pose jamais.

→ L'ensemble sondes L3 / accessoires / usinage partiel / Crusader est
considéré VALIDÉ D'UN COUP par le responsable. Plan total demandé :
docs/MASTER_PLAN.md créé (tout ce qui est figé et attend l'implé-
mentation + ce qui reste au stade de discussion).

## 2026-07-21 — W1 livré : réservoir multi-carburant des sondes

Slot ACTIF (premier de l'ordre configuré avec du stock) porte le taux
lazy, les autres slots statiques ; à sec du slot actif, ship_fuel_out
BASCULE au suivant (rebase) au lieu de tuer — la sonde ne meurt qu'à
sec TOTAL. Pré-brûlage de trajet tiré dans l'ORDRE à travers les slots
(leçon : l'auto-chargement au départ créditait inTank sans créditer le
slot — corrigé). Scoop préserve les autres slots (remplit le type de
l'étoile à la capacité restante). fuel_order par sonde (migration 027,
API POST /ships/:id/fuel-order, §10 sondes seules, doublons refusés).
Cercles d'autonomie = TOTAL des slots. Intégration ships 8/8 ; hover et
census ordonno-dépendants au balayage (passent seuls) → R5 élargi.

## 2026-07-21 — W2 : plan de chunk (moteurs typés à l'usinage)

Spec validée (MASTER_PLAN W2). Interprétations d'implémentation :
- `engine_type` colonne ships ('cold'|'hot'|'gas'), NULL pour sondes
  (multicarburant W1) et coques personnelles (sans réservoir) ;
  migration 028 backfille le type courant (slot du jsonb fuel, sinon
  'cold').
- Le chantier naval réutilise le PATRON INDUSTRIE tel quel : `recipe`
  du bâtiment = 'engine_cold'|'engine_hot'|'engine_gas', retool 24 h
  [TUNE] via retoolBuilding (statut retooling = chantier arrêté),
  gouvernance toute-Industrialist = instantané (même règle §4.1).
  Recipe NULL = accordé à l'étoile NATALE (défaut historique).
- buildShip : choix moteur (défaut étoile natale) ; il faut UN chantier
  actif dont l'outillage correspond ET dont le niveau couvre la taille.
- Naissance : le plein de 25 % est du type MOTEUR (plus forcément
  l'étoile natale), engine_type écrit à l'INSERT.
- Contraintes : refuel = fuel_<engine> uniquement ; transferts refusés
  entre moteurs différents ; slot actif (shipDrain) = engine_type pour
  les coques typées ; le pré-brûlage ordonné W1 reste réservé sondes.
- DG §8.3 consolidé dans le même commit. Tests intégration dédiés.

## 2026-07-21 — W2 livré : moteurs typés à l'usinage (+ erratum W1)

Livré conformément au plan de chunk du jour : `engine_type` figé au
build (migration 028, backfill), chantier outillé par recipe
`engine_<type>` (patron industrie réutilisé tel quel — retool 24 h,
instantané toute-Industrialist, chantier en pause), défaut étoile
natale, plein de naissance du type moteur, refuel/transferts/vol
contraints au moteur, UI outillage + retool + quille typée. DG §8.3
consolidé (la matrice hors-diagonale reste [TUNE]-dormante jusqu'à la
décision « effets de voyage » du programme D).

ERRATUM W1 : les échecs de hover.test au balayage n'étaient PAS de
l'ordonno-dépendance mais une régression W1 seed-dépendante —
`activeFuelSlot` faisait retomber un réservoir mono-type À SEC
(`{gas: 0}`) sur 'cold', et le test ne passait que quand l'étoile
natale tirait cold. Corrigé (un slot existant garde son type à sec) ;
R5 recentré sur census seul. Décoré au passage : buildShip ne
remontait pas x/y de la planète (étoile natale indéterminée), harvest
et survival adaptés (le type d'une coque typée EST son moteur), spawn
du hauler de départ typé natal, PROD_MIGRATIONS rattrapé (025–027
manquaient : faute réparée, 025→028 documentées).

Preuves : engines.test.ts 5/5 stabilité ×5 ; balayage sériel 309/309
(2e passe — 1re : census ×2, chantier responsable) ; unit 55 ; client
21 ; E2E engines.spec.ts vert ; captures eng-01..03 OBSERVÉES (natal
star (default) → retooling « Engine tooling: gas » → quille née gas).

## 2026-07-21 — W3 : plan de chunk (sondes L3, ancrage & transfert)

Spec validée (MASTER_PLAN W3). Interprétations d'implémentation :
- Migration 029 : `probe_level` étendu à 3 ; colonnes de transfert sur
  ships (probe donneuse) : `transfer_target_id` (FK ships ON DELETE SET
  NULL), `transfer_fuel_type`, `transfer_units` (montant choisi),
  `transfer_started_at`. Le flag « en transfert » (cible valide
  attaque 0, hook P5) est DÉRIVÉ : transfer_target_id NOT NULL.
- L3 = L2 (télescope de bord, survol moitié) + capacité tanker ; gate
  pad L3 [interp], surcoût [TUNE] proposé +40 ore +25 silicon au-delà
  du L2 ; vitesse/portée/conso de trajet inchangées.
- Transfert : montant CHOISI, débit 20 u/h-jeu [TUNE], règlement au
  BORD (événement `fuel_transfer_complete` à T = montant/débit,
  idempotent via transfer_started_at) : à l'échéance on déplace
  min(montant, stock du slot donneur, capacité restante du receveur) —
  partiel annoncé ; le type donné = TYPE MOTEUR du receveur (W2), la
  sonde doit avoir du stock de ce slot au départ.
- Annulation par l'un ou l'autre : règlement PRO-RATA (écoulé × débit,
  mêmes min) — un abandon ne perd pas le carburant déjà pompé.
- Les deux coques À L'ARRÊT EN OPENSPACE : statut `idle` strict pour la
  sonde ; receveur `idle` OU `stranded` hors survol/quai (le sauvetage
  au vide est LE cas d'usage du tanker — interp annoncée, un receveur
  échoué repart en idle une fois servi). Distance ≤
  FUEL_TRANSFER_RADIUS_PC existant. moveShip REFUSE toute coque
  engagée dans un transfert (les deux sens).
- 1 sonde ancrée par receveur (constante MAX_ANCHORED_PROBES = 1,
  passera à 2 avec l'accessoire « système de ravitaillement avancé »,
  W6 — hook config). Sonde→sonde INTERDIT ; coque personnelle exclue.
- v1 entre VOS coques uniquement (cohérent avec transferFuel v1,
  annoncé).
- API : POST /ships/:id/anchor-transfer {toShipId, units},
  POST /ships/:id/anchor-cancel ; vue flotte : bloc transfer
  {targetId, endsAt, unitsPlanned}. UI minimale : action sur sonde L3
  sélectionnée (patron scoop) + annulation ; E2E dédié.

## 2026-07-21 — W3 livré : sondes L3, ancrage & transfert

Livré conformément au plan de chunk : migration 029 (probe_level 3 +
transfer_target_id/_fuel_type/_units/_started_at, index partiel), gate
pad L3 avec surcoût empilé (+40 ore +25 silicon [TUNE]), ancrage
openspace strict (sonde idle ; receveur idle ou échoué AU VIDE — un
receveur servi repart idle), type donné = moteur du receveur (W2),
débit 20 u/h-jeu [TUNE], règlement au BORD (fuel_transfer_complete,
idempotent par transfer_started_at), annulation PRO-RATA, sonde→sonde
interdit, MAX_ANCHORED_PROBES = 1 (hook accessoire W6), moveShip
verrouillé des deux côtés, attaque-0 dérivée (P5). API anchor-transfer/
anchor-cancel, vue flotte transfer/anchoredProbeId, UI galaxie
« Tanker anchor (L3) ». DG §8.1 : le paragraphe sondes datait du PRÉ-v3
(voile solaire 10 pc/j) — consolidé v3 complet (faute de W-1 réparée).

Preuves : anchor-transfer.test 5/5 (×4 stabilité) ; balayage sériel
314/314 (39 fichiers, census vert cette passe) ; unit 55 ; client 21 ;
E2E anchor.spec vert ×4 (leçons : l'ADN du seed gate le pad L3 →
prédicat pickEmailByDna ; carbon seedé variable → granté ; capture
« settled » attendait la resynchronisation du panneau au poll 5 s) ;
captures anc-01..03 OBSERVÉES.

## 2026-07-21 — W4 : plan de chunk (vue de bord des sondes L2/L3)

Spec validée (MASTER_PLAN W4, décision 2026-07-20). Interprétations :
- `visibleBodies` (world.ts, désormais libre) : le scope d'une sonde
  L2+ passe de PROBE_SCAN_PC (60) à BASE_SKY_PC + 200 = **260 pc**
  (ciel L1), CONTINU « où qu'elle soit » : y compris EN TRANSIT
  (position interpolée en SQL sur les colonnes de mission — c'est le
  sens de « continu », l'éclaireur balaie en volant). L1 reste 60 pc à
  l'arrêt (scan d'arrivée), vaisseaux 20 pc, statuts à l'arrêt inchangés.
- L'INTEL par paliers (bodyIntel) ne bouge PAS : la vue de bord est de
  la VISIBILITÉ (scope), le scan riche des sondes reste R4 (annoncé).
- UI : la sélection d'une sonde L2+ affiche le halo de scan (même
  visuel que le télescope planétaire, rayon 260 pc).
- Tests : intégration (L1 60 pc vs L2 260 pc au même point du vide,
  transit continu) + E2E léger (corps invisible → visible après envoi
  d'une sonde L2, /api/galaxy) + capture halo observée.

## 2026-07-21 — W4 livré : vue de bord des sondes L2/L3 (+ correctif de commit)

Livré conformément au plan : scope des sondes L2+ porté à 260 pc
(BASE_SKY + 200) dans visibleBodies, CONTINU y compris en transit
(position interpolée en SQL sur les colonnes de mission, clampée 0–1) ;
L1 reste 60 pc à l'arrêt ; l'intel par paliers ne bouge pas (R4). Halo
UI à la sélection d'une sonde L2+ hors transit (visuel télescope,
260 pc). Leçon E2E : 350 pc de trajet = 17,5 u = exactement le plein de
naissance → la sonde meurt À SEC à l'arrivée (règle v3 démontrée) —
trajet ramené à 250 pc ; la capture « halo » attend le panneau idle
(poll client 5 s). FAUTE DE PROCESS corrigée dans la foulée : le commit
978993b a été créé depuis game/ (cwd erroné) — l'entrée de journal
était partie dans game/JOURNAL.md (supprimé ici) et les mises à jour
CHANGELOG/DG/MASTER_PLAN/BACKLOG manquaient (appliquées ici).

Preuves : onboard-sight.test 4/4 (×3) ; balayage sériel 318/318 (40
fichiers, census vert) ; unit 55 ; client 21 ; E2E onboard-sight.spec
vert ; capture obs-01 OBSERVÉE (halo + sweep + panneau idle).

## 2026-07-21 — W5 : plan de chunk (champs stellaires + coque morphique)

Spec validée (MASTER_PLAN W5). Interprétations d'implémentation :

(a) Champs climatiques stellaires :
- Rayon du champ = 0,5 × r_nova (colonne existante, 40×∛mult) → S 20 /
  M ~31,7 / L ~50,4 pc [TUNE]. Helper pur partagé starFieldRadiusPc +
  mapping type d'étoile → bouclier requis [TUNE interp annoncée] :
  hot→hot, cold→cold, gas→radio (l'environnement radiatif).
- Coques À L'ARRÊT DANS L'ESPACE (hovering/idle/stranded) dans le champ
  sans le bouclier apparié : source hostile additive de +5 % HP max/j
  dans rebaseShipHull (même patron que la zone de hasard). À QUAI :
  exempt [interp annoncée : la coque posée est sous le champ du MONDE,
  dont le climat fait déjà loi]. Sondes : concernées (pas de bouclier
  possible — s'approcher des étoiles use, cohérent avec le scoop).
- TRAVERSÉE en transit : dégâts réglés AU BORD (shipArrival) —
  longueur d'intersection segment×disque par champ non blindé,
  jours = longueur/vitesse, dégâts = Σ 5 % HP max × jours, PLANCHER
  1 HP (un péage, jamais une mort — GB §27). Géométrie pure partagée
  (segmentCircleCrossingPc) testée unitairement.
- Visualisation : au clic sur une étoile, cercle du champ teinté selon
  le type (UI GalaxyMap), rayon 0,5 × r_nova.

(b) Coque MORPHIQUE (le bouclier n'est plus un accessoire) :
- Adaptation = réécriture moléculaire SUR PLACE, TEMPS SEUL [TUNE
  24 h-jeu, patron retool], AUCUN coût, AUCUN workshop, n'importe quel
  statut à l'arrêt (docked/hovering/idle/stranded). UNE adaptation
  active à la fois : la fin de morphose écrit {kind: true, autres:
  false}. Les coques existantes multi-boucliers sont conservées telles
  quelles (grandfather, annoncé) jusqu'à leur première morphose.
- Pendant la morphose : coque immobilisée (moveShip refuse), événement
  shield_morph_complete idempotent (colonne morphing_shield +
  morph_started_at, migration 030).
- fitShield (workshop L2 + coût) devient morphShield ; la route
  POST /ships/:id/shield garde son chemin mais rend completesAt.
- Sondes toujours exclues (pas de bouclier).

## 2026-07-21 — W5 livré : champs climatiques stellaires & coque morphique

(a) Champs : rayon 0,5 × r_nova (colonne existante), mapping type
d'étoile → adaptation (hot/cold ; gas→radio [interp]), source additive
+5 %/j dans rebaseShipHull pour les coques à l'arrêt DANS L'ESPACE (à
quai exempt — le climat du monde fait loi), péage de TRAVERSÉE réglé au
bord dans shipArrival (géométrie pure segmentCircleCrossingPc, jours =
longueur/vitesse, plancher 1 HP), champ public visualisé au clic
(disque teinté). Leçon SQL : LEAST($1,$3) infère text — casts ::float8.
(b) Coque morphique : migration 030 (morphing_shield/morph_started_at),
morphShield temps-seul 24 h [TUNE] à l'arrêt n'importe où, une chimie
active à la fois (le bord shield_morph_complete écrit {kind} seul),
grandfather des multi-boucliers hérités, moveShip refuse pendant,
fitShield SUPPRIMÉ (route conservée → morphose).

Effets assumés et démontrés dans les suites existantes : le scoop d'une
sonde implique la traversée du champ (−0,42 HP exacts au bord sur
20 pc/120 pc/j), le flare DOUBLE près de l'étoile (4+4), le rallumage
laisse le champ ; fixtures de wear.test posées sur des points CLAIRS
(≥ 52 pc de toute étoile) pour rester déterministes par seed.

Preuves : unit wear 17 ; star-fields.test 3/3 (×3) ; wear.test 9/9
(×3) ; balayage sériel 321/321 (41 fichiers) ; unit serveur 55 ; client
21 ; E2E shields.spec réécrit vert ×2 ; captures sh-00..03 OBSERVÉES
(champ teinté au clic, −4.0 HP/day, « Hull morphing → hot », péage
éteint après morphose).

## 2026-07-21 — W6 : plan de chunk (pipeline accessoires & upgrades-items)

Spec validée (MASTER_PLAN W6). Décomposition en sous-chunks et
interprétations d'implémentation :

W6a — Modèle d'items & fabrication :
- Catalogue partagé `items.ts` : ITEMS non-fongibles {key, kind
  accessory|upgrade, slot (accessory|engine|armor|obs|weapon|fuel),
  level 2|3 pour les upgrades, coût de fabrication, heures de
  fabrication [TUNE], coût+heures d'installation [TUNE], bâtiment hôte
  de fabrication}. Premier accessoire : advanced_refueling_system
  (2 ancrages W3). Upgrades DG §8.2 : engine/armor/fuel(tank)/obs/
  weapon L2 et L3 — effets moteur (vitesse ×1,15/×1,30), armure (HP
  ×1,3/×1,6), réservoir (×1,5/×2,0) branchés ; obs/weapon DORMANTS
  (combat P5, annoncé).
- Découverte [interp annoncée v1] : un item est fabricable là où son
  bâtiment hôte est DISPONIBLE dans l'ADN de la planète (accessoires →
  workshop ; weapon → weapon_foundry ; engine/armor/fuel/obs →
  shipyard). L'« arbre ADN des accessoires » dédié (nœuds propres)
  reste à approfondir — ANNONCÉ comme reste W6 au MASTER_PLAN.
- Migration 031 : table planet_items (lignes non-fongibles, body_id,
  item_key), ships.accessories jsonb [], ships.upgrades jsonb {},
  ships.installing_item + install_started_at.
- Fabrication : commande sur un bâtiment hôte ACTIF (coût au stock,
  refus explicites), événement item_fabricated → ligne planet_items ;
  capacité d'ITEMS des warehouses RÉVEILLÉE : Σ 50 × mult(niveau)
  [chunk AD], la fabrication refuse au-delà.
W6b — Installation & effet du premier accessoire :
- Vaisseau WAREHOUSED sur le monde de l'item : install (coût
  ressources + TEMPS [TUNE 12 h] d'immobilisation supplémentaire),
  événement item_installed idempotent → accessories/upgrades écrits,
  la ligne planet_items consommée à la COMMANDE (atomique).
- Slots = ceux de la coque (canon, PAS de rnd) : accessoires ≤
  slots.accessory ; upgrades : 1 par famille max [TUNE-v1 interp
  annoncée], famille avec slot > 0 seulement ; un L3 s'installe
  DIRECTEMENT (remplace un L2 installé, l'item L2 N'est PAS rendu
  [TUNE-v1 annoncé]).
- Effet accessoire 1 : MAX_ANCHORED_PROBES → 2 si
  advanced_refueling_system installé (W3 hook).
- Effets upgrades : vitesse moteur dans moveShip/hullStats, HP max
  armure dans shipMaxHp, capacité réservoir effective partagée
  (effectiveTankU) utilisée par refuel/transferts/anchor/moveShip.
W6c — restes explicites (au MASTER_PLAN) : arbre ADN dédié des
  accessoires, achat/acheminement par cargo (marché des items),
  conversion des rigs booléens historiques (harvest/junk/claim) en
  items, obs/weapon effectifs (P5).

## 2026-07-21 — W6 cœur livré : pipeline accessoires & upgrades-items

Livré conformément au plan de chunk (W6a+W6b) : catalogue GEAR partagé
(11 items exhaustifs — règle de complétude ; collision de nom avec le
catalogue descriptif ITEMS de recipes.ts résolue par le nom GEAR),
migration 031 (planet_items + accessories/upgrades/installing sur
ships), fabrication sur bâtiment hôte actif avec balance d'items des
warehouses réveillée (50 × mult, chunk AD), installation sur coque
ENTREPOSÉE (item consommé à la commande, immobilisation 12 h, retrieve
refusé pendant), effets branchés : 2 ancrages (accessoire, W3), vitesse
moteur (moveShip + péage de traversée W5), réservoir effectif partout
(refuel/transfert/ancrage/vue), HP max (armure). API + UI (fabrication
dans les panneaux hôtes, installation dans le panneau galaxie, chips).

LIMITE ANNONCÉE (§25) : gear.spec.ts (E2E) est ÉCRIT mais NON EXÉCUTÉ
et aucune capture §16 — le port 8080 a été repris par l'environnement
du responsable pendant le chunk (règle : ne jamais le toucher). Le
chunk reste [~] au MASTER_PLAN jusqu'au passage E2E (motif R6). Restes
W6c listés au MASTER_PLAN (arbre ADN dédié, marché des items,
conversion des rigs, obs/weapon P5).

Preuves : unit items 3 ; gear.test.ts 6/6 (×3) ; balayage sériel
327/327 (42 fichiers) ; unit 55 ; client 21 ; build monorepo vert.

## 2026-07-21 — W7 : plan de chunk (usinage partiel, usines L3)

Spec validée (MASTER_PLAN W7). Interprétations d'implémentation :
- Migration 032 : table work_orders {body_id, kind 'ship'|'item',
  payload, cost total, steps_done/20, status running|starved,
  factory_building_id, created_at}.
- Déclencheur : dès qu'UNE industrie L3 ACTIVE (bâtiment à
  batchesPerDayByLevel, n'importe laquelle) existe sur le monde, les
  commandes buildShip et fabricateGear passent en PAIEMENT PAR PALIERS :
  rien d'avance, 20 paliers de 5 % du coût, un palier = durée
  totale/20 (temps de chantier du vaisseau ; fabricationHours de
  l'item). Sinon : chemin historique (paiement à la commande).
- Affectation : l'usine L3 la moins chargée à la commande ; une usine
  traite ses ordres STRICTEMENT dans l'ordre d'insertion BDD (le palier
  d'un ordre ne court que s'il est le plus ancien inachevé de son
  usine — sinon replanifié).
- Starved : un palier impayable marque l'ordre starved et se
  replanifie à cadence fixe (1 h-jeu [TUNE]) jusqu'à ce que le stock
  revienne — reprise AUTO, aucune perte.
- 20e palier payé → l'événement terminal EXISTANT est émis (ship_built
  / item_fabricated) : les handlers actuels restent la seule voie de
  naissance. Les vues en attente (pendingShipBuilds, fabricating)
  agrègent les work_orders.
- RESTE ANNONCÉ (règle de complétude) : les BÂTIMENTS en usinage
  partiel — le flux de placement (main de cartes, tuiles, retool) est
  un chantier propre ; listé au MASTER_PLAN avec motif, à couvrir dans
  un chunk dédié. E2E/captures suivant la disponibilité du port (R6).

## 2026-07-21 — W7 cœur livré : usinage partiel des usines L3 (+ correctif)

Livré conformément au plan : table work_orders (migration 032), gate =
une industrie L3 active, affectation à l'usine la moins chargée, FIFO
strict par usine, paliers de 5 % ATOMIQUES (rien débité si UNE
ressource manque), starved + retry à la cadence du palier [TUNE-v1
annoncé], reprise auto, 20e palier → ship_built/item_fabricated (voie
existante). Vues avec « (n/20) ». LIMITES ANNONCÉES : bâtiments en
partiel = chantier propre (MASTER_PLAN) ; E2E + captures §16 = port
8080 (R6). RÉCIDIVE de la faute de cwd du commit W4 sur ac0bd4a
(game/JOURNAL.md recréé, docs racine manquantes) — corrigée ici ;
leçon : plus JAMAIS de docs sans `cd` absolu vérifié.

Preuves : work-orders.test 3/3 (×3) ; balayage sériel 330/330 (43
fichiers) ; unit 55 ; build monorepo vert.

## 2026-07-21 — W8 : plan de chunk (le Crusader, petite planète volante)

Spec validée (MASTER_PLAN W8, réponses finales 2026-07-21). Découpage :

W8a — Schéma & naissance :
- Migration 033 : ships.crusader_stock jsonb (fongibles, équivalent
  planète S : cap 800 T [TUNE]), ships.crusader_pop jsonb (pyramide
  C/A/S + compteurs démo + horloges — MÊME forme que bodies),
  ships.crusader_infra jsonb FIGÉ à la naissance {residential: 3,
  factories L3 (usinage partiel d'office), spaceports: 3×L3,
  warehouses: 3×L3, ADN complet, PAS de markets}.
- shipBuilt(combat_l) : naît EN HOVERING (jamais docked — GB amendé),
  25 % de la population de la planète source migre à bord
  (proportions d'âges exactes, staff source décrémenté, compteurs demo
  crédités), oxygène AU STOCK (cap pop 2 000 [TUNE]).
- MIGRATION D'EXISTANT : tout combat_l à quai/entrepôt est FORCÉ en
  hovering à la migration 033 (décision « tu as merdé », effet
  immédiat).
W8b — Vie à bord (pop v2 complète) :
- pop_daily étendu aux crusaders : natalité (residential L3), chômage
  vs emplois FIXES, efficience, mortalité, horloges eau/nourriture/
  OXYGÈNE AU STOCK (le stock crusader_stock paie), overcap 0,25.
  Réutiliser les fonctions popv2 partagées (mêmes formules).
W8c — Atterrissage interdit & docks volants :
- landShip/warehouseShip REFUSENT la catégorie combat_l ; les autres
  coques peuvent DOCKER au crusader (3 spaceports L3 = comptes L3),
  consommant « comme au sol » sur SES ressources.
W8d — Flotte-suiveuse :
- TOUT ce qui hover avec lui (hover_body_id = crusader ? un vaisseau
  ne référence que bodies → table ou colonne follow_ship_id, migration
  033) bouge au même temps : au moveShip du crusader, les suiveurs
  reçoivent la même mission (positions synchrones), conso hovering.
W8e — Fabrication à bord (ADN complet, usinage partiel d'office) et
  vues/UI/E2E — chunk final.
Interps à trancher en cours de route (annoncées) : quelles « usines »
fixes exactement (liste DG), montants de seed du stock à la naissance.

## 2026-07-21 — E2E W6/W7 passés, pile dev décalable (GO responsable)

Le responsable a autorisé le redémarrage/reseed du dev. Diagnostic :
le listener 8080 est un service Windows ÉTRANGER (réponse
{"detail":"Not Found"}, réseau miroir WSL — intuable d'ici). Décision :
pile dev/E2E décalable — ATG_API_PORT pour le proxy Vite (défaut 8080
inchangé pour le responsable), Playwright lance l'API sur 8081.
gear.spec (W6) et work-orders.spec (W7, nouveau) VERTS ; captures
gr-01..03 + wo-01..02 OBSERVÉES (§16). Les restes « E2E R6 » de W6/W7
sont levés au MASTER_PLAN ; restent W6c (arbre ADN dédié, marché des
items, conversion des rigs, obs/weapon P5) et les bâtiments en usinage
partiel (chantier propre).

## 2026-07-21 — W8a livré : le Crusader, schéma & naissance

Conforme au plan de chunk : migration 033 (crusader_stock/pop/infra +
follow_ship_id ; combat_l posés/entreposés FORCÉS en survol — décision
« il n'aurait jamais dû pouvoir atterrir »), naissance en SURVOL dans
shipBuilt (25 % de pop source via crusaderMigrants — proportions d'âges
exactes, arrondis réparés sur les actifs, cap 2 000 ; compteurs planète
décrémentés ; staff dégarni du plus grand effectif au plus petit si les
actifs restants ne couvrent plus [interp annoncée] ; amorçage
oxygène 100 / vivres 50+50 T [TUNE-v1] puisés au stock, partiel
annoncé ; infra FIGÉE descriptive v1), landShip/warehouseShip refusent.
Cassure assumée : warehouse.test prouvait la balance L au combat_l —
basculé cargo_l (le Crusader ne s'entrepose plus). NB : le balayage
d'annotations @spec/@verifies du responsable est EN COURS sur tout le
dépôt — mes commits n'embarquent que l'en-tête d'une ligne des fichiers
que je touche (le reste du balayage reste à lui).

Preuves : shared crusader.test 3 ; crusader.test.ts 2/2 (×3) ; balayage
sériel 330/332 (census ×2 = flaky R5 connu) ; unit 55 ; shared 199 ;
build monorepo vert. Restent W8b→W8e (plan persisté).

## 2026-07-21 — W8b livré : la fiche pop v2 vivante à bord du Crusader

Conforme au plan : événement crusader_daily (armé à la naissance,
quotidien tant que le bord vit), règlement AU STOCK de bord — mêmes
formules de besoins que le sol (POP_NEEDS/1000, oxygène 0,6/1000),
horloges eau 3 j / vivres 10 j linéaires à échéance et levées au
ravitaillement, oxygène à sec = extinction instantanée du bord (canon
climats hostiles), vieillissement agingFlows, natalité residential L3
× M_growth (ρ = couverture du jour, efficience neutre 0,7 [TUNE-v1
annoncé]), chômage vs 400 emplois FIXES [TUNE] (grâce 3 j, γ 0,02),
overcap 0,25 (cap 2 000), morts proportionnelles + compteurs. Leçon de
séance : un fichier de test de debug laissé à côté fait TRUNCATE la
base sous la suite voisine (runs « skipped » en alternance) — supprimé,
6×5/5 stable.

Preuves : crusader.test.ts 5/5 (×6) ; balayage sériel 333/335 (census
×2 = flaky R5 connu) ; unit 55 ; build vert. Restent W8c→W8e.

## 2026-07-21 — W8c livré : les docks volants du Crusader

Conforme au plan : amarrage à ≤ 1 pc (les deux à l'arrêt), capacité
6 S / 6 M / 6 L (3 spaceports L3 figés, balances séparées — canon
warehouse), sondes/personnel/Crusader exclus, v1 entre vos coques. À
bord : réservoir GELÉ + équipage nourri par l'hôte, et les équipages
invités s'ajoutent aux TÊTES du crusader_daily (« comme au sol » réel,
pas simulé). Les invités voyagent avec l'hôte (sync à l'arrivée dans
shipArrival — no-op pour les coques sans invités) ; moveShip efface
l'amarrage (appareillage direct). Leçon : l'arrivée d'un vol précédent
peut rester en file — pomper avant d'amarrer (flake corrigé).

Preuves : crusader.test.ts 7/7 (×4) ; balayage sériel 335/337 (census
×2 = flaky R5 connu) ; build vert. Restent W8d/W8e (plan persisté).

## 2026-07-21 — W8d livré : la flotte-suiveuse du Crusader

Conforme au plan : hoverAtCrusader (≤ 1 pc, les deux à l'arrêt, sondes
et personnel exclus, v1 vos coques) — le suiveur passe hovering avec
follow_ship_id, réservoir GELÉ ; le BORD paie son survol (déduction
quotidienne fuel_<moteur> par suiveur dans crusader_daily, partielle si
le stock manque [TUNE-v1 annoncé]) et nourrit son équipage (têtes
comptées). Tout ce qui suit — amarré (W8c) OU en escorte — est
synchronisé à chaque arrivée du Crusader (positions aux bords,
philosophie lazy — pas d'interpolation des suiveurs en transit,
annoncé). Fin d'escorte par undockFromCrusader (élargi) ou départ
direct (moveShip efface l'escorte).

Preuves : crusader.test.ts 8/8 (×3) ; balayage sériel 338/338 (census
VERT cette passe) ; build vert. Reste W8e (plan persisté).

## 2026-07-22 — ERRATUM W6 (décision responsable) : les rigs SONT des accessoires

Correction du responsable : les rigs booléens historiques (harvest
rig, junk collector, claim rig) ne sont PAS un chemin parallèle — ce
sont des ACCESSOIRES du pipeline W6, comme l'advanced refueling
system : fabriqués au workshop (coût + temps), entreposés dans la
balance d'items, INSTALLÉS sur coque entreposée (coût + temps), et ils
OCCUPENT UN SLOT ACCESSOIRE de la coque. Conséquence canon : une coque
cargo_s (1 slot accessoire) choisit UN seul équipement.

Plan d'implémentation (chunk immédiat) :
- GEAR += harvest_rig / junk_collector / claim_rig (fabricator
  workshop, coûts des rigs existants, 24 h de fabrication [TUNE]) ;
- item_installed écrit AUSSI le booléen hérité (les effets existants
  le lisent — une seule vérité d'effet, l'inventaire dans accessories) ;
- migration 034 : backfill des booléens posés → accessories[] (le
  comptage de slots devient honnête ; les coques héritées sur-remplies
  sont tolérées telles quelles, annoncé) ;
- SUPPRESSION des fit* directs (services, routes, boutons UI) — la
  seule voie est le pipeline ;
- tests d'intégration : fixtures par SQL (flag + accessories) là où le
  rig n'est pas l'objet du test ; E2E harvest/junk/claim réécrits sur
  le flux fabrique→entrepose→installe ;
- terraform core / colony kit : hors périmètre de cet erratum (flux
  colonial), à trancher séparément si souhaité.

## 2026-07-22 — Erratum W6 livré : les rigs sont des accessoires

Conforme au plan persisté ce matin : GEAR += harvest_rig /
junk_collector / claim_rig (workshop, coûts historiques, 24 h [TUNE]) ;
item_installed écrit le booléen d'effet hérité (les systèmes harvest/
junk/claim le lisent inchangés) et l'objet occupe un slot accessoire ;
migration 034 backfille les rigs posés dans accessories[] ; montage
direct SUPPRIMÉ (services, routes, boutons — y compris le nettoyage
d'une regex trop gourmande qui avait avalé le helper wrap, restauré).
Codex : rôle du workshop réécrit (porte DoD). E2E : /test/grant-item
(§15) + installRigViaPipeline — harvest/junk/claim verts en sériel.
Conséquence canon assumée : cargo_s (1 slot) choisit UN équipement ;
gear.test prouve le débordement de slots refusé.

Preuves : shared items 3 ; gear.test 7/7 ; harvest 12 + junk + claim +
wear adaptés (fixtures §15) ; balayage sériel 335/337 (census ×2 =
flaky R5) ; E2E harvest/junk/claim 3/3 sériels ; client 21 ; build
vert.

## 2026-07-22 — FAUTE de staging sur 8ffb1f7 (consignée)

Le commit de l'erratum (8ffb1f7) a été stagé avec `git add -A` : il a
EMBARQUÉ ~270 fichiers du balayage d'annotations @spec/@verifies du
responsable (chantier parallèle, potentiellement inachevé au moment du
commit). L'historique n'est PAS réécrit (branche partagée, commit déjà
poussé) : les annotations restent attribuées à tort à ce commit —
cette entrée fait foi de la paternité réelle (responsable). Règle
durcie pour la suite : plus JAMAIS de `git add -A` tant qu'un chantier
parallèle est ouvert — liste explicite de fichiers uniquement. Le
MASTER_PLAN (édition manquée par l'échec d'ancre du script) est réparé
dans ce commit.

## 2026-07-22 — Décisions responsable : accessoires de conversion + coque métamorphose

Nouveau brainstorm validé par le responsable (persisté avant tout
code) — trois accessoires + une généralisation :

1. ÉLECTROLYSEUR (accessoire, fabriqué au workshop) : une fois monté,
   NOUVELLE COMMANDE de bord — on sacrifie un montant d'EAU, réglage
   d'efficience 0–100 % : la conversion consomme PROGRESSIVEMENT l'eau
   et produit oxygène + hydrogène À PARTS ÉGALES (20 eau → 20 O2 +
   20 H). Vitesse ∝ efficience : 20 T à 10 % = 10 h ; à 50 % = 2 h
   (débit = 20 × runPct T/h [TUNE]) ; à 0 % = OFF. EN MARCHE, il BRÛLE
   du carburant (taux [TUNE], type moteur). L2 : sait AUSSI faire
   l'INVERSE (O2 + H → eau).
2. VIVARIUM (accessoire, workshop, SANS niveaux) : même principe —
   consomme carburant + oxygène, produit de la NOURRITURE.
3. Tout accessoire OCCUPE UN SLOT si monté (canon confirmé).
4. COQUE MÉTAMORPHOSE = un ACCESSOIRE comme les autres (fabricable,
   montable, DÉMONTABLE et désassemblable) SAUF qu'il est INSTALLÉ
   D'OFFICE sur tout vaisseau à la construction, SANS surcoût — le
   joueur peut le démonter pour arbitrer ses slots ; SANS cet
   accessoire, PAS de bouclier morphique (la morphose W5 l'exige).
   Généralisation induite : DÉMONTAGE (l'item retourne à la balance du
   monde, coque entreposée, temps [TUNE]) et DÉSASSEMBLAGE
   (destruction de l'item [interp : remboursement partiel à trancher])
   deviennent des commandes du pipeline pour TOUS les accessoires.

Interps à annoncer à l'implémentation : ratio 1:1:1 en tonnes ;
carburant de fonctionnement puisé au réservoir de la coque ; commandes
de conversion à l'ARRÊT [à confirmer] ; le manifest des coques
existantes reçoit la coque métamorphose au backfill (migration).

## 2026-07-22 — W9a livré : métamorphose d'office, démontage, désassemblage

Conforme au plan : GEAR += metamorphic_hull/electrolyzer/
electrolyzer_l2/vivarium (les mécaniques de conversion arrivent en
W9b/W9c — le catalogue est complet d'avance, règle de complétude) ;
métamorphose installée d'office (spawn + shipBuilt + migration 035) ;
morphShield exige l'accessoire ; démontage (item_uninstalled : retour
en balance, rigs éteints, métamorphose → adaptations effacées) ;
INTERP AJUSTÉE en cours de chunk : balance pleine/absente au démontage
= désassemblage sur place à 50 % (l'arbitrage ne se bloque jamais) ;
désassemblage d'un item entreposé à 50 %. Conséquence canon assumée :
cargo_s naît PLEIN (1 slot) — E2E et tests arbitrent par les vraies
commandes.

Preuves : shared items 3 ; gear.test 10/10 (×3) ; balayage sériel
340/340 ; unit 55 ; E2E gear+shields+harvest+junk+claim 5/5 sériels ;
build vert.

## 2026-07-22 — PROPOSITION EN DISCUSSION (non validée) : familles de slots & catalogue d'accessoires

Constat validé par le responsable : (1) pas de mapping accessoire →
famille de slot (tout va au slot générique « accessory ») ; (2) trop
peu d'accessoires pour des builds/arbitrages réels. Principes donnés :
un bon accessoire CONTOURNE une contrainte existante, petit avantage
sans casser l'équilibre ; PASSIF (très petit) ou ACTIF (modulable,
compromis avec coût d'usage — patron vivarium/électrolyse) ; gating
par l'ADN des bâtiments.

Ma proposition (EN ATTENTE de validation) :
- Mapping : un accessoire déclare sa FAMILLE de slot ; upgrades ET
  accessoires PARTAGENT la capacité de la famille (HULLS.slots) —
  l'arbitrage upgrade-vs-accessoire naît là.
- Passifs [TUNE] : heat_recycler (fuel, −15 % hover, refinery),
  cryo_larder (accessory, +50 % provisions, lab), docking_clamps
  (accessory, dwell ×2, spaceport), signal_mirror (obs, scan 60 pc,
  telescope), survey_suite (obs, +1 palier intel plafonné L2,
  research_center), ballast_shielding (armor, −50 % junk,
  military_district), flare_dampers (armor, −50 % champ/flare —
  non-cumul avec morph apparié, obs_station), trim_vanes (engine,
  pénalité de poids ÷2, shipyard), berth_module (cargo, +25 % pax,
  residential).
- Actifs [TUNE] : arc_furnace (junk→steel_l, brûle fuel), med_synth
  (water+phosphor→med_1, lab), ram_scoop (fuel en transit dans un
  champ : récolte ∝ runPct contre usure ×2), gravity_sling (départ
  ≤ 8 pc d'étoile : vitesse ×(1+runPct/2) contre dégâts ∝ runPct),
  fab_bay (auto-réparation 1 %/h×runPct au steel de soute).
- Questions posées : partage de capacité famille ? actifs à l'arrêt
  sauf exceptions ? non-cumul flare_dampers/morph ? exclusions par
  coque ? tour d'équilibrage post-implémentation ?

## 2026-07-22 — VALIDÉ (responsable) : système d'accessoires complet

Réponses du responsable à la proposition du jour — TOUT est figé :
1. Partage de capacité de FAMILLE entre upgrades et accessoires :
   OUI (« sinon ça n'a pas de sens »).
2. Les ACTIFS fonctionnent PARTOUT (survol, transit, à l'arrêt — peu
   importe). S'ils STARVENT une condition d'activation (intrant ou
   carburant manquant), ils passent AUTOMATIQUEMENT à 0 % d'activation.
   Réglage par PAS DE 5 %. (Réconciliation avec l'électrolyse validée
   antérieurement : deux modes d'actifs — BATCH (électrolyse : montant
   sacrifié au lancement, la starvation de carburant PAUSE à 0 %,
   reprise en re-réglant) et CONTINU (vivarium & co : tourne tant que
   les intrants suivent, sinon 0 %).)
3. flare_dampers CUMULABLE avec la morphose : oui — le passif limite
   les dégâts d'un « oubli de morph » en traversée de champ.
4. AUCUNE exclusion par coque (builds plus drôles).
5. TOUR D'ÉQUILIBRAGE maintenant : oui, il en faut un (campagne de
   simulation, BALANCE_LOG — exception sous-agents applicable).
6. Catalogue BEAUCOUP plus fourni. Gating de FABRICATION validé
   (bâtiment hôte présent sur la planète de fabrication) + VERSIONS
   « ENHANCED » liées au NIVEAU du bâtiment (le grade s'opère À LA
   FABRICATION). Un accessoire MONTÉ ne dépend que de ses conditions
   d'ACTIVATION : acheté ailleurs, il se monte partout où il « fit »
   (l'installation n'exige AUCUNE techno — déjà le cas, confirmé).

CATALOGUE FIGÉ (base + enhanced fabriquée sur bâtiment hôte L3 —
chiffres [TUNE], v1) :
- Passifs : heat_recycler (fuel, refinery, −15 %/−25 % hover),
  cryo_larder (acc, lab, +50 %/+100 % provisions), docking_clamps
  (acc, spaceport, dwell ×2/×3), signal_mirror (obs, telescope, scan
  60/100 pc), survey_suite (obs, research_center, +1 palier intel cap
  L2/L3), ballast_shielding (armor, military_district, junk −50 %/
  −75 %), flare_dampers (armor, obs_station, champ/flare −50 %/−75 %,
  cumulable), trim_vanes (engine, shipyard, pénalité de charge ÷2/÷4),
  berth_module (cargo, residential, pax +25 %/+50 %), course_optimizer
  (engine, research_center, burn de trajet −10 %/−15 %), cargo_netting
  (cargo, warehouse, +1/+2 conteneurs), mooring_winch (acc, warehouse,
  redéploiement ÷2/÷3), bilge_purifier (acc, waterworks, survie
  équipage −25 %/−50 %), stargate_caller (acc, stargate_yard, péage
  étranger −25 %/−50 %), salvage_grapnel (acc, workshop, réclamation
  2 h→1 h/0,5 h), haggler_matrix (acc, commerce_district, prix inné
  −10 %/−15 %), ore_hopper (cargo, smelter, scoop de junk +50 %/
  +100 %), solar_sails (fuel, fuelcell_plant, survol GRATUIT à ≤ 8/
  ≤ 15 pc d'une étoile), escape_thrusters (engine, military_district,
  alarme d'auto-fuite à 40 %/50 %).
- Actifs : electrolyzer (+_l2 inverse, validés) + enhanced (débit
  ×1,5) ; vivarium (+enh) ; arc_furnace (junk→steel_l, fuel, +enh) ;
  med_synth (water+phosphor→med_1, fuel, lab, +enh) ; ram_scoop (fuel,
  EN TRANSIT dans un champ : récolte ∝ runPct contre usure ×2 / ×1,5
  enh) ; gravity_sling (engine, départ ≤ 8 pc : vitesse ×(1+runPct/2)
  contre dégâts ∝ runPct, ratio enh meilleur) ; fab_bay (acc,
  auto-réparation 1 %/h × runPct au steel de soute + fuel, +enh).
- PARQUÉS (motifs) : probe_cradle (transport/lancement de sondes =
  chantier propre), beacon_transponder (politiques P4),
  gyro_stabilizers (l'usure d'atterrissage n'est pas implémentée),
  fermentation_vats (pas de système de péremption).

Découpage d'exécution : W9b moteur d'actifs + électrolyseurs +
vivarium ; W9c familles partagées (slot pools) ; W9d passifs (19 × 2
grades, effets branchés) ; W9e actifs restants ; W9f TOUR
D'ÉQUILIBRAGE (simulation, BALANCE_LOG).

## 2026-07-22 — W9b (serveur) livré : moteur d'actifs, électrolyseurs, vivarium

Conforme à la spec validée du jour : défs partagées (CONVERSIONS,
conversionOf avec grades enhanced ×1,5, isValidRunPct pas de 5),
migration 036, service setConversion/settleConversion (patron W3 :
règlement au bord conversion_edge + pro-rata ; batch sacrifié au
lancement, refus si la soute ne couvre pas la production totale —
1 conteneur = 1 T oblige les grosses électrolyses sur coques M/L,
cohérent ; starvation intrant/carburant → 0 % automatique ; continu à
horizon 24 h-jeu [TUNE]), carburant de fonctionnement au réservoir
(type moteur), route API, vue flotte, timeScale injecté au worker.
ENHANCED : fabricatorMinLevel 3 branché (coût ×2, débit ×1,5, grade
figé à la fabrication).

Preuves : shared 6 ; conversions.test 5/5 (×3) ; balayage sériel
343/345 (census ×2 = flaky R5) ; unit 55 ; build vert. RESTENT
(annoncés) : UI de bord + E2E/captures — suite immédiate.

## 2026-07-22 — Décision responsable (À FAIRE APRÈS, notée pour mémoire) : reprise des ateliers de réparation

Le responsable fige, pour un chunk ULTÉRIEUR (après le programme W9 en
cours) :
- Réparation au sol (workshop) : il faut être DOCKÉ SUR UNE PLANÈTE et
  payer en STEEL LÉGER OU STEEL LOURD (aujourd'hui : steel_l implicite
  à 0,1 T/HP — le choix léger/lourd et son barème sont à trancher à
  l'implémentation [TUNE à proposer : steel_h plus efficace par tonne]).
- Le CRUSADER ne pouvant pas docker, SA voie de réparation est
  l'accessoire ACTIF de réparation (fab_bay, catalogue W9e : 1 %/h ×
  runPct au steel de SOUTE + carburant).

## 2026-07-22 — W9b clos : UI de bord des actifs + E2E

Section « Active gear » par accessoire de conversion monté (throttle
par pas de 5 %, batch pour l'électrolyse, case inverse pour les
réversibles, état starved/batch restant affiché) ; E2E
conversions.spec : électrolyseur granté §15 + installé par les vraies
commandes, 1 T d'eau, réglage 50 % dans l'UI, sorties O2+H constatées
au bord, batch clos — VERT ; captures cv-01..02 observées. W9b [x].

## 2026-07-22 — VALIDÉ (responsable) : convertisseur de cells + NOUVELLE CLASSE « one-shot »

1. Nouvel accessoire ACTIF modulable : BRÛLE des fuel_cells pour
   générer du CARBURANT (type moteur) — la soute devient un réservoir
   compact pour les très grandes expéditions. (Catalogue : cell_cracker,
   à intégrer en W9e.)
2. NOUVELLE CLASSE validée : accessoires ACTIFS À USAGE UNIQUE —
   opération one-shot à TEMPS FIGÉ exigeant de RESTER À L'ARRÊT
   pendant toute la durée. Exemple canon du responsable : décompresser
   une fuel cell → 1 JOUR à l'arrêt → +50 fuel [TUNE temps/montants].
   L'arbitrage est CONTRE L'HORLOGE DE SURVIE de l'équipage (rester
   immobile coûte des provisions). Temps/montants à équilibrer (W9f).
   AMBIGUÏTÉ à trancher par le responsable : « usage unique » =
   l'OPÉRATION est one-shot (l'accessoire reste monté, relançable) OU
   l'ITEM est CONSOMMÉ à l'usage (vraie famille de consommables) — les
   deux lectures sont proposées ci-dessous.

## 2026-07-22 — PROPOSITION (en discussion) : famille one-shot + gates des actifs W9e

Suggestions soumises au responsable pour la classe ONE-SHOT (temps
figé, à l'arrêt, arbitrage horloge de survie/immobilisation ;
chiffres [TUNE]) :
- cell_decompressor (fuelcell_plant) : 1 fuel_cell → 1 j → +50 fuel
  (type moteur) — l'exemple canon du responsable.
- cryo_stasis_pod (lab) : 12 h de mise en route → l'horloge de survie
  de l'équipage est GELÉE 7 j (attente longue sans mourir) — le
  vaisseau reste inerte pendant le gel.
- jump_primer (shipyard) : 1 j de charge → le PROCHAIN trajet part à
  vitesse ×1,5 (one-shot, perdu si non utilisé sous 3 j).
- deep_scan_pulse (research_center) : 12 h → un instantané d'intel L3
  d'UN corps sous scan (sans télescope).
- hull_patch_kit (workshop) : 12 h → +25 % des HP max rendus, sans
  atelier ni steel — le pansement de campagne.
- kedge_winch (spaceport) : 1 j → treuille la coque de 5 pc SANS
  carburant (sortie de panne sèche en zone morte).
Gates PROPOSÉS des actifs W9e restants [interp à confirmer] :
arc_furnace→smelter, ram_scoop→refinery, gravity_sling→shipyard,
fab_bay→workshop, cell_cracker→fuelcell_plant (validé ce jour),
med_synth→lab (déjà figé).

## 2026-07-22 — VALIDÉ (responsable) : taxonomie DÉFINITIVE des accessoires

Correction et cadre définitif (amende le W9b livré) :
1. PASSIFS — petit avantage permanent, aucun réglage.
2. ACTIFS CONTINUS — vivarium ET ÉLECTROLYSE (correction : les deux
   sont CONTINUS) : ne nécessitent PAS d'arrêt (fonctionnent partout),
   modulables (pas de 5 %), mais MOINS EFFICIENTS car ils BRÛLENT
   activement du carburant ; intrants consommés au fil de l'eau depuis
   la soute ; starvation → 0 %.
3. ACTIFS BATCH — intrants CONSOMMÉS À L'ACTIVATION, nécessitent
   L'ARRÊT et un TEMPS DE PROCÉDÉ figé (le navire reste en survol/
   arrêt, immobilisé pendant le procédé), mais PLUS EFFICACES : les
   accessoires batch NE BRÛLENT PAS de carburant (seul le drain normal
   de survol du navire court). Pas de throttle : une opération = temps
   figé, entrées→sorties figées. Exemple canon : décompresser 1
   fuel_cell → 1 jour → +50 fuel. (Résout l'ambiguïté A/B : lecture A,
   opération one-shot, l'accessoire reste monté.)
4. Le CATALOGUE se conçoit AUTOUR de cet axe : mêmes conversions
   déclinables en PAIRES continu-mobile-gourmand vs
   batch-immobile-efficace [TUNE ratios] — l'arbitrage cœur du jeu
   (mobilité vs efficience vs horloge de survie).

Refactor immédiat requis sur W9b : electrolyzer/_l2 passent CONTINUS
(eau tirée de la soute au fil de l'eau) ; la mécanique batch est
réaffectée à la classe BATCH (arrêt + immobilisation + temps figé +
zéro carburant) avec cell_decompressor comme premier item (validé).

## 2026-07-22 — Refactor W9b livré : taxonomie définitive appliquée

Électrolyseurs passés CONTINUS (eau de soute au fil de l'eau,
carburant brûlé, starvation → 0 % — prouvé) ; classe BATCH réaffectée :
intrants à l'activation, arrêt exigé + immobilisation (moveShip
refuse), temps de procédé figé, ZÉRO carburant, sortie `fuel` créditée
au réservoir du type moteur (bornée au réservoir effectif) ; abandon =
intrants perdus [interp annoncée] ; cell_decompressor livré (1 cell →
24 h → +50 fuel ; enhanced ÷1,5) ; cell_cracker (continu) au catalogue
W9e. UI Start/Abort pour les batch. Preuves : shared 7 ;
conversions.test 7/7 (×3) ; balayage sériel 347/347 ; E2E adapté
vert ; build vert.

## 2026-07-22 — W9c livré : familles de slots partagées

Helpers purs slotFamilyUsage/canFitGear (un upgrade remplaçant un
niveau inférieur ne coûte pas de slot supplémentaire ; capacité =
HULLS.slots par famille) branchés dans installGear — l'arbitrage
upgrade-vs-accessoire est effectif. GEAR_CATALOG.md créé : le
catalogue COMPLET fait foi (statuts ✔/⏳/💬, gates, std/enhanced) ; le
TABLEAU FINAL sera livré au responsable à la clôture de W9. Preuves :
shared items 5 ; gear.test 10/10 (×3) ; balayage sériel 347/347 ;
build vert.

## 2026-07-22 — Rationales détaillées des 9 items 💬 (exposées au responsable)

Explications données pour validation (résumé) : cryo_stasis_pod (gèle
l'horloge de survie 7 j contre inertie totale — cible assise en P5) ;
jump_primer (×1,5 le prochain trajet, charge périmable 3 j, slot
engine en concurrence avec upgrades/trim_vanes/course_optimizer) ;
deep_scan_pulse (instantané L3 qui VIEILLIT, jamais L4, 12 h statique) ;
hull_patch_kit (+25 % HP sans steel ni atelier — générosité à trancher
en W9f, patch en plein champ partiellement auto-consommé) ;
kedge_winch (5 pc/j sans fuel, utilisable échoué — pari de survie) ;
electrolysis_vat (+10 % rendement, zéro fuel — le choix
mobilité/efficience) ; hydroponic_run (gate FARM — spécialisation
planétaire) ; smelting_run (immobilisé AU-DESSUS du champ de junk qui
mord — synergie ballast_shielding) ; apothecary_still (logistique
médicale hors réseau). Colle du système : horloge de survie pendant
les batch, slots de famille partagés (W9c), gates dispersés = marché
d'items, enhanced ÷1,5.

## 2026-07-22 — VALIDÉ (responsable) : « go pour tout » — les 9 items 💬 + amendements

1. cryo_stasis_pod : VALIDÉ avec amendements — (a) RÉVEIL RAPIDE à la
   demande : 10 minutes ; (b) version L2 AVEC AUTOPILOTE : voyage en
   restant en cryo (longues expéditions exodiques), durée d'autopilote
   CHOISIE par le joueur et IMPOSSIBLE à réveiller pendant ; (c) le
   VIEILLISSEMENT est arrêté aussi (L1 et L2) — équipage/cohortes à
   bord ne vieillissent pas pendant le gel.
2. jump_primer : AMENDÉ — charge à durée LIBRE (min 1 h, max 10 j),
   le boost (vitesse ×1,5) dure 3 × LE TEMPS DE CHARGE (remplace la
   péremption fixe).
3. deep_scan_pulse : validé tel quel.
4. hull_patch_kit : validé + 1 T de steel SYMBOLIQUE consommée.
5. kedge_winch : validé + MODE BOOST — lancé avec MOINS DE 1 fuel
   restant : tout est brûlé d'un coup et la coque DRIFTE à 10 pc/j
   (au lieu de 5).
6–9. electrolysis_vat, hydroponic_run, smelting_run, apothecary_still :
   validés tels quels. → GO pour TOUT le catalogue (plus aucun 💬).

Note d'implémentation W9d persistée : trim_vanes exige la pénalité de
charge loadFrac (DG §8.2, jamais implémentée) — elle sera LIVRÉE avec
W9d (speedEff = v×(1−0,15×loadFrac), burnEff = b×(1+0,5×loadFrac),
loadFrac = conteneurs utilisés/conteneurs) : canon DG, pas une invention.

## 2026-07-22 — W9d partie 1 livrée : catalogue des 19 passifs + helpers

GEAR passe à 51 accessoires (19 passifs × 2 grades ajoutés, familles
fuel/obs/armor/engine/cargo/accessory, gates thématiques — ItemSlot
étendu à cargo) ; passives.ts : les 19 effets en fonctions PURES
testées, dont loadFracPenalty (la pénalité de charge DG §8.2 sera
livrée avec trim_vanes en partie 2 — canon, pas une invention).
Preuves : shared 207 ; balayage sériel 345/347 (census R5) ; build
vert. Partie 2 : câblage des 19 effets + tests d'intégration.

## 2026-07-22 — W9d partie 2 livrée : les 19 effets passifs câblés + Codex « Ship gear »

Câblage exhaustif dans les systèmes réels (aucun sous-ensemble
silencieux, règle de complétude) : shipDrain (heat_recycler,
solar_sails survol GRATUIT à ≤8/15 pc d'une étoile — vérif SQL,
ballast_shielding, flare_dampers via radiativeWearMult ajouté à
hullWearPerDay, bilge_purifier, cryo_larder, escape_thrusters) ;
ships.ts (docking_clamps, mooring_winch, provisions ×cryo_larder,
cargo_netting partout — charge/vue flotte/conversions —, berth_module,
moveShip : loadFracPenalty DG §8.2 LIVRÉE + trim_vanes +
course_optimizer) ; world.ts (signal_mirror en CASE jsonb,
survey_suite palier d'intel) ; stargates (stargate_caller), junk
(salvage_grapnel, ore_hopper), market (haggler_matrix).

Porte Codex (DoD §17) : les écrans d'équipement (W9a–c) n'avaient PAS
de chapitre — dette soldée : chapitre « Ship gear » (fabrication et
grades figés, 3 tempéraments passif/continu/batch, démontage/
désassemblage), spoiler-free (aucun item énuméré — le système, pas la
carte), chiffres LIVE via CODEX_FACTS (nouvelles constantes nommées
RUN_PCT_STEP, ENHANCED_FABRICATOR_LEVEL — anti-dérive testé) ;
deep-link GalaxyMap → Ship gear ; codex.spec E2E mis à jour.

Annoncé : stargate_caller et haggler_matrix n'ont pas de fixture
d'intégration dédiée — multiplicateur unit-testé, appliqué au site de
paiement UNIQUE (stargates.ts / market.ts), flux couverts par les
suites existantes. Incident environnement : seed idempotent en échec
sur dérive lazy de la démo (pyramide 347 vs pop 346,83) → resetDb
(autorisation responsable) ; API dev relancée avec API_PORT=8081.
game/JOURNAL.md égaré (piège cwd, 3ᵉ occurrence) supprimé — doublon
strict d'entrées déjà au JOURNAL racine.

Preuves : passives.test intégration 8/8 ; balayage sériel 353/355
(census ×2 = flaky R5 connu, passe seul — l'échec api du 1ᵉʳ passage
ne s'est pas reproduit au 2ᵉ) ; shared 207 ; codex client 10/10 ;
E2E codex 1/1 avec capture codex-07 OBSERVÉE (nav 5 chapitres, prose,
warn batch, règle exacte 6 h) ; typecheck vert.

## 2026-07-22 — W9e partie 1 livrée : les 9 actifs « recette »

Moteur de conversion étendu aux sorties SPÉCIALES, pour les deux
modes : `fuel` (unités du type moteur créditées AU RÉSERVOIR, bornées
à la capacité effective — le plein est un bord : starvation → 0 % en
continu, excédent perdu en batch) et `hp_pct` (% des HP MAX réparés,
borné au plein — même sémantique de bord). scheduleContinuousEdge
planifie ces bords (réservoir plein, coque pleine).

Livrés : cell_cracker (0,1 cell/h à 100 % → 40 u/cell < 50 du batch —
la soute devient réservoir des grandes expéditions), arc_furnace
(2 junk → 1 steel_l, 5 réf/h), med_synth (1 eau + 0,5 phosphore →
1 med_1 — bi-intrant : le premier intrant épuisé starve), fab_bay
(1 %/h × runPct, 0,5 T steel_l/% + 1 u fuel/h) ; batch +10 % :
electrolysis_vat, hydroponic_run, smelting_run, apothecary_still,
hull_patch_kit (1 T symbolique → +25 % HP max). GEAR : 69 accessoires
(× enhanced). Tous chiffres [TUNE] jusqu'à W9f.

Corrections de tests induites : conversions.test « actif inconnu »
utilisait arc_furnace (désormais réel) → clé fictive ;
items.test EXHAUSTIF étendu aux 18 clés nouvelles.

Preuves : shared 209/209 ; actives.test 6/6 ; conversions.test 7/7 ;
balayage sériel 358/361 (census ×2 flaky R5 connu + la garde corrigée
depuis) ; E2E conversions 2/2 dont batch UI hull_patch_kit — captures
cv-03/cv-04 OBSERVÉES (procédé affiché avec échéance, acier débité
0/3, abandon disponible, coque 80/80 bornée au plein) ; typecheck ×3.
L'UI Active gear (générique via conversionOf) couvre les 9 nouveaux
actifs sans modification — le chapitre Codex « Ship gear » (W9d)
décrit déjà les trois tempéraments, aucun contenu non découvert
ajouté.

Partie 2 à suivre : ram_scoop et gravity_sling (couplés au
déplacement), jump_primer (charge libre → boost ×1,5 pendant 3× la
charge), kedge_winch (+ mode boost drift), deep_scan_pulse (instantané
d'intel L3), cryo_stasis_pod (gel survie+vieillissement, réveil
10 min, L2 autopilote).

## 2026-07-22 — W9e partie 2 livrée : les 6 actifs de déplacement/temps — CATALOGUE COMPLET

Interprétations v1 ANNONCÉES (chiffres [TUNE] → W9f) :

- STANCES : ram_scoop et gravity_sling sont des continus à débit NUL —
  le throttle est un réglage persistant lu par moveShip, pas un flux de
  soute. La récolte/l'usure du ram_scoop se règlent AU DÉPART (comme le
  pré-brûlage) : géométrie segment-disque exacte des champs du TYPE
  MOTEUR sur la trajectoire (+0,5 u/pc × runPct au réservoir borné ;
  usure 0,5 HP/pc ×2, enhanced ×1,5, plancher 1 HP).
- gravity_sling : fenêtre de 8 pc au DÉPART seulement ; ×(1+runPct/200 %)
  sur tout le trajet ; 10 HP × runPct au lancement (enhanced ÷2).
- jump_primer : la charge est un batch à durée LIBRE (paramètre `hours`,
  1 h–240 h) ; au terme, l'état devient un BUFF (`boostUntilMs`) qui ne
  bloque plus la coque ; un bord de nettoyage est planifié à
  l'expiration. Boost ×1,5 appliqué au DÉPART pour tout le trajet.
  Enhanced : durée de boost ×1,5 (donc ×4,5 la charge).
- kedge_winch : cible (x, y) obligatoire, coque en espace (jamais à
  quai) ; au terme la coque est déplacée de 5 pc (10 en boost) VERS la
  cible, bornés à la distance restante ; abandon = temps perdu, rien à
  rendre. MODE BOOST : lancé avec < 1 u — le réservoir est vidé d'un
  coup à l'activation.
- deep_scan_pulse : cible = le corps SOUS SCAN (shipScanPc, signal_mirror
  compris) le plus proche, FIGÉ à l'activation ; au terme, un instantané
  L3 est PERSISTÉ (migration 037, table player_body_intel) et sert de
  PLANCHER dans bodyIntel — v1 : la connaissance acquise ne se périme
  pas.
- cryo_stasis_pod : la stase gèle la SURVIE (survival_rate 0, réarmée au
  réveil) ; le vieillissement n'existe pas mécaniquement pour les
  équipages PNJ v1 — le gel du vieillissement est donc satisfait à vide
  et documenté (le jour où un vieillissement d'équipage naît, la stase
  doit le geler). « Abandonner » une stase L1 = RÉVEIL en 10 min
  (toujours gelé pendant) ; L2 (enhanced) = autopilote : durée choisie
  (`hours`, ≤ 100 j), moveShip AUTORISÉ en stase (seule exception à
  l'immobilisation batch), réveil REFUSÉ avant le terme.

UI : champ « Duration (game-hours) » (primer, cryo L2), cibles X/Y
(kedge), état « Jump boost — until », bouton « Wake (10 min) » (cryo),
statut « waking ». API : `hours` et `target` sur POST /ships/:id/conversion.

Preuves : actives2.test 7/7 (sling vitesse+dégâts, scoop crédit net +
usure exacte 2×fieldR, primer garde durée + boost ×1,5 mesuré à
l'arrivée, kedge 5 pc / boost 10 pc + réservoir vidé, cryo L1 gel +
réveil + réarmement, cryo L2 voyage en stase + irréveillable, deep scan
tier 3 persisté servi sans présence) ; balayage sériel 368/368 (census
compris ce passage) ; E2E conversions 3/3, captures cv-05/cv-06
OBSERVÉES (champ durée, boost armé avec échéance) ; typecheck ×3.

LE CATALOGUE EST COMPLET : GEAR_CATALOG.md tout ✔ — 24 passifs,
9 continus (dont 2 stances), 10 batch, × grades enhanced (91 clés
GEAR). Reste W9f (tour d'équilibrage) avant de figer les [TUNE] et de
livrer le TABLEAU FINAL au responsable.

## 2026-07-22 — W9f livré : Round 11 d'équilibrage du catalogue (BALANCE_LOG)

Premier round à tourner DIRECTEMENT sur les constantes expédiées :
`tools/balance/gear_v1_sim.mjs` importe `@atg/shared` dist — zéro
proxy python, zéro dérive possible. Sept batteries (portée
d'expédition, traversée ram_scoop, parité acier/HP des réparations,
temps net du jump_primer, prix du jour gagné de la fronde, débit
batch vs continu, endurance de survol).

PATCH 11-1 (seul défaut confirmé) : RAM_SCOOP.wearHpPerPc 0,5 → 0,1 —
à 0,5, 60 pc de champ coûtaient 75 % de la coque d'un cargo_s pour
30 u (ratio valeur 0,10 au tarif atelier). À 0,1 : 15 % cargo_s /
3 % cargo_l, ratio 0,50/0,67 — prime d'assurance, plus un piège.
Vérifiés sans patch : jump_primer = convertisseur de temps mort
(+0,5 × charge seulement si le trajet consomme le boost — règle
joueur : charge ≈ D/(4,5 × vitesse)) ; fab_bay 6,3× le sol sur
cargo_s par CONCEPTION (voie Crusader) ; hull_patch_kit 0,10× le sol
sur cargo_l (canon responsable « 1 T symbolique », surveillé) ;
asymétrie batch/continu réelle (rendement 0,55 vs 0,50, débit ÷5,5) ;
cell_cracker ×3–3,4 de portée ; passifs sains. Les autres [TUNE]
sont FIGÉS v1 (GEAR_CATALOG fait foi).

Preuves : sim rejouée après patch (ratio B 0,50/0,67) ; actives2 7/7
et shared 210/210 rejoués sur la constante patchée (les assertions
lisent les constantes) ; balayage sériel 368/368 avant patch.

## 2026-07-22 — W9g livré : la réparation d'atelier se paie en acier léger OU lourd

Décision responsable (2026-07-22, persistée à l'annonce) : réparation
au sol = coque DOCKÉE (déjà canon) payée en steel léger OU lourd ; le
Crusader, qui ne docke jamais, passe par fab_bay (livré en W9e).
Barème PROPOSÉ (à valider) : léger 0,1 T/HP (inchangé), lourd
0,05 T/HP — l'acier lourd est le métal dense de tier supérieur, ÷2 de
tonnage. Ordre : léger d'abord, le lourd couvre le manque ;
tout-ou-rien conservé via une consommation normalisée en équivalent
léger (production.ts). Constante REPAIR_STEEL_H_T_PER_HP dans
wear.ts ; DG §8.7 consolidé ; Codex (chapitre Buildings, workshop)
mis à jour dans le même commit (porte DoD).

Preuves : repair.test 7/7 (nouveau cas : léger à sec + 20 T de lourd →
réparation SERVIE, lourd débité −9,6 T/j, léger intact ; les deux à
sec → arrêt ; restauration → reprise) ; balayage sériel 369/369 ;
codex client 10/10 ; typecheck vert.

## 2026-07-22 — W8e : plan de découpage PERSISTÉ (avant code, CLAUDE.md §5)

Objectif (MASTER_PLAN W8, validé en bloc 2026-07-21) : le Crusader
FABRIQUE TOUT — ADN complet, usines L3 avec usinage partiel D'OFFICE,
3 warehouses L3, PAS de markets. Découpage :

- **W8e-1 — Items à bord** : migration 038 (`work_orders.body_id`
  nullable + `ship_id` FK ships avec CHECK l'un-ou-l'autre ;
  `ships.crusader_items` jsonb, carte clé→compte) ; `fabricateGear`
  accepte le Crusader — ADN complet ⇒ TOUT hôte réputé actif L3
  (grades enhanced fabricables d'office), balance d'items de bord =
  itemCapacity([3,3,3]) = 450, usinage partiel D'OFFICE (work-order
  payé par paliers de 5 % sur `crusader_stock`) ; handlers work_step /
  item_fabricated appris du bord ; PAS de fabrication à la commande à
  bord (les usines L3 sont d'office). Tests intégration.
- **W8e-2 — Pipeline d'équipement à bord** : install/uninstall/
  disassemble pour les coques DOCKÉES AU Crusader (status docked +
  follow_ship_id), items tirés de/rendus à `crusader_items`, coût
  d'installation payé au stock de bord, immobilisation 12 h inchangée.
  Tests intégration (§10 compris).
- **W8e-3 — Coques à bord** : `buildShip` sur le Crusader (shipyard de
  l'ADN complet) — usinage partiel d'office, coût au stock de bord,
  coque née DOCKÉE au Crusader si un dock de sa taille est libre,
  sinon en survol à ≤ 1 pc [interp annoncée]. Tests intégration.
- **W8e-4 — UI + E2E + clôture** : panneau Crusader (fabriquer, balance
  d'items, ordres en cours, installer sur coque amarrée), E2E complet,
  captures observées, MASTER_PLAN W8 → [x], PROD_MIGRATIONS 038, DAT.

Interps annoncées : (a) le stock de bord est une carte STATIQUE à ticks
quotidiens (crusader_daily) — les paliers 5 % débitent la carte
directement ; (b) capacité d'items de bord 450 [TUNE] ; (c) aucune
techno/DNA vérifiée à bord (ADN complet canon) ; (d) marché : aucune
surface de bord n'existe — le refus est structurel, prouvé par test.

## 2026-07-22 — W8e-1/2/3 livrés : le Crusader fabrique à bord (cœur serveur)

Conforme au plan persisté. Migration 038 (work-orders de bord :
body_id nullable + ship_id, CHECK cible ; ships.crusader_items).
Items : fabricateGearAboard — ADN complet ⇒ aucune gate d'hôte (tout
est réputé L3, enhanced d'office), usinage partiel D'OFFICE par
paliers de 5 % sur le stock de bord (payStepAboard — la carte statique
du bord, pas de lazy), FIFO STRICT par Crusader [interp annoncée],
starved/reprise auto, cap de balance 450 [TUNE]. Équipement à bord :
install/uninstall valent pour une coque AMARRÉE (docked +
follow_ship_id) — item/coût au bord, retour à la balance de bord,
désassemblage 50 % au stock si pleine ; NOUVELLES GARDES : moveShip et
undockFromCrusader refusent pendant un chantier d'équipement (au sol
la coque entreposée était déjà immobile — la garde générale profite à
tous). Coques : buildShipAboard (L3 d'office, tout moteur — l'outillage
W2 est réputé complet à bord [interp annoncée]) ; née AMARRÉE si dock
libre sinon ESCORTE ; plein 25 % au stock de bord (partiel annoncé) ;
hôte disparu au terme → production PERDUE (annoncé) ; PAS de
Crusader-de-Crusader (la migration de 25 % de population n'a pas de
source à bord — à arbitrer par le responsable si souhaité un jour).
Vue flotte : followShipId + fiche crusader {stock, items, pop}.

Preuves : crusader-fab.test 6/6 (enhanced d'office + paliers exacts,
starved/reprise, §10, install/uninstall de bord avec undock refusé,
naissance amarrée plein 25 %) ; balayage sériel 375/375 ; typecheck
vert. Restent W8e-4 : UI Crusader (dock/escorte/fabrication/
construction — AUCUNE UI crusader n'existe côté client), E2E (endpoint
de test spawn-crusader à ajouter, §15 chemin déterministe), captures,
clôture MASTER_PLAN W8.

## 2026-07-22 — W8e-4 livré : le Crusader jouable à l'écran — PROGRAMME W8 CLOS

UI (GalaxyMap) : panneau « Crusader — flying colony » (pop C/A/S,
stock et balance d'items EN DIRECT, fabrication sur tout le catalogue
GEAR — usinage d'office —, pose de quille) ; pour une coque voisine
(≤ 1 pc d'un de MES Crusaders) : Amarrage / Escorte / Appareillage,
et installation d'un item DEPUIS la balance de bord une fois amarrée.
API client : dockCrusader/hoverCrusader/undockCrusader,
fabricateAboard, buildShipAboard ; endpoint de test
/test/spawn-crusader (§15 — fixture E2E déterministe, la NAISSANCE
réelle reste prouvée par crusader.test).

Porte Codex : chapitre « Flying colony » — NOUVEAUTÉ d'architecture :
les chapitres peuvent déclarer `requires` et n'apparaissent dans la
NAV que si l'écran correspondant existe pour CE joueur (ici :
posséder un Crusader) — la règle spoiler-free s'applique à la LISTE
des chapitres, pas seulement au contenu (MANUAL_PLAN §3 amendé).
Chiffres live : cap 2 000, soute 800 T, migration 25 %, 400 emplois,
docks 6/6/6, balance 450 — anti-dérive testé (facts.test).

Preuves : typecheck ×3 ; codex client 23/23 ; E2E crusader.spec 1/1 —
captures cr-01..05 OBSERVÉES (panneau de bord avec stock/balance,
item en balance, amarrage, quille « Dinghy » posée — stock débité en
direct 340/105/50 —, chapitre Codex complet) ; E2E codex.spec vert
inchangé (le chapitre est INVISIBLE sans Crusader) ; balayage sériel
374/375 — pods.test échoue en sweep mais passe seul (6/6) :
contamination inter-fichiers, même famille que census R5, consigné au
Programme R.

Le PROGRAMME W8 est CLOS (MASTER_PLAN W8 → [x]).

## 2026-07-22 — R5 corrigé à la racine : les flaky de sweep census/pods

Diagnostic (enfin) : ce n'était PAS du lazy ni de l'ordre — census est
GLOBAL PAR CONCEPTION (DG §11.5 : totaux de tout l'univers), et les
prix des pods en dérivent. Les tests posaient des assertions ABSOLUES
(« gold = 19 ») dans une base PARTAGÉE entre 49 suites : toute suite
laissant de l'or (p.ex. les fixtures de fabrication) décalait le total
(le fameux +42 = 40 d'or de conversions.test + 2 de taux), et le
barème des pods gonflé par les stocks des autres suites rendait le
stock d'ore de la fixture insuffisant en plein top-up du cap.

Correctifs SANS affaiblir les contrats : census.test neutralise l'or
de SON starter, prend un census de BASELINE puis assert le DELTA exact
(+12 stock lazy, +7 soute, +19 total) et l'API compare à la valeur
GLOBALE relevée ; pods.test surdimensionne le stock d'ore du test de
cap (le contrat est le CAP quotidien, pas le prix du moment — les
tests de PRIX restent absolus et propres dans leur univers).

Preuves : census+pods seuls 9/9 ; balayage sériel COMPLET 375/375
deux fois de suite (premier sweep 100 % vert de l'histoire du dépôt
depuis l'apparition du flaky).

## 2026-07-22 — R2 livré : les caps maxInstances appliqués aux 14 singles

La table single/multiple validée (2026-07-20) vivait dans le Codex et
la garde `maxInstances` de placeBuilding n'était branchée que sur
telescope et clinic. R2 : les 12 autres singles reçoivent
`maxInstances: 1` dans le canon partagé (workshop, residential, lab,
obs_station, research_center, diplomatic_district, casino,
commerce_district, faction_hq, stargate_yard, terraformer,
artificial_planet_yard) — la garde existante (refus AVANT la tuile,
« max 1 » annonçable même monde plein) s'applique désormais à tous.
Anti-dérive : codexBuildings.test prouve Codex « single » ⟺
maxInstances 1 (toute divergence future casse) ; api.test prouve le
refus 409 max_instances sur un second workshop (fixture §15 : unlock
+ première instance SQL — la garde d'unlock passe AVANT le cap).
Niveau DB : pas d'index unique généralisé (le télescope garde le sien
de la migration 025) — garde service §10, annoncé.

Preuves : codex client 12/12 ; api.test 12/12 ; balayage sériel
375/375 (3e vert consécutif) ; resetDb + seed dev PASSENT (les seeds
ne posaient aucun single en double) ; typecheck vert.

## 2026-07-22 — R1 prouvé : le fold de la main de cartes

L'implémentation CSS du fold (tranche nommée 64 px, dépliage au
survol/focus-within/sélection, reduced-motion) existait depuis le
chunk AO — mais SANS preuve (statut [~] mérité). R1 livre les preuves
du contrat BACKLOG l.90 : E2E card-hand-fold.spec — espacement des
bords gauches = 64 px ±3 mesuré carte à carte, hauteur de cible
≥ 44 px, tranche NOMMÉE visible, dépliage par survol DE LA TRANCHE
(le centre d'une carte repliée est recouvert par la voisine — c'est
le contrat), premier-plan RÉEL prouvé par elementFromPoint au centre,
focus clavier déplie / le blur replie (focus-within maintient pendant
la traversée des boutons internes — voulu), reduced-motion : état
conservé, transition-property none, viewport plancher 1280×800.
Captures fold-01..03 OBSERVÉES (tranches TELESCOPE/PROBE PAD/DEPOT/
MINE au repos, FARM dépliée au premier plan avec coûts et Unlock).
Annoncé : géométrie non testable côté unit (client sans DOM-lib) —
computeCardStates reste couvert par CardHand.test. Aucun changement
de code UI dans ce chunk.

## 2026-07-22 — R6 quasi clos : captures §16 en souffrance produites

capture-sweep.spec (pile 8081) : halo/cercles de sélection d'une sonde
(V1) + panneau sondes (V2) + zoom galaxie −/+ — captures r6-01..03
OBSERVÉES (halo bleu autour de la sonde en survol, panneau Hull/Star
scoop/Land/Send ship, contrôle de zoom en bas de carte). V3 (chapitre
Codex) était déjà couvert par codex-01..07 (W9d) et cr-05 (W8e).
RELIQUAT ANNONCÉ : « key BuildingPanel » — le plateau est un canvas
PixiJS sans hook DOM cliquable ; le hook irait dans PlanetView.tsx,
GELÉ par le chantier @spec du responsable (« laisse pour le moment »).
R6 reste [~] avec ce seul reliquat, motif tracé au MASTER_PLAN.
La sonde de la fixture est construite par les VRAIES commandes
(grant §15 → probe_pad L1 → /probes) — aucun état fabriqué.

## 2026-07-22 — R4 partiel : univers saturé typé, spawn prouvé visuellement

Univers saturé : les trois branches d'épuisement de gen/spawn.ts
(poche de Fermi 512 essais, wild 64, starter bonus 64) levaient des
Error brutes → 500 opaque et joueur potentiellement fantôme. Désormais
SpawnSaturationError (exportée) → RegistrationError
'universe_saturated' dans registerPlayer (le ROLLBACK annule l'INSERT
joueur — prouvé) → 503 à l'API (indisponibilité de jeu, réessayer).
Test d'intégration avec MOCK DOCUMENTÉ (§15) : la saturation réelle
exigerait de remplir des centaines de milliers de pc² — le mock lève
la VRAIE classe depuis le vrai module (importOriginal), tout le reste
(transaction, vraie base, rollback) est réel.

E2E visuel du spawn : spawn-visual.spec — 350 exacts (STARTER_POP
importé), « Colony grace until » affiché, chip Technology DNA, main
des premiers pas non vide, guide « First steps — place a Mine »,
flotte de naissance (personnel + First hauler) ; captures sp-01/02
OBSERVÉES (monde S temperate, 350/2 600, ADN 4/26, 10 tuiles libres).
APPRIS en l'écrivant : la cap de pop affichée varie par monde
(popCap(size, quality) — 2 000 n'est PAS une constante d'affichage) ;
l'assertion ne porte que sur le 350.

Restent (R4) : gating staffing des non-industries — je ne le code pas
sans proposition validée : il CHANGE la boucle du joueur (staffer ses
télescopes/cliniques pour qu'ils fonctionnent) — proposition à
formuler ; scan riche des sondes ; intel vaisseaux L1/L2/L3.

## 2026-07-22 — R4 : constat scan riche, repointage intel vaisseaux, PROPOSITION gating staffing (NON VALIDÉE)

Constats d'inventaire : (a) le « scan riche des sondes (ADN/gisements,
intel scientifique) » listé en R4 est DÉJÀ livré — le chunk Q
(projection d'intel par liste blanche) expose au palier 4 les
gisements chiffrés (remainingT/initialT/dryAt) et le techDna, la sonde
sur site donne le deep sight et la source scientifique son +1 —
intel.test le prouve depuis lors ; la ligne datait d'avant Q et était
périmée. (b) l'« intel des VAISSEAUX L1/L2/L3 » présuppose les
upgrades obs — DORMANTS jusqu'au combat par décision (W6) : repointé
vers P5, rien à coder avant leur réveil.

PROPOSITION (à valider par le responsable — RIEN n'est codé) :
gating fonctionnel des non-industries par staffing. Deux options :

- **Option A (seuil binaire)** : la FONCTION d'un bâtiment
  non-industriel exige workforce ≥ 50 % de jobsOptimal [TUNE] — en
  dessous, le bâtiment reste « active » pour la démographie (postes,
  Ē, natalité) mais sa fonction est COUPÉE. Simple à lire en jeu
  (badge « understaffed »), pas de dégradé à équilibrer.
- **Option B (continu)** : la fonction est MULTIPLIÉE par e(u) (la
  cloche existante) — un télescope à moitié staffé voit moins loin,
  une clinique réduit moins. Plus riche, mais chaque fonction devient
  un chiffre à équilibrer (W9f-bis).

Portée EXHAUSTIVE si validé (fonction par bâtiment) : telescope
(scope), clinic (réduction), workshop (réparation + hôte de
fabrication), warehouse (balance d'items + redéploiement), spaceport
(accueil des docks), shipyard (construction), probe_pad (cap de
production), lab/research_center/obs_station/smelter/refinery/
fuelcell_plant/waterworks-hôtes (gates de fabrication GEAR),
depot (bonus de stockage), market/commerce_district (négoce),
residential (EXEMPT proposé — la natalité passe déjà par Ē),
stargate_yard (chantier de gate), casino/diplomatic_district/
faction_hq (effets P4 — dormants). Impact joueur : il faut STAFFER
ses bâtiments de service, pas seulement ses usines — c'est un
changement de boucle, d'où l'arbitrage demandé.

## 2026-07-22 — W6c-b : plan de chunk PERSISTÉ (acheminement d'items par cargo)

Reste validé de W6 (« achat/acheminement par cargo — marché des
items »). Découpage :

- **W6c-b1 — ACHEMINEMENT (ce chunk)** : migration 039
  (`ships.item_cargo` jsonb, liste de clés d'items) ; un item en soute
  occupe UN conteneur [TUNE-v1 : objet discret, DG §7 étendu] — toutes
  les capacités passent par un helper partagé
  `containersUsedTotal(cargo, itemCargo)` (chargement fongible,
  sorties de conversions, vue flotte) ; commandes LOAD (coque DOCKÉE
  sur un monde possédé : une ligne planet_items → la soute ; ou
  AMARRÉE à un Crusader : crusader_items → soute) et UNLOAD (inverse,
  refus balance pleine — le fret ne force jamais un désassemblage) ;
  API + client + UI (panneau vaisseau : soute d'items ; charge depuis
  le panneau) ; tests intégration + E2E.
- **W6c-b2 — MARCHÉ des items (PROPOSITION non validée, à arbitrer)** :
  v1 proposé = le canal MANUEL étendu aux items (offre « je donne
  l'item X contre N tonnes de Y » épinglée au vaisseau à quai, TTL
  48 h, patron manual_offers existant) — les marchés fongibles (taux,
  AMM) ne savent pas porter du non-fongible sans dénaturer leur
  contrat. RIEN n'est codé avant validation.

## 2026-07-22 — W6c-b1 livré : l'acheminement d'items par cargo

Conforme au plan persisté — avec une DÉCOUVERTE de canon : DG §7
spécifiait DÉJÀ « 1 container = 1 T of one fungible, or 1 LARGE
ITEM » — la règle « un item = un conteneur » n'est pas une interp,
c'est le canon qui attendait son implémentation. Migration 039
(ships.item_cargo) ; helper partagé containersUsedTotal(cargo,
itemCargo) branché sur LES 18 sites de capacité (chargement fongible,
marchés taux/AMM/route, canal manuel, auto-trade, scoop de junk,
sorties de conversions continues ET batch, pénalité de charge DG §8.2
au départ — un item PÈSE) ; loadItemCargo/unloadItemCargo (à quai
d'un monde possédé : lignes planet_items ; amarré à un Crusader :
balance de bord ; balance pleine → REFUS — le fret est un choix
d'entrepôt, jamais une perte) ; API + client + UI (« Item hold »,
sélecteur de chargement, compteur incluant les items).

Preuves : item-cargo.test 4/4 (dont : 1 item + 2 T = 3/3 → la 3e
tonne fongible ET le 2e item refusés — la capacité est bien TOTALE) ;
balayage sériel 380/380 ; E2E item-cargo.spec 1/1 — warehouse bâti
par les VRAIES commandes (unlock depot→warehouse, 409 toléré sur le
pré-déverrouillé), captures ic-01/02 OBSERVÉES (« Cargo hold — 1/3 »,
« Item hold : cargo netting », toasts) ; typecheck ×3. Leçon
d'environnement : migration 039 à appliquer à la base dev AVANT
l'E2E (pnpm migrate — le message d'erreur PG l'a dit tout net).

## 2026-07-22 — W6c-a : PROPOSITION arbre ADN des accessoires (NON VALIDÉE) ; W7-bâtiments : plan de chunk PERSISTÉ

**W6c-a (proposition, rien à coder sans décision)** : le v1 en vigueur
gate la fabrication d'un accessoire sur la PRÉSENCE ACTIVE du bâtiment
hôte (et son niveau pour les grades enhanced) — simple et lisible.
L'« arbre ADN dédié » envisagerait des nœuds de recherche PROPRES aux
accessoires (déblocage par monde, coût de recherche, prérequis entre
accessoires). Avis : le gain de profondeur est réel mais le coût de
lisibilité aussi (deux arbres à comprendre) ; le v1 met déjà un VRAI
coût d'accès (bâtir et alimenter l'hôte). Recommandation : GARDER le
v1 et n'ouvrir l'arbre dédié que si l'équilibrage (usage réel des 43
accessoires) montre un besoin de gating plus fin. À trancher.

**W7-bâtiments (plan de chunk, à coder maintenant)** : étendre
l'usinage partiel aux BÂTIMENTS — sur un monde à industrie L3 active,
placement ET montée de niveau basculent en work-order (20 paliers de
5 %, rien d'avance) au lieu du paiement à la commande :

- migration 040 : CHECK de work_orders étendu à kind 'building' ;
- workStep : terminal 'building' → construction_complete existant
  (naissance par la voie actuelle, exactement-une-fois) ; chaque
  palier payé INCRÉMENTE config.investedPaid du bâtiment (PATCH 10-4 :
  la démolition ne rembourse QUE le réellement-payé — un ordre en
  cours ne doit jamais gonfler le remboursable) ;
- placeBuilding/levelUpBuilding : branche L3 (pas de payCost,
  completes_at indicatif, ordre créé) ;
- demolishBuilding : ANNULE l'ordre en attente du bâtiment (les
  paliers déjà payés restent dans investedPaid → remboursés à 50 %) ;
- tests intégration (pas d'avance, paliers débités, starved/reprise,
  activation au 20e, démolition en cours d'ordre, levelup partiel) ;
- Codex (porte) : phrase « partial machining » au chapitre Buildings.

## 2026-07-22 — W7-bâtiments livré : l'usinage partiel s'étend au génie civil — W7 CLOS

Conforme au plan persisté. Migration 040 (CHECK kind + 'building') ;
placeBuilding/levelUpBuilding basculent en work-order sur monde à
industrie L3 (rien d'avance, completes_at indicatif) ; le handler
work_step CUMULE config.investedPaid à CHAQUE palier payé (PATCH
10-4 : un ordre en cours ne gonfle JAMAIS le remboursable — prouvé :
chantier affamé réapprovisionné de 5 paliers puis démoli → 50 % de
CES 5 paliers seulement) ; demolishBuilding annule l'ordre ; le
terminal reste construction_complete (naissance par la voie
existante) avec une MARGE d'1 s (20 arrondis de palier vs indicatif).
Interps annoncées : (a) la montée de LA SEULE usine L3 du monde crée
un ordre sans usine porteuse (factory_building_id NULL — pas de FIFO,
paliers payés quand même) ; (b) un bâtiment démoli pendant son ordre
tue l'ordre au palier suivant (garde du handler).

Porte Codex : paragraphe « partial machining » au chapitre Buildings
(couvre AUSSI rétroactivement les coques/items du cœur W7 — dette de
gate du 2026-07-21 soldée).

Preuves : building-partial.test 2/2 ; balayage sériel 382/382 ;
codex client 12/12 ; typecheck ×3 ; migration 040 appliquée à la
base dev. LE PROGRAMME W7 EST CLOS (MASTER_PLAN → [x]).

## 2026-07-23 — directive UI : gérer en ouvrant l'objet, command deck icon-first

Le responsable juge les écrans de gestion actuels trop textuels, en
particulier le panneau vaisseau. Décision persistée AVANT code dans
`docs/DESIGN_SYSTEM.md` v1.1 (§5.1) et `docs/BACKLOG.md` P0.3 :

- toutes les ressources d'un stock sont visibles avec leur icône et leur
  quantité (zéro compris), avec une variante compacte 14–16 px dans le ledger
  de stats ;
- toute ressource citée dans une route de production, un coût, un travail ou
  un rééquipage porte son icône ;
- un item fabriqué garde la même icône depuis sa recette jusqu'à son montage ;
  les arts finaux manquants utilisent un stub intentionnel par famille de slot,
  jamais une ligne de texte nue ;
- le warehouse s'ouvre en modal et matérialise ses balances S/M/L et items en
  grilles séparées ;
- sélectionner un vaisseau conserve les télémétries pratiques fuel/hull et
  leurs drains ; `Open hull` expose les conteneurs, accessoires/upgrades dans
  leurs vraies familles de slots et les stats ; sélectionner l'objet révèle
  ses actions ;
- la référence *UFO: Enemy Unknown* porte sur le geste et la densité de la
  salle d'équipement (cases, sélection ambre, dossier d'action), sans copier
  sa peau. La charte ATG « groovy dark » reste souveraine.

Périmètre strict : les interactions de gestion choisir/installer/retirer/
détruire/activer/désactiver/utiliser/charger. Le reste des écrans ne change
pas. Accessibilité clavier, libellés complets, confirmations destructives et
géométrie stable des états vides restent des contrats de livraison.

## 2026-07-23 — P0.3 livré : stocks, warehouse et coques deviennent des objets manipulables

La directive icon-first est livrée sur les surfaces touchées. Le stock de
planète expose tout le catalogue (zéros inclus) avec icônes, quantités et
flux ; le ledger reprend les mêmes marques en 15 px. Les bâtiments montrent
les ressources de leur route au voisinage du nom, dans leurs recettes, coûts,
files et états de rééquipement.

Le warehouse s'ouvre désormais en command deck : sept familles d'items en
grilles denses avec cases vides persistantes, file de fabrication portant
l'icône de l'objet, réserves de véhicules S/M/L, sélection ambre et dossier
d'action. Le command deck de coque matérialise les capacités RÉELLES de
`HULLS`, les accessoires/upgrades montés, les conteneurs et la réserve locale ;
la sélection de l'objet ouvre les seules commandes légales. La télémétrie
fuel/coque et leurs flux reste visible dans la sélection rapide.

Correction de direction pendant la revue : l'image de baie générée ne doit
JAMAIS simuler l'UI ni le vaisseau. La plaque finale est un hangar physique
VIDE, sans menus, texte, cases ou silhouette, avec un berceau éclairé à
gauche. `shipSprite(hullCategory, hullSize)` est restauré comme couche live
séparée au-dessus. Ce contrat est ajouté à DESIGN_SYSTEM §5.1 : rails,
pinces et éclairage peuvent être peints ; slots, cargo, compteurs et
sélection restent de vrais contrôles DOM.

Porte Codex soldée (Buildings + Ship gear). Preuves observées à 1440×900 :
catalogue stock, stats compactes, warehouse peuplé (7 familles + fabrication
active), coque Cargo-S avec réserve locale ; console applicative 0 erreur
après authentification. Vérifications : typecheck client ; Vitest 24/24 ;
build Vite vert (seul avertissement de chunk historique).
