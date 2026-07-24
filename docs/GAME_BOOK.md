# ATG — Across The Galaxies · GAMEBOOK (canonical rules)

> **Status:** living document. This file is the single source of truth for game
> rules and architecture decisions. When a rule changes, edit it *here* so the
> canon never contradicts itself. Raw, dated decisions live in `JOURNAL.md`;
> this file is the reconciled result and can be rebuilt from that journal.
>
> Anything marked **(OPEN)** is not yet settled — do not treat it as canon.

---

## 0. Vision & philosophy

A space exploration, colony-management and inter-player commerce game.
Isometric planet views (Diablo × StarCraft feel) over a 3D-styled star field
(à la *Out There*). The design reaction to "gamified Ponzi" crypto games: **the
game is a real game first.** The chain is an optional export layer, never in the
gameplay hot path and never pay-to-win.

Core loop: **explore → open planets → manage finite resources & population under
efficiency pressure → trade with other players to get what your planets can't
produce.** Scarcity, logistics and diplomacy are the game.

---

## 1. Architecture (the split)

- **Postgres is the single source of truth** for 100% of gameplay: universe,
  planets, land, buildings, ships, NPCs, resources, routes, telescopes,
  visibility, chat, tolls, markets, missions. The **server is authoritative**.
- **The chain is an opt-in vault/passport** for non-fungible assets only. See
  §16. It is never read or written during normal play.
- The old approach — every planet/ship/building an ERC721 and a `GameEngine.sol`
  running logic on-chain — is **dropped**. It is why development stalled: you
  cannot run a real-time, tick-based simulation on-chain.

---

## 2. The universe

- **A single, global, persistent universe.** No rooms, no shards, no resets.
- **Space is a continuous 2D coordinate plane, rendered in a 3D style.**
  Navigation and interception are computed in 2D; depth is decorative.
- A ship may travel to **any Cartesian coordinate** in the known universe. The
  only limits are **fuel** and **survival stock** (see §6).
- **Isolation is emergent (the Fermi paradox).** New players spawn in a sparse
  pocket, far in graph/space distance from populated clusters. They cannot see
  or reach anyone until their telescope scope and routes grow. There is no
  special "starter zone" system — isolation is simply the default state of a
  fog-of-war universe.

---

## 3. Celestial bodies

- **Body types:** **inhabited planets** (owned/colonized), **uninhabited planets**
  (wild — must be **colonized** to become yours, §19), **stars/giants** (§22), and
  **artificial planets** (player-built, mobile space stations, §25).
- **Three landable planet classes: small, medium, large.** Class is intrinsic to
  the planet (it is *not* derived from tile count).
- **Giants are stars, not planets.** They cannot be landed on or conquered.
  They are finite fuel distributors — see §22.
- Sprite sizes `128 / 256 / 512 / 2048` px are **art assets only**, not game
  classes.
- **Tile count is rolled at discovery/mint time**, within the planet's class:
  - Small: **4–8 tiles**
  - Medium: **6–12 tiles**
  - Large: **10–20 tiles**
  - (Ranges overlap by design; class comes first, tiles are rolled within it.)
- **Tech DNA:** at discovery each planet rolls a *partial* subtree of the global
  tech tree. Some cards can **never** be unlocked on a given planet. No planet is
  self-sufficient — this is the primary driver of the trade economy. Full model
  in §18.
- **Climate** — one of **hot / cold / temperate / poison** — determines the
  **presence or absence of advanced resources** on the planet (§8) and shapes
  what can operate there. **Poison planets are unbuildable but still yield poison
  crystals** — a harvest-only body. (Propulsion fuel is **not** climate-derived —
  it comes from stars, §22; the crystals refined into *fuel cells* are, §24.)
- **Quality** (rarity band, e.g. **Class A–F**), orthogonal to size, sets a
  planet's **caps and abundance**: how high its deposit/population ceilings are
  and how rich its deposits start.
- Each planet has **finite natural resource deposits** that **deplete with
  extraction — planets can run dry.** Higher quality lasts longer, but nothing is
  infinite; exhaustion is a core driver of expansion (buy / colonize / trade /
  conquer) and helps keep the mature economy from stagnating.
- Each planet has a **maximum population** feeding the efficiency curve (§10).

---

## 4. Discovery, telescopes & fog-of-war

- **Scope** = the combined range of all telescopes across a player's planets.
- A planet can host **one telescope exactly**. It is a normal, immovable
  building: it consumes **one surface tile** and gains +200 pc of scope per
  level (L1/L2/L3). Scope therefore grows by upgrading that instrument and by
  developing additional worlds, never by stacking telescopes on one world.
- A player can **ping any planet within scope**.
- New zones/planets are discovered by traveling there or by sending a **probe**
  to map the void. Exploration requires the right equipment/capacity.

---

## 5. Communication & sharing

- A **ping** must be **answered by a ping-back** for contact to establish. No
  one-way contact.
- On mutual ping, a **chat channel** opens between the two players.
- Each player may then **share planets** and **share telescopes** with the other.
- **Routes can carry tolls** if public, payable **in any resource the route
  owner chooses**.

---

## 6. Movement & navigation

- **Two ways to move:**
  1. **Stargate** — an optional instant shortcut between two planet points. The
     *safe* path. Not mandatory.
  2. **Free-flight** — a straight line to any coordinate, over time, burning
     fuel + survival per distance.
- **A Stargate route exists only if** you own both endpoints and build the
  Stargate, **or** the price is split between the two owners.
- **Stargates are tied to their planet endpoints.** If a destination planet
  ceases to exist, its Stargate disappears; entering from the origin then drops
  you **near a fixed void coordinate** (empty space) — arrivals scatter
  deterministically (seeded, not live RNG) within a small radius, so exits
  cannot be pinpoint-camped. Void travel is allowed and encouraged.
