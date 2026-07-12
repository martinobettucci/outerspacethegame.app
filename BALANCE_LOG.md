# BALANCE_LOG — simulated-campaign findings & applied patches

> Round-based log of the balancing loop: simulated long-run campaigns by
> archetype agents against `DESIGN_GUIDE.md`, findings, and the patches
> applied. The guide always reflects the latest round.

---

## Round 1 — four archetype campaigns (2026-07-12)

Simulated 180-day campaigns: **Industrialist** (peaceful min-maxer),
**Corsair** (pirate/warlord), **Voyager** (free-to-play explorer/colonizer),
**Breaker** (adversarial exploit hunter). All did closed-form arithmetic
against guide v0.1 numbers.

### Convergent critical findings (multiple sims)

1. **Bootstrap deadlock (game-sealing).** Starter kit had no propulsion fuel;
   fuel is star-sourced; the harvest accessory was locked behind a T3
   Militarist foundry; probes inherited fueled-hull costs. Nobody's first
   flight could ever launch. → **PATCH 1–4.**
2. **Ranges below the isolation floor.** Best early range ~60–168 pc vs
   ≥300 pc spawn isolation: contact/trade mathematically impossible;
   time-to-first-trade target unmeetable. → **PATCH 5–8.**
3. **Population frozen at spawn.** `H = min(food, water, med)` with medicine
   unreachable early ⇒ growth = 0 forever; E_planet stuck at 0.36. → **PATCH
   9–11.**
4. **Fuel-cell chain off by ~30×.** Lithium-capped trace rates made cells
   0.18/day vs sinks in the thousands (stargate 12 yr, colony 30 yr). →
   **PATCH 12–15.**
5. **Tile arithmetic fails.** Needed ~10 buildings on 4–8 starter tiles, no
   demolition rule. → **PATCH 16–17.**
6. **Colonization gated & dominated.** T4 seed-mask (30%) + Militarist-only
   terraform core = ~87% of starters could never colonize; conquest strictly
   dominated colonizing (≈6:1 cheaper); conquest also contradicted landing
   rules (needs a dock the defender controls). → **PATCH 18–21.**

### Combat economy (Corsair)

7. Risk-free piracy ≈ **14× hauling ROI** (unarmed ships can't disengage;
   combat runs to destruction). → **PATCH 22 (disengage), 27 (containers ×3),
   30 (salvage cut).**
8. Crusader one-round alpha (784 ATK ≥ every unarmored HP pool). → **PATCH 23.**
9. Bee hull dead (ATK 3 solo, loses to one light turret). → **PATCH 24.**
10. Turrets ~11:1 outclassed by crusaders; turret costs/building HP undefined;
    hovering-ship targeting undefined. → **PATCH 25.**
11. Junk minefields free, permanent, anonymous, stackable; dead-gate exits
    100% intercept. → **PATCH 26.**
