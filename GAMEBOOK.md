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

- **Three landable planet classes: small, medium, large.** Class is intrinsic to
  the planet (it is *not* derived from tile count).
- **Giants are stars, not planets.** They cannot be landed on or conquered.
  Their role is **(OPEN)**.
- Sprite sizes `128 / 256 / 512 / 2048` px are **art assets only**, not game
  classes.
- **Tile count is rolled at discovery/mint time**, within the planet's class:
  - Small: **4–8 tiles**
  - Medium: **6–12 tiles**
  - Large: **10–20 tiles**
  - (Ranges overlap by design; class comes first, tiles are rolled within it.)
- **Tech DNA:** at discovery each planet rolls a *partial* subtree of the global
  tech tree. Some cards can **never** be unlocked on a given planet. No planet is
  self-sufficient — this is the primary driver of the trade economy.
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

---

## 9. Buildings (autonomous policy agents)

A deployed planet is **autonomous**; its buildings run on **player-defined
instructions** (the §15 engine). Capability is gated by building type:

- **Spaceport** → enables landing (needed to use the planet at all).
- **Marketplace** → enables trading.
- **Workshop** → enables repair of ships/accessories.
- **Mining / industry** → mint materials from the planet or transform them.

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

## 14. Ships (inherited catalog — to be reconciled)

The original gamebook ship taxonomy stands as canon until revised: **Freighters**
(small/medium/large), **Civilian Transporters**, **Warclass Fighters**
(small "bee" / medium "bird" / large "star crusader"), **Labs/Research ships**,
**Colony/Terraforming ships**, **Probes**, **Recyclers**. Each is a **unique
instanced entity** (built, crewed, refueled, repaired, upgraded individually).
Key axes: upgrade slots (engine/fuel/armor/cargo/OBS/etc.), range, life-support,
cargo, weaponry, landing capability.

> Reconciliation needed against the new model (continuous space ranges, the
> policy engine, hovering, salvage). Tracked as **(OPEN)**.

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

## 18. Open questions (not yet canon)

- Role/nature of **giant stars** (§3).
- Full **landing permission** option list (§9).
- **Personal-ship / planet-opening bootstrap:** how you first land on a planet
  that has no spaceport yet (personal ship presumably always lands).
- **Combat resolution** model (stats + policy → outcome).
- **Route decay / Stargate destruction** edge cases beyond destination-death.
- **Loot box randomness** source & rarity tables.
- **Server language** for the tick worker (client is JS/TS).
- Reconciliation of the **inherited ship catalog** (§14) with the new model.
- Isometric planet **renderer** choice (§17).

---

*Last reconciled from `JOURNAL.md` through the 2026-07-11 brainstorm session.*
