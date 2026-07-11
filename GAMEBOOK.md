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
  (wild — must be **colonized** to become yours, §19), and **stars/giants**.
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
- Each planet has **finite natural resource deposits** and a **maximum
  population** feeding the efficiency curve (§10).

---

## 4. Discovery, telescopes & fog-of-war

- **Scope** = the combined range of all telescopes across a player's planets.
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
  you at a **fixed void coordinate** (empty space). This is fine — void travel is
  allowed and encouraged.
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
- **Non-fungible entities:** derived materials, items, NPCs, planets.
- **Fungible = numbers, never touch the chain.** Non-fungibles are the entire
  mint/burn surface (§16).
- **Fuel** is a distinct fungible consumable with **three types — cold, hot,
  gas — sourced from stars (§22); each alters how ships travel.** Ships also burn
  **survival** stock (water / food / oxygen, §6).

---

## 9. Buildings (autonomous policy agents)

A deployed planet is **autonomous**; its buildings run on **player-defined
instructions** (the §15 engine). Capability is gated by building type:

- **Spaceport** → enables landing (needed to use the planet at all).
- **Marketplace** → enables trading.
- **Workshop** → enables repair of ships/accessories.
- **Mining / industry** → mint materials from the planet or transform them.

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

## 10. Efficiency (the bell curve)

- Efficiency follows a **right-shifted bell curve**: you never want to overpopulate
  or max out any single stock — the optimum leaves headroom on every axis.
  Overcrowding drops efficiency and spreads illness.
- **The curve is per-domain AND per-resource.** Each unit/resource has its own
  curve and a live position on it.
- **Required UI:** viewing a resource/unit shows its exact curve and current
  position. Each planet has a **stats page** listing every unit on it with its
  efficiency curve, so the player can rectify.

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

---

## 12. NPCs

- NPCs are obtained by **loot boxes** or by **burning an NFT**. Loot boxes yield
  **only NPCs** — nothing else.
- **Binding is permanent and shares the host's fate.** Once an NPC is installed
  on a resource, building, planet or ship, it is attached to it. If the building
  explodes, the ship is destroyed or stranded, or the planet is conquered, the
  NPC is lost with it.
- This closes an economic loop: loot boxes (a resource sink) → NPCs → bound to
  assets → lost on destruction → buy more.

---

## 13. Economy & trading

- **There is no currency in the game. Ever. At any moment.** All value is
  denominated in **resources available in the universe**; the seller decides
  which resource(s) they want.
- **Fungible resources** trade via an **AMM**: a constant-product pool per
  resource pair, priced off the **planet-pair liquidity** toward "perfect
  balance" (the 50/50 ratio). Expect **N² pair fragmentation** and emergent
  reserve resources — this is intended; smart marketers exploit pair scarcity.
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

**Taxonomy = `Category × Size`** (recovered from the old `Ship.sol`):

- **Categories:** **Combat**, **Harvest**, **Civil**.
- **Sizes:** **Small**, **Medium**, **Large**.

The old named ships are **roles/loadouts within a category**, not separate hull
types: freighters & civilian transporters = **Civil**; fighters (bee/bird/star
crusader) = **Combat**; probes, recyclers, mining/star-harvest & lab/scanner
ships = **Harvest** (and scanning/exploration variants).

**Every ship is one entity = hull + slots + tanks + crew + cargo:**
- **Hull** (category × size): base stats + the **slot layout** (how many
  engine / fuel / armor / OBS / weapon / accessory / cargo slots, and which are
  allowed).
- **Modules:** engine optimizations, fuel tanks, armor, OBS, weapons, cargo
  containers, and **special accessories** (star-harvester, junk-collector,
  terraformer, scanner, shields…).
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
**harvest accessory** on a Harvest-category ship. Yield scales with proximity —
**the closer you harvest, the more you extract, but the more hull damage you
take** — with a **zero-damage / low-reward standoff distance** at the safe edge.
This is the moment-to-moment risk dial that pairs with the star's *unknowable*
remaining fuel and supernova risk (§22).