12. New-player farming (killing the starter's only hull) violated the 7-day
    retention hard requirement. → **PATCH 28.**

### Exploits (Breaker)

13. **NFT-extract = invulnerability/stasis toggle** (freeze before an attack
    or supernova, burn back after). → **PATCH 31.**
14. **NFT bridge = cross-account value teleporter** (starter-farm → pods →
    mint governor → wallet transfer → burn on main; de-facto RMT). →
    **PATCH 32.**
15. Pod pricing: stale-window arbitrage + scarce-resource near-free pods +
    median manipulation. → **PATCH 33.**
16. Sealed-auction shill bidding strictly optimal; hostile physical escrow
    (strandable refunds, storage-flooding, plunder-mid-auction). → **PATCH 34.**
17. Governor permanence launderable via friendly conquest; poisoned-governance
    planets sellable undisclosed. → **PATCH 35.**
18. Survival-extortion funnel (welcome, re-price food, starve, claim hull). →
    **PATCH 36.**
19. Aged-star assassination without counterplay. → **PATCH 37.**
20. Settler `ceil()` rounding nullified accident risk (cohorts of 19). →
    **PATCH 38.**

### Applied patches (now in DESIGN_GUIDE v0.2)

**Bootstrap & early game**
1. Starter kit: +150 u star-fuel (matched to nearest star), +1 Common pilot
   NPC, starting population 400 → **1 200** (u=0.6 ⇒ E_planet ≈ 0.95).
2. Probes: **fuel-free solar sail**, 10 pc/day, crewless (only crewless class),
   cost 15 ore + 10 silicon.
3. Harvest accessory: workshop recipe (20 steelL + 5 crystal + 5 gold) —
   **politics-free**; fuel economy never governance-gated.
4. All hull burn rates **÷4** (Cargo-S base range 60 → 240 pc).
5. Isolation floor 300 → **150 pc**; spawn guarantees: star ≤ 40 pc, ≥2
   uninhabited planets ≤ 60 pc, ≥1 active player in the 150–350 pc shell.
6. Telescope +150 → **+200 pc/level** (max 600 — always covers the shell).
7. Cargo-S/Civil-S survival 7 → **14 crew-days**.
8. (5)+(6) restore the <5-day first-contact/first-trade target.
9. Habitability `H = min(food, water) × (0.8 + 0.2·medSat)` — medicine boosts,
   never hard-gates; it still gates illness.
10. Growth r = 0.02 → **0.05**.
11. Trace mining 0.5 → **2 T/day**, flat (exempt from E).
12. Fuel cell recipe: **1 crystal + 1 silicon → 2 cells** (Nox ×2).
13. Crystal extractor 2/5/12 → **8/16/32 T/day**.
14. Generic industry throughput defined: **10/20/40 batches/day × E** by level.
15. Cell sinks rescaled: stargate 250 cells + 400 steelH + 100 crystals;
    artificial planet 8 000 cells + 15 000 steelH (+2 000 crystals, 10 cores).
16. Telescope & probe_pad are **tile-free infrastructure**; starter planets
    guarantee **≥8 tiles** + deposits {ore, carbon, hydrogen, climate crystal,
    lithium|gold}.
17. **Demolish rule**: any building → 50% refund, tile freed, 6 h.
18. colony_program **T4 → T3 and never seed-masked**; terraform core minted at
    **shipyard_M** (politics-free).
19. Colony fitting 2 000 → **400 cells + 150 steelH + core**; min settlers
    500 → **200**; Civil-M eligible (not only L).
20. Conquest: **forced combat-landing** allowed once defenses are destroyed
    (fixes the dock contradiction); plunder 50 % → **25 %**.
21. Conquest **transfers planet-bound governors with the world** (consistent
    with planet-trade rule; closes the permanence-laundering exploit; canon
    "you lose the NPC" still holds — you lose it to the conqueror).
22. **Disengage rule**: speedEff ≥ 1.25× attacker's ⇒ exit combat after 3
    rounds (speed/armor finally matter; farming capped).
23. Heavy weapons 90/140 → **55/85** (no more 1-round crusader alpha).
24. Bee external-OBS penalty ×0.25 → **×0.6**.
25. Turrets: heavy ATK 70 → **160**, mitigation 0.30, costs published (light
    10 steelL / heavy 40 steelH); turrets fire on hovering ships at full ATK;
    building HP defined 150/300/600.
26. Junk: 15 HP per 30 T, max 1 field per 0.5 pc cell, **decay 10 %/day**,
    dump limit 5/day/ship, attribution readable at telescope L3, **no-dump
    zone 50 pc** around an only-planet starter, gate exits scatter arrivals
    U(0–5) pc.
27. Containers ×3: Cargo S/M/L = 3 / 6→18 / 24→72.
28. **New-account shield**: assets of accounts < 14 d cannot be engaged unless
    they fire first.
29. Salvage: cargo drop 40 % → 30 %, junk mass 30 % → 20 % (hulls no longer
    outvalue freight).
30. Placement cost default = **50 % of unlock cost**; market unlock gold →
    carbon.
31. NFT extract: **48 h "packing" state** (vulnerable, cancelled by hostile
    damage), blocked while any hostile event targets the asset or it is
    escrowed; frozen planets enter **custodial mode** (snapshot; production
    halts; still physically annihilated by supernova — *the token is a deed,
    not a bunker*).
32. Pods & NFT mint **locked for accounts < 45 d**; burned assets credit only
    the minting account for 60 d (kills farm-mint-transfer-burn RMT).
33. Pod pricing: purchases count into supply **immediately** (price impact),
    floor 5 units, cap 10 pods/day/account; census = trimmed weighted mean.
34. Auctions: winner pays **max(second + 5 %, reserve)**; single bidder pays
    reserve; escrow is **system-held**, auto-refunded, plunder-exempt; 1 %
    non-refundable listing bond (anti-shill).
35. Trade/auction listings **must display the effective governance mask**.
36. Auto-trade default max-price bound (3× census median) + survival-dry
    alarm + auto-flee default policy.
37. Stars **flare visibly below 5 % stock** (public within scope) — an
    evacuation/response window; harvest attribution at telescope L3.
38. Settler losses use a **fractional accumulator per route** (no free
    sub-20 cohorts).

### Deliberately NOT patched (accepted as design)

- Residential-before-sweet-spot being a trap: real strategy, keep.
- Toll gouging, junk area-denial (post-decay), thin-pair arbitrage, survival
  pricing (bounded): player politics — the game supplies levers.
- Piracy remaining somewhat more profitable than hauling at chokepoints:
  intended profession; target ratio ≈ 2–3×, monitored.

### Open monitors (test in round 2+)

- M1: fiat planet packs inject deposits (~28 000 T/planet) — needs a
  supply-side governor if sales spike (watch cells-inflation target).
- M2: post-patch piracy-vs-hauling ratio (target 2–3×).
- M3: artificial-planet cost feasibility for a 3–5-planet empire (~100–200
  refinery-days — endgame-appropriate?).
- M4: single-bidder auctions now settle at reserve — reserve-setting UX.

---

## Round 2 — verification (2026-07-12)

Two fresh verifier campaigns against guide v0.2: an **early-game/economy
re-run** (Voyager+Industrialist merged) and a **combat/exploit re-audit**
(Corsair+Breaker merged). Findings and any further patches appended below.