- **A Stargate endpoint can move:** an **artificial planet / space station**
  (§25) carries its own Stargate and drifts **slowly**, so that Stargate's exit
  coordinate moves with it — mobile network infrastructure.
- **Tolls are hard gates:** no resources to pay ⇒ you cannot take that Stargate.
  Full stop.
- **Two depletion clocks per ship in transit:**
  - **Fuel runs out → stranded, still owned.** The owner can recover it.
  - **Survival (water / food / oxygen) runs out → crew dead, ownership stripped
    ("no honor"). Anyone with the right equipment (e.g. a recycler) can claim
    it.** This is the salvage economy.
- **Interception / piracy:** an attack-mode ship has an activity radius. A
  free-flight path that enters that radius during its travel window triggers
  automatic combat — damage, loss, or destruction. Dead-Stargate void exits
  become natural **pirate chokepoints**. Stargates are the safe way to avoid all
  of this; free-flight is the risky, opportunity-rich way.

---

## 7. Hovering

- A ship is either in space or **hovering over a planet**; both consume resources.
- **Hovering over your own planet** drains **that planet's** stock (as if running
  resupply round-trips).
- **Hovering over a planet that is not yours** drains **the ship's own stock**.
  The ship may **auto-trade** to top up (e.g. `if food < 20, buy 200 food best
  effort` — best effort = the first available matching market pair).

---

## 8. Resources & materials

Three material tiers:

| Tier | Availability | Fungibility |
|------|--------------|-------------|
| **Basic** | Always mineable on a planet | **Fungible** (tons/stacks) |
| **Advanced** | Sometimes present per planet | **Fungible** (tons/stacks) |
| **Derived** | Only via industry, combining materials | **Non-fungible, per-unit** |

- **Derived materials are intrinsically rare** — their recipes/conditions make
  large quantities extremely hard; expect only a few units at a time.
- **Which advanced materials a planet offers is set by its climate** (hot / cold
  / temperate / poison, §3): climate gates advanced-resource presence/absence.
  Basic materials are always mineable regardless of climate. Full v0 resource
  list in §24.
- **Deposits are finite and deplete with mining — planets run dry** (§3); a
  planet's **quality** sets its starting abundance and its caps.
- **Non-fungible entities:** derived materials, items, NPCs, planets.
- **Fungible = numbers, never touch the chain.** Non-fungibles are the entire
  mint/burn surface (§16).
- **Two different "fuels" — do not conflate:**
  - **Propulsion fuel** — fungible, **star-sourced**, three types (cold / hot /
    gas), each alters travel (§22). Burned to move.
  - **Fuel cells** — the **universal refined resource / "spice"** (à la Dune),
    made in a **refinery from crystals**, usable for anything, and the natural
    **reserve** of the no-currency economy (§13, §24).
- Ships also burn **survival** stock (water / food / oxygen, §6).

---

## 9. Buildings (autonomous policy agents)

A deployed planet is **autonomous**; its buildings run on **player-defined
instructions** (the §15 engine). Capability is gated by building type:

- **Spaceport** → enables landing (needed to use the planet at all).
- **Marketplace** → enables trading.
- **Workshop** → enables repair of ships/accessories.
- **Mining / industry** → mint materials from the planet or transform them.

**BUILD ≠ INSTALL — the economy's keystone (canon).** Manufacturing something
and putting it in service are **two separate acts, everywhere**:
- **Ground units (turrets, cannons, tanks), ship upgrades, weapons,
  accessories, derived items** are **manufactured as portable items** where
  the tech tree, politics and industry allow it ("raising the card" on a
  military world) — then **hauled, traded or sold like any item**, and
  **installed elsewhere** by whoever owns them. Installation is gated by
  *physics and permissions* (delivery on-planet, garrison/ship slots, landing
  rights) — **never by the installing planet's politics**.
- This is why worlds with no military production of their own are still
  defensible: they **import their cannons** (or keep **defensive ships
  hovering in orbit**). Production is specialized; protection is a market.
- **Buildings are the exception in one direction only:** the **card** is
  tradeable (canon §9 card acquisition), but the **construction** is local —
  pay on-planet resources, consume a tile; a built building never moves.

**The warehouse (canon).** A dedicated building stores the planet's
**ready-to-deploy reserve**: ground vehicles AND space vehicles (built there,
conveyed, or bought), plus non-fungible items. Capacity is expressed in
**separate balances — small / medium / large vehicle slots + an item count**
(e.g. 2 L + 4 M + 6 S + 50 items). **Warehoused vehicles consume nothing**
(§ the capacity IS the limit). Allied parking is possible, configured **per
planet AND per warehouse** ("ally" = faction member or per-planet whitelist —
the player decides how to serve the lore); **only the owner may retrieve**
their vehicle. Without warehouse space, a small free ground buffer exists;
when buffer and warehouses are full, **factories BLOCK** until the produced
unit is installed, sold or stored. **On conquest, warehouses are THE spoil:
ready-to-use, undamaged materiel.** The siege lock applies to warehouses too
— war starts, too late: prepare before they arrive in range.

**Markets & manual trade (canon).**
- **Per market building, ONE automated trade slot PER LEVEL** (L1 = 1,
  L2 = 2, L3 = 3): each slot holds one vehicle/item listing (spot buy-now OR
  timed auction) or one fungible trading pair — market breadth costs
  buildings, levels and tiles; upgrading a trade centre adds a slot.
- **This limit applies to FULL-AUTO trade only.** A player may always send a
  **manual purchase offer, at any price, on anything visible in a public
  warehouse**; manual offers resolve manually between players (accept /
  decline / counter).
- **Warehouses are public or private.** Public: content browsable — but
  **only by a buyer docked at a commerce dock** of the planet. Private:
  content hidden, **cannot be used as sales stock** — a strategic reserve
  with **exclusively manual entry/exit**.