**Salvage:** **Harvest** ships (recyclers) collect **space junk** and claim
ownership-stripped dead ships (§6, §22).

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
- **Extract** → the server **locks/escrows** the DB row and **mints** a matching
  NFT. While minted, the asset is **frozen in-game** (unusable, indestructible by
  the sim).
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
- **Telescope and probe are never gated.** They sit at the **very first level of
  every planet's tree**, always available — this underwrites the starter
  guarantee (§19).
- **Two phases:**
  1. **Unlock** (once per planet): meet all prerequisites + pay the unlock
     resource cost → the card becomes available on that planet. **Unlock is
     permanent knowledge** — a later loss of a prerequisite building does **not**
     re-lock the node. **But usage can be capped by lost infrastructure:** if the
     industry that *mints* an accessory (e.g. beam lasers) is destroyed, you keep
     your existing stock yet cannot produce more until you rebuild that industry.
     *Knowledge is permanent; production depends on live infrastructure.*
  2. **Place** (repeatable): pay the placement resource cost, consume free
     tile(s). Limited only by tiles and the governor mask.
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
- **Planet spawn:** the free first planet and bought planets alike spawn **as near
  to the player as possible** — but placement is random, so you sometimes draw a
  **distant** planet (bad luck or good luck; the game never tells you which).
- **Buying planets is the business model** and **the only place real money enters
  the game** (fiat, via Stripe). A purchase **mints a new random planet** entity
  for the buyer. Indicative pricing: **€2.99** (one random planet) / **€9.99**
  (pack of 5). The first planet is always kept.
- **Three ways to expand your holdings:**
  1. **Buy** a planet (fiat) — the **fast pass**, spawns near you (§ spawn rule).
  2. **Colonize** an **uninhabited planet** (§3) with a **colony ship** — the
     explorer's payoff. **Colony ships are very costly → a mid-game mechanic**,
     not an early one.
  3. **Trade** — **planets can be traded between players** (like any non-fungible
     asset, §13), and are also won by **conquest**.
- **Not pay-to-win:** you buy *board presence and more rolls of tech DNA*, not
  power — every planet is still gated by tiles, efficiency caps and management,
  and colonization/trade/conquest are all fully non-paid paths.
- **Guardrail (canon):** buying is the *fast* escape from a stuck start, **never
  the only one** — the starter guarantee above ensures a patient free player can
  always eventually reach the network and trade out.

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
  know how much fuel remains**, so over-harvesting is a blind, *shared* risk — a
  natural tragedy-of-the-commons around rich stars (generates diplomacy,
  sabotage, and high-yield/high-danger star-adjacent real estate).
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

## 24. Open questions (not yet canon)

*Recovered from old branches, awaiting the owner's go/no-go:*
- **Planet climate axis** — cold / hot / exo / radio — wiring
  **climate ↔ ship shields ↔ fuel types** into one thermal/radiation system
  (recommended).
- **Physical co-location trade** — a resource must sit on a planet you own to be
  listed for sale (recommended).
- **Planet rarity `Class A–F`** orthogonal to size (quality band).

*Still undecided:*
- Full **landing permission** option list — self/friends/neighbours grief cases
  (§9).
- Fuel-type **travel effects** & black-hole fuel/supernova behaviour (§22).
- Supernova vs. **owned/purchased planets** — mitigation or not (§22).
- **Anti-stagnation** — what keeps a mature, balanced single universe fresh.
- **Route decay / Stargate destruction** edge cases beyond destination-death.
- **Loot box randomness** source & rarity tables.
- **Server language** for the tick worker (client is JS/TS).
- Isometric planet **renderer** choice (§17).

---

*Last reconciled from `JOURNAL.md` through the 2026-07-11 brainstorm session.*