- **The merchant-planet exception (canon).** A planet under **Mercantile
  governance** trades **survival resources (water, food, oxygen) AND
  propulsion fuel** innately —
  **always available to trade, no market building required**. The owner sets
  a **minimum keep-for-self floor per resource**; everything above the floor
  is available to trade. This is the true privilege of a merchant world —
  hospitality is its nature, not its infrastructure.

**Spaceport docks = trade throughput (canon).** The number of docks limits
how many ships sit grounded WITHOUT entering a warehouse — i.e. **the max
simultaneous traders** on the planet. Docks can be **reserved** for self and
allies ("ready to depart"). Deploying a ship OUT of a warehouse takes time
AND requires a free dock; ground units deploy from warehouse to field
directly (minutes to a few hours).

**Warehouse exceptions (canon):** a vehicle in a warehouse is the ONLY state
where (a) it can be **frozen for NFT export**, and (b) **its crew can
disembark and return to the player's hand** — everywhere else, binding holds
(§12).

**Construction vs. minting — two different acts:**
- **Constructing a building** = pay its resource cost from resources available on
  the planet, and consume one free tile (§18). Any *discovered/unlocked* building
  can be built as soon as you can pay. You may **convey resources from your other
  owned planets** (via freighters) to accelerate the planet you're focused on.
- **An industry mints exactly one thing.** Each industry building has a single
  recipe: it consumes exactly its required inputs and produces its one output
  **every time the inputs are available** (throttled by its efficiency %). To
  produce three different outputs you need **three industries** = three tiles —
  another reason large planets matter for diversity (§18).

Per-building configuration includes:
- **Mining/industry:** the **% of current efficiency level** to run at (you
  deliberately run below max — see §10).
- **Repair shop:** which items you fix, which ships, or friends-only.
- **Marketplace:** which trades are accepted, rates, and **limits (absolute and
  daily)**.
- **Landing (spaceport):** who may land — **self / friends / neighbours** (a
  neighbour = arrived from a nearby planet). Full option list **(OPEN)**.

**Card acquisition** (how you get a building card to place):
1. **Burn an NFT.**
2. **Per-planet tech tree** — spend resources to unlock the card (this is also a
   production-balancing sink). The available tree is the planet's rolled tech DNA
   (§3); not everything is unlockable everywhere.
3. **Buy from other players** — directly or via automated trade.

---

## 10. Efficiency, population & employment

*(Rewritten 2026-07-19 — owner brainstorm, two Q/A rounds; anchors
validated. The quantified spec lives in DESIGN_GUIDE §3.2-v2; sequence:
spec → simulated balance → code.)*

- Efficiency follows a **right-shifted bell curve**: you never want to
  overstaff or max out any single stock — the optimum leaves headroom on
  every axis. **The curve is per-domain AND per-resource**, and it is kept
  whole: under-staffing is punished too. This is a survival game — keeping
  balance is the craft, and over-expansion leaks everywhere (the "Roman
  Empire" effect).
- **Population is three ages** — children, actives, seniors — aging on
  fixed epochs; only actives work; children and seniors eat smaller
  rations but produce nothing. The pyramid is public on the stats page.
- **Every building employs.** A building's optimal staffing **scales with
  the planet's total population**: productivity scales with population
  *through employment*, never through a global multiplier. Leave a grown
  planet un-rebalanced and every building drifts left on its bell —
  neglect **erodes**.
- **Natality needs residential districts** (L1 establishes it, higher
  levels boost it) and follows good management: average efficiency and
  local surplus of water/food/oxygen feed the cradle; deficits brake it
  **even when imported stock fills the warehouses** — imports feed
  bellies, not growth.
- **Unemployment kills.** Past a small tolerance and a grace period, the
  jobless die in waves that strike the whole population — employees
  included, dragging every building's staffing down with them (momentum).
  Every new world is born on this clock; the colony grace shields the
  opening. Beyond a threshold, **exodus — settling other worlds — becomes
  the rational move**: population pressure is the engine of expansion.
- **Over-capacity is allowed** but illness and mortality grow
  **parabolically** past the cap; **clinics** (a dedicated building)
  push illness down.
- **Survival stocks are death clocks**: water out = everyone dies in
  3 days; food out = 10 days; oxygen out = instant — and oxygen is only
  breathed from stock on hostile climates (temperate worlds have ambient
  air).
- **Medicine is optional, never a survival clock.** Its burn follows the
  demographic pyramid (children and seniors consume more medicine than an
  active). A supplied population receives the illness mitigation; the bonus
  ends at the exact exhaustion of the medicine reserve, resources never go
  negative, and any production surplus remains ordinary tradable stock.
- **Extinction strips ownership.** The world reverts to wild **keeping
  its buildings and unlocked knowledge** (a recolonizer's windfall);
  installed governors die with it (host-fate).
- **No moral guardrails** on demographic choices (ship away your actives,
  dump your seniors — "no honor"); the counterweight is **observability**:
  good telescopes read a world's deaths and exoduses by category, so a
  sovereign's conduct is legible to the neighbourhood.
- **Required UI:** viewing a resource/unit shows its exact curve and
  current position. Each planet's **stats page** lists every unit with its
  efficiency, the demographic pyramid, employment and unemployment rates,
  illness, natality factors, and the projected dry date of every survival
  stock.

---

## 11. Governance

- **Small planets** run with **no governor**.
- **Medium planets** require **1 governor**.
- **Large planets** require **3 governors**, else they run at **half efficiency**.
- A **governor is an NPC** acting as a governing agent.
- **Governors are permanent — once installed, never changeable.**
- **The effective capability of a planet is the intersection (most-restrictive
  mask) of all its governors.** More governors = more constraints = large planets
  are powerful but hard to steer.
- **A governance preview** (resulting allow/deny mask before committing) is a
  **required** part of the mechanic, not polish — because the choice is permanent.
- **Governance specializations (canon).** Beyond its building mask, each
  archetype grants its planet an **innate privilege**:
  - **Militarist** — the war monopoly: unit & weapon production, conquest ops.
  - **Mercantile** — innate trading of survival resources + fuel with a
    keep-for-self floor (the merchant-planet exception).
  - **Industrialist** — *forge world*: industry retooling is instant and
    build/production times are reduced.
  - **Scientific** — *deep sight*: its telescopes & probes reveal scanned
    planets' tech-DNA, deposits and quality (+1 intel tier) — intel becomes a
    sellable good, shareable like telescopes.
  - **Civic** — *haven world*: illness decays faster, settler accident risk
    is halved departing AND arriving, visitors take no landing wear.
  - **Diplomatic** — *neutral ground*: any player may dock and trade WITHOUT
    established contact (localized exception to ping-back — the Silence
    breaks *at their table*), and the world hosts multi-party chat channels
    (mediation).
- **The full-diplomatic sanctuary (canon).** If **every governor of a planet
  is a Diplomat** (1 on medium, all 3 on large) **AND a diplomatic district
  of the highest level is built** — sanctuary is an EARNED status, not a
  governor trick — then **hostilities cannot be initiated ON the planet** — its ground and its docks; the **hover band
  stays normal space** (no third-party fleet ever parks under sanctuary
  protection). It **cannot be conquered**; it changes hands only by trade.
  The price: the intersection mask forecloses the military branch — and
  market L2+ — forever, and the governor commitment is permanent: sanctuaries
  are mediation grounds, never AMM hubs.
- **Same-type stacking (canon).** Installing **several governors of the same
  archetype stacks their planetary stat advantages** — a triple-Mercantile
  large is a deeper merchant world, a triple-Militarist a harder fortress.

---

## 12. NPCs & characters

- NPCs are obtained by **loot boxes** or by **burning an NFT**. Loot boxes yield
  **only NPCs** — nothing else.
- **Individual stat rolls (canon):** even two NPCs of the same type/rarity
  carry **different stat boosts, rolled at loot time** — every character is
  unique; opening pods is a gamble on quality, not just on role.
- **Characters can be human, robot, or humanoid alien**, and are **he / she /
  androgynous**. **People is purely cosmetic: any people can hold any role —
  including governor.** No race gates any capability, rarity or politics.
- **A character's role is flexible** — a **pilot** can serve either as **ship
  crew** or as a **governor**. (Roles determine which hosts an NPC can bind to.)
- **Civil pilots** specifically:
  - in a ship's **crew** → **reduce the accident risk of population/settler
    trips** (§19);
  - as a **governor** → enable **safer landing & leaving**, both for you and for
    your planet's visitors.
- **Binding is permanent and shares the host's fate — with ONE exception.**
  Once an NPC is installed on a resource, building, planet or ship, it is
  attached to it. If the building explodes or the ship is destroyed or
  stranded, the NPC dies with its host. **Exception (canon): while a vehicle
  is stored in a warehouse, its crew may disembark and return to the player's
  hand** — the warehouse is the only place a crew ever steps off alive.
  Governors are never releasable (planets have no warehouse state).
  If the **planet is conquered**, its bound governors are **lost to the
  conqueror** — they serve the *world*, not the owner, so they transfer with
  it (exactly as they do when a planet is traded). Permanence is never
  launderable: no event un-binds a living NPC.
- This closes an economic loop: loot boxes (a resource sink) → NPCs → bound to
  assets → lost on destruction → buy more.

---

## 13. Economy & trading

- **There is no currency in the game. Ever. At any moment.** All value is
  denominated in **resources available in the universe**; the seller decides
  which resource(s) they want.
- **Goods are planet-local.** A building, industry or market operates only on
  resources **physically present on its planet**; a market trades that planet's
  stock. To use resources elsewhere you **haul them** with freighters (§14) —
  value and goods never teleport.
- **Management is remote, goods are not.** You configure and manage **any planet
  you own from the interface, without moving your personal ship there** — only
  *resources* must be co-located, not *you*. (The personal ship adds governance
  capability when parked, §21, but is never required for routine management.)
- **Fungible resources** trade via an **AMM**: a constant-product pool per
  resource pair per market; **the seeder's deposit ratio sets the initial
  price**, and the price drifts as the pool skews. Expect **N² pair
  fragmentation** and emergent reserve resources — this is intended; smart
  marketers exploit pair scarcity. (Auction/bid **escrow** is system-held —
  the sole exception to physical co-location, because escrow must be neutral.)
- **Non-fungible entities** (derived materials, items, NPCs, planets) trade via:
  - **Stop-price buy-now**, or
  - **Timed sealed max-bid auction** — buyers submit a max price; funds are
    escrowed/locked until the auction ends and pulled directly from the winner.
    "Price" is whatever resource the seller named.
- **Any planet-available resource can be used to buy/sell.** If a trade is
  denominated across two resources both available on the planet (e.g. pay gold,
  seller wants copper), it routes as **two legs**, and the **marketplace levies
  its fee on each leg** ("double fee"). Smart marketers leverage pair scarcity.
- **Loot box pricing** is dynamic, recomputed several times per day
  (admin-configurable), based on the **total universe supply of each resource**:
  the more abundant a resource, the more *units* of it a box costs. This sinks
  common resources. Requires a periodic **global-supply aggregation job**.

---

## 14. Ships

**Taxonomy = `Category × Size`** (confirmed by the produced 2022 art & the repo's
`assets/icons/ships/`):

- **Categories:** **Combat**, **Cargo**, **Civil**.
- **Sizes:** **Small**, **Medium**, **Large** → the season-1 set of 9 hulls.

Old named ships are **roles/loadouts within a category**, not separate hulls:
freighters = **Cargo**; civilian/settler transporters = **Civil**; fighters
(bee/bird/star crusader) = **Combat**. **Harvesting is not a hull category — it is
an accessory role:** mount the **harvest accessory** (and probe/recycler/scanner
accessories) to mine stars, collect junk, or scan (§ harvest accessory below).

**Every ship is one entity = hull + slots + tanks + crew + cargo:**
- **Hull** (category × size): base stats + the **slot layout** (how many
  engine / fuel / armor / OBS / weapon / accessory / cargo slots, and which are
  allowed).
- **Modules:** engine optimizations, fuel tanks, armor, OBS, weapons, cargo
  containers, and **special accessories** (star-harvester, junk-collector,
  terraformer, scanner, shields…). Rendered as **overlay layers composited on the
  base hull sprite** (§26).
- **Upgrade slots** (2 levels each): **engine, armor, cargo capacity, fuel tank,
  primary weapon (air-to-air), secondary weapon (air-to-ground)**. Business
  rules: **only Combat ships carry weapons; only Cargo ships carry cargo-capacity
  upgrades.**
- **Tanks:** fuel **by type** (cold/hot/gas) + **survival** stock
  (water/food/oxygen).
- **Crew:** NPC(s), permanently bound, share the ship's fate (§12).
- **Cargo:** fungible tons in containers + non-fungible items.

**Range is derived, not a fixed stat:** reach ≈ fuel capacity × fuel-type
efficiency (from the installed engine build) − weight penalties (weapons / armor
/ cargo slow the ship and raise consumption). **Survival capacity** separately
caps how long a *crewed* trip lasts before the crew-death clock trips (§6). Old
parsec figures are now "typical reach for a typical build," not rules.

**Fuel × engine matrix:** each engine optimization / accessory publishes, for
cold / hot / gas fuel, its modifiers to speed, maneuverability and efficiency —
so you build a ship for the fuel your local stars provide (a specialization &
logistics driver, like tech DNA is for planets).

**Landing rules (who can land without a spaceport):**
- **Personal ship** — always (§21).
- **Small Combat ships** — land anywhere, no dock needed.
- **Colony ships** — can land on a **wild/uninhabited planet** (the colonization
  bootstrap, §19).
- **Everyone else** — needs a **spaceport** (or a dock of the right size).

**Harvest accessory (stars & remote resources):** harvesting requires the
**harvest accessory** (any hull with a free accessory slot; Cargo hulls suit it
best for storage). Yield scales with proximity — **the closer you harvest, the
more you extract, but the more hull damage you take** — with a **zero-damage /
low-reward standoff distance** at the safe edge. This is the moment-to-moment risk
dial that pairs with the star's *unknowable* remaining fuel and supernova risk
(§22).

**Salvage:** ships fitted with the **junk-collector accessory** (recyclers)
collect **space junk** and claim ownership-stripped dead ships (§6, §22).

---

## 15. The policy / instruction engine (the spine)

**One system powers every autonomous behaviour in the game.** Ship missions,
free-flight attack/defence rules, building production %, repair rules, marketplace
terms, landing permissions, governor masks and auto-trade are all the *same
object*: **an entity + a declarative ruleset + a tick evaluator.**

- Modeled on the original gamebook's programmable-freighter syntax
  (`IF fuel > 80% … Repeat`, `if attacked, try to dodge; alert`).
- MVP ships a **library of predefined strategies** (escort, patrol-and-engage,
  trade-loop-every-N-days, support-fleet…) rather than full free-form
  programming.
- **Manual-first:** automation is always optional. A player can directly order a
  hovering ship to attack a planet or a ship in range *right now*, with no policy
  at all. Instructions merely automate what you could do by hand.
- **Stackable conditions:** rules compose. Defensive postures range from *attack
  everything in range* → *only unknowns* → *respond to attack only*, and stack
  (e.g. *attack unknowns in orbit* **+** *respond to attack* — the latter
  retaliates even against a friend who fires first).
- The **simulation is tick-based** with on-demand catch-up when a player loads;
  the client interpolates for a real-time feel. This is what makes the world
  live while players are offline.

---

## 16. Blockchain / NFT bridge (opt-in)

- **Fungibles never touch the chain.** Only **non-fungibles** (derived materials,
  items, NPCs, planets, building cards) are mintable.
- **Extract** → vehicles must be **in a warehouse** (the only freezable
  state for units/ships); then, after a **vulnerable packing window**, the server
  **locks/escrows** the DB row and **mints** a matching NFT. While minted, the
  asset is **frozen in-game** (unusable, immune to routine simulation decay) —
  but it remains **physically present**: supernovae and conquest still apply.
  *The token is a deed, not a bunker.*
- **Burn** → the server **credits the asset back** as live in-game state
  ("burned net as assets").
- A **relayer/oracle** watches chain Mint/Burn events and reconciles DB lock
  state. That relayer is the *entire* blockchain surface area of the live game.
- Existing contracts (`Planet.sol`, `Ship.sol`, `Building.sol`, ERC1155
  `Tokens.sol`) can be reused as mint targets. `GameEngine.sol` is **removed from
  the hot path**.

---

## 17. Rendering

- **Galaxy map:** three.js star field (3D-styled, 2D navigation).
- **Planet interior:** isometric 2D tile view + a **card hand** at the bottom.
  Card types: **constructions** (mines, refineries, commerce, industry,
  residential…) and **NPCs** (pilot, starfighter, diplomat, engineer, merchant…).
  A 2D iso renderer (e.g. Pixi/canvas) is likely simpler than three.js here.
  **(OPEN — engine choice.)**

---

## 18. Tech tree

The engine of specialization, progression and production-balancing.

- **One global tech DAG.** Nodes are capabilities/cards (buildings primarily).
  Each node carries:
  - `category` — mining · industry · commerce · residential · military ·
    research · …
  - `prerequisites` — parent nodes (the DAG edges).
  - **unlock requirements** (to *reach* the node, once per planet):
    - resource cost;
    - required **buildings present** + minimum building **stats**;
    - required **governor politics** (e.g. anything military ⇒ military politics);
    - required **industry present** on the planet.
  - **placement cost** — resources per placed instance.
  - **tile cost** — **always exactly one tile** per building (so large planets
    are valuable for *diversity* of discovery, not just quantity).
- **Per-planet seed → availability mask.** Each planet's seed deterministically
  (a) selects *which branches exist* on that planet — some are **never**
  available — and (b) caps *how deep* you can go per branch. Availability is a
  pure function of `(global DAG, seed)`: recomputable, reproducible, no per-planet
  tree stored.
- **The never-gated set.** A handful of nodes sit at the **very first level of
  every planet's tree**, always available regardless of seed: **telescope,
  probe pad, depot, mine, `colony_program`, and the base spaceport** (owner
  decision 2026-07-24 added the spaceport). Placement is still paid. This
  underwrites the starter guarantee (§19); for the spaceport it further
  guarantees that **every ownable world can always host a launch base and mint
  a colonizer**, so a poor tech-DNA roll can never soft-lock expansion (§19.3).
  Higher spaceport levels (M/L docks) remain normal depth-capped tech.
- **Two phases:**
  1. **Unlock** (once per planet): meet all prerequisites + pay the unlock
     resource cost → the card becomes available on that planet. **Unlock is
     permanent knowledge** — a later loss of a prerequisite building does **not**
     re-lock the node. **But usage can be capped by lost infrastructure:** if the
     industry that *mints* an accessory (e.g. beam lasers) is destroyed, you keep
     your existing stock yet cannot produce more until you rebuild that industry.
     *Knowledge is permanent; production depends on live infrastructure.*
  2. **Place** (repeatable unless the catalog declares the building unique):
     pay the placement resource cost, consume free tile(s). The telescope is
     explicitly unique per planet; every placement is still rechecked by the
     server against tile, instance and governor constraints.
- **Consequences:** seed → forced specialization → mandatory trade; governor
  politics gate whole branches, so on a **large planet a node needs *all 3*
  governors to permit it** (intersection mask, §11) — one off-politics governor
  forecloses a branch permanently; resources spent at both unlock and placement
  form a **double sink**.

---

## 19. Starting the game & monetization

- **Every player starts free** with **one random planet** + a few **lower-bound
  random resources** to begin building.
- **Starter guarantee (canon):** a planet's minimum *extractable* resource total
  is always **≥ the price of a telescope + a probe + some spare**, and
  **telescope + probe are never gated** (first level of every tree, §18). Every
  player can therefore always bootstrap toward exploration.
- **Starter knowledge (canon, owner decision 2026-07-19):** the starter planet
  begins with the **T0 never-gated building set already unlocked as knowledge**
  — telescope, probe pad, depot, **mine** (placement is still paid). Rationale:
  the extractable-value guarantee above is worthless if the player can spend
  their grant *before* affording the mine unlock — with zero income and only a
  50 % demolition refund on *placed* value, that opening was an unrecoverable
  softlock. Knowledge is permanent (§18), so granting the basics at spawn stays
  within the same rule. Colonized and purchased planets are unaffected.
- **Planet spawn:** the free first planet and bought planets alike spawn **as near
  to the player as possible** — but placement is random, so you sometimes draw a
  **distant** planet (bad luck or good luck; the game never tells you which).
- **Pocket luck (canon, owner decision 2026-07-20):** the pocket's composition is
  slightly randomized — always **1 star**; **1 starter planet, with a 1% chance
  of 2 and a 0.1% chance of 3**; **2 near uninhabited planets, with a 1% chance
  of 3 and a 0.1% chance of 4** [TUNE]. Every *extra* starter planet is born
  **colonized, populated and granted exactly like the primary** (same starter
  guarantees, same 45-day account binding); the personal ship, free Cargo hull
  and pilot are granted **once**, docked at the primary.
- **The latent frontier (canon, owner decision 2026-07-20):** every new join also
  seeds **a few very-far, uninhabited bonus worlds**, placed strictly **outside
  the current visibility of every existing player** — if no such position can be
  found, the world is simply **not spawned** (a crowded universe self-throttles
  the flow; intended). The farther from the settled center, the **richer** they
  are: better quality, larger, denser deposits, **richer tech DNA**,
  **abandoned buildings** of increasing count and level, leftover supplies —
  and **~25% keep their own star** [TUNE]; the rest are fuel deserts whose
  wealth is paid in expedition logistics. They are the slowly-accumulating
  reward that later explorers uncover: production on unowned worlds stays zero
  (§10), and everything standing is **inherited on colonization** (§19.2).
- **Buying planets is the business model** and **the only place real money enters
  the game** (fiat, via Stripe). A purchase **mints a new random planet** entity
  for the buyer. Indicative pricing: **€2.99** (one random planet) / **€9.99**
  (pack of 5). The first planet is always kept.
- **Three ways to expand your holdings:**
  1. **Buy** a planet (fiat) — the **fast pass**, spawns near you (§ spawn rule).
  2. **Colonize** an **uninhabited planet** (§3) with a **colony ship** — the
     explorer's payoff. Building a **spaceport** (never gated, §18) on any world
     you own mints your **first colonizer for that world free** once the
     `colony_program` is also unlocked; further colonizers are crafted at the
     spaceport for resources (§19.3). Establishing the colony requires **moving
     population as settlers** from an existing planet (via **Civil** transport),
     and the trip carries an **accident risk**; a **Civil pilot** in the crew
     reduces it (§12). The barrier is now honest **population + logistics** (200
     settlers, a Civil hull, a real trip), not a tech-DNA or resource wall — it
     ties expansion to your population economy (§10).
  3. **Trade** — **planets can be traded between players** (like any non-fungible
     asset, §13), and are also won by **conquest**.
- **Not pay-to-win:** you buy *board presence and more rolls of tech DNA*, not
  power — every planet is still gated by tiles, efficiency caps and management,
  and colonization/trade/conquest are all fully non-paid paths.
- **Guardrail (canon):** buying is the *fast* escape from a stuck start, **never
  the only one** — the starter guarantee above ensures a patient free player can
  always eventually reach the network and trade out.

### 19.3 The colony program — the anti-soft-lock reform (canon, owner decision 2026-07-24)

Colonization must never be locked by a planet's tech-DNA roll. Two structural
rules guarantee it:

- **The base spaceport is never seed-masked (§18).** Every ownable, non-poison
  world can therefore always build a spaceport L1 — the structure that both
  embarks settlers and mints colonizers. The old "landlocked world that cannot
  launch" archetype is retired (owner-accepted trade-off: a better game this
  way).
- **The colonizer is minted at the spaceport, not the workshop.** Reaching an
  **active spaceport L1 while `colony_program` is unlocked** grants **one free
  colonizer accessory** into that planet's stock — **once per planet, ever**
  (a persisted flag). Demolishing and rebuilding does **not** re-grant, and a
  **conquered** world that already spent its free colonizer never gets another
  ("that's life" — the flag rides with the world through ownership transfer).
  Additional colonizers are crafted at the spaceport for resources, **priced
  only in the 12 basic (always-mineable) resources and biased to the planet's
  own deposits**, so a colonizer is always locally payable and no
  scarce-resource wall can re-introduce a soft-lock.

A colonizer is a portable item: load it — with the settler manifest and seed
stock — onto a **Civil M/L** hull, fly to a wild world, and establish (§12); the
item is consumed on establishment. The **Workshop L2 requirement is removed**;
the colonizer accessory is the "terraform core" item finally realized.

---

## 20. Combat resolution

- **Pure stats, fully deterministic, no RNG.**
- **Resolved at effective range** using the target's state **at the moment of
  arrival** — not at launch. Because travel takes real time (days), the target
  may have changed by the time the attacker arrives. **The risk is temporal, not
  random:** stale intel and slow ships lose battles that looked winnable at
  launch.
- **Design consequences (intended):** telescopes / fresh shares gain military
  value (intel has a shelf life); **ship speed buys certainty** (less time for
  the target to change); feints, reinforcement-in-transit and bluffing emerge for
  free; no save-scumming.
- **Detection is telescope-gated intel (not binary).** Depending on telescope
  level a defender reads an incoming ship's **heading, destination and
  equipment** — an unknown ship loaded with beam lasers on a course for you
  forces a judgement call on intent. You can also **ping a ship** and read how it
  reacts. Better telescopes = earlier, richer warning (telescopes are scope +
  combat-intel + defense, all at once).
- **Manual override always available:** drop all automation and order an attack
  (a ship in range, or a planet) by hand at any moment (§15).

---

## 21. Personal ship

- The **player incarnated**: movable only between planets you own or ally
  planets. **Invulnerable** — cannot be attacked, stranded, or die; consumes
  nothing. (Not cosmetic — it earns its place through three functions.)
  1. **Identity:** you choose a governor archetype ("politics") at game start;
     the personal ship is that avatar.
  2. **New-player governance bootstrap:** lends *your* politics to the planet it's
     parked on, so a player with no spare governor NPC can still access
     politics-gated tech on a starter planet. (This is the planet-opening
     bootstrap.)
  3. **Governance preview instrument (§11):** park it to see, live, what a
     governor of your type would unlock — *before* committing a permanent one.
- Its value naturally fades as you acquire real governors (you can only be one
  place at once), which is acceptable — training-wheels + preview tool.

---

## 22. Stars, black holes & space junk

**Giant stars — fuel distributors.**
- A star holds an **enormous but finite** supply of fuel across **three types —
  cold, hot, gas** — each of which **alters how ships travel** (§8).
- Harvesting a star requires a **special accessory**.
- **Supernova:** when a star's fuel runs out it **supernovas, annihilating
  everything within a radius** — ships, planets, anything. There is **no way to
  read how much fuel remains**, so over-harvesting is a blind, *shared* risk — a
  natural tragedy-of-the-commons around rich stars (generates diplomacy,
  sabotage, and high-yield/high-danger star-adjacent real estate). **One
  exception: a nearly-spent star (last ~5%) flares visibly** to anyone with
  scope on it — the universe's only warning, an evacuation window, never a
  gauge. High-level telescopes can also **attribute who is harvesting** a star
  in scope, so restraint is player-enforceable.
- **The free starter planet is never generated within any star's supernova
  destruction radius** — it is guaranteed safe. Bought/discovered/conquered
  planets carry the risk.

**Black holes — a special star, the clean junk sink.**
- A black hole lets you **dump space junk with no consequences**.

**Space junk.**
- **Dumping junk in open space creates a small hazard radius** that inflicts
  **hull damage** on anyone whose trajectory crosses it — junk is therefore also
  a **weapon / area-denial tool**. Black holes are the only consequence-free
  disposal.
- **Junk is recoverable** with the correct equipment (feeds the recycler/salvage
  economy, §6).
- **Destroyed ships become space junk** — combat litters the battlefield and
  reshapes navigation afterward.

**(OPEN):** exact fuel-type travel effects; whether black holes share the star
fuel/supernova mechanics or are purely a sink. (The free starter planet is
already guaranteed supernova-safe; whether *other* owned/purchased planets get
any mitigation is still open.)

---

## 23. Factions

- Players can **collectively mint a faction** (a non-fungible faction entity).
  The **minter owns it and decides its members**, and may grant **moderators**
  who can **invite or ban** other members.
- A faction is **pingable**, like a planet or a player.
- **Affiliation is visible:** every player and every planet displays the faction
  it belongs to (badges / banners — the art already exists).
- **Faction rules are player-authored lore, NOT enforced by the game.** A faction
  may *demand* tribute and threaten to attack/ban non-payers, but the game only
  **enables and displays** membership — it never enforces a faction's rules. Same
  philosophy as tolls and diplomacy: the game supplies the levers, players supply
  the politics.

---

## 24. Resources (v0 master list — extensible for 2026)

> Base recovered from the 2021 briefs, adopted as the starting set. The **tier
> mapping** below is a working proposal to refine for the 2026 version.

- **Basic** (fungible, always mineable, climate-independent): **oxygen, carbon,
  hydrogen, ore, lithium, sulfur, gold, uranium, deuterium, aluminium, phosphor,
  silicon** (12).
- **Crystals** (fungible, **climate-gated**, mined): one family per climate —
  **hot / cold / temperate / poison** (color-coded). Poison crystals only from
  (unbuildable) poison planets (§3).
- **Refined** (fungible, industry-combined): **steel** (light, heavy), **water**
  (normal, heavy), **food** (×3 types), **medicine** (×3 types).
- **Fuel cells** (fungible) — the **universal refined resource / "spice"**:
  refined from crystals in a **refinery**, usable for anything, the de-facto
  **reserve** of the no-currency economy (§13).
- **Derived items** (non-fungible, per-unit, rare, §8): scarce crafted
  items/accessories (e.g. beam lasers) — a few at a time.
- **Propulsion fuel** (fungible, **star-sourced**, cold / hot / gas): travel only
  (§22) — *distinct from fuel cells*.
- Survival stock (water / food / oxygen, §6) draws from the above.

**Tier split confirmed:** *fungible-refined* (steel / water / food / medicine /
fuel cells) vs *per-unit derived items* (rare crafted accessories). *To refine:*
the exact recipe graph and crystal→fuel-cell yields.

---

## 25. Content catalogue (buildings, districts, ground units — v0)

> Content seed recovered from the 2021–22 briefs; feeds the tech tree (§18). Not
> exhaustive.

- **Buildings / districts:** space station, spaceport, casino, business &
  commerce district, diplomatic district, military district, research center,
  industrial district / factories, **faction HQ** (§23), **refinery**
  (crystals → fuel cells), mines, workshop, marketplace. Buildings exist in
  **3 levels — basic / normal / advanced** (level = building stats, §18), each
  with **climate-adaptation** art per planet type.
- **Ground units** (planet defense, ~10, each in 2–3 levels/variants): light
  turret, heavy turret, cannons, ground tank, anti-air tank, combined ground+air
  tank. Air-to-air / air-to-ground targeting ties to OBS (§14, §20).
- **Space stations = artificial planets (endgame).** A space station is a
  **player-manufactured planet**: it reuses the planet model (land tiles,
  buildings, population) but is **built from scratch in empty space** for
  **tremendous resources and time** — the ultimate sink. It can be placed at an
  **arbitrary coordinate**, **moves slowly**, and **carries its own Stargate**
  (which moves with it, §6). Artificial planets have **no natural deposits or
  climate crystals** — they live on imports — so they are **strategic
  infrastructure** (positioning, population, a mobile Stargate anchor), not
  resource sources. *(The 2022 Y-branch modular-station concept survives only as
  visual reference, §26.)*

---

## 26. Visual direction

- **Isometric**, very **colourful and bright**, **old-school**-inspired: deep
  **blacks**, dark **purples**, vivid accents like **yellow**. Consistent with
  Anna's space environments (backgrounds) and the existing `palette.jpeg`.
- **Modular assets assembled dynamically by the engine:** ships and stations are
  a **base model + overlay layers** (upgrades / modules) composited at runtime,
  not pre-rendered per configuration.
- Sprite sizes, colour depth, PSD sources and delivery cadence are **art-pipeline
  notes**, not game rules.

---

## 27. Open questions & unspecified mechanics

**A. Tracked design opens (tuning — do not block a build):**
- **Artificial planets** (§25) — population/quality caps, conquerable/attackable?,
  movement speed & fuel cost.
- ~~Climate ↔ ship shields~~ — **SETTLED (balance round 4):** ship operations
  in a hostile environment (hot/cold worlds, poison harvesting, near black
  holes or flaring stars) without the matching shield accessory cost
  **deterministic hull wear** — a toll, never a block. Temperate worlds never
  require shields; buildings never do. Details: DESIGN_GUIDE §8.8.
- Full **landing-permission** option list — self/friends/neighbours grief cases
  (§9).
- Fuel-type **travel effects** & black-hole fuel/supernova behaviour (§22).
- Supernova vs. **owned/purchased planets** — mitigation or not (§22).
- **Anti-stagnation** beyond depletion — new regions, discovery cycles.
- **Route decay / Stargate destruction** edge cases beyond destination-death.
- **Loot-box randomness** source & rarity tables.

**B. Mechanics still conceptual — need concrete rules (or explicit placeholders)
to build:**
- **Efficiency curve** — the actual inputs & formula behind the per-domain /
  per-resource right-shifted bell (§10).
- **Population** — growth/decline, illness, what sets the cap (size vs. quality),
  and how population is carried as settlers (§10, §12, §19).
- **Deposit depletion** — the extraction → run-dry rate model (§3).
- **AMM liquidity** — where pool liquidity comes from in a no-currency economy;
  who seeds each pair (§13).
- **Combat resolution** — the stat → outcome/damage formula; and **conquest &
  hijacking** flows are not yet expressed in new-model canon (§20, gamebook).
- **Tick cadence & time** — tick interval, mission scheduling, real-time ↔
  game-time mapping (§15).
- **Tech-tree content** — the actual node graph, prereqs and costs (model exists
  §18; content does not).
- **NFT bridge specifics** — target chain; whether a **faction** is an on-chain
  mint or a DB entity (§16, §23).
- **Dock / spaceport sizing** — the size-matching rules for landing (§14).

**C. Build/tooling choices:**
- **Server language** for the tick worker (client is JS/TS).
- Isometric planet **renderer** choice (§17).

---

*Last reconciled from `JOURNAL.md` through the 2026-07-11 brainstorm session.*
