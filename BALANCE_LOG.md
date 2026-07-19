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

### Round-2 findings (adversarial re-audit, 2026-07-12)

**Combat arithmetic (heavy 55/85, disengage, turret 160/0.30, bee ×0.6)**

- **R2-1 (minor).** Crusader alpha = 4×85×1.4 OBS = **476**, still ≥ every
  unarmored HP pool (max Cargo-L 400) — patch 23's "no 1-round alpha" goal is
  only met for armored targets (L1 armor suffices: 520 HP vs 405 dmg).
- **R2-2 (serious).** Disengage vs static defenses: turrets have speedEff 0,
  so **any** ship's speedEff ≥ 1.25×0 ⇒ every attacker auto-exits sieges
  after 3 rounds. A crusader kills 1–2 heavy turrets per risk-free 3-round
  pass (333 dmg/round vs 400 HP·0.30 mit), repairs at 20%/h, repeats; turret
  repair is undefined. Salami-siege costs the attacker only steel.
  *Fix: disengage applies only to the non-initiating ship in ship-vs-ship
  combat; planetary-defense engagements exempt.*
- **R2-3 (serious).** Aggressor disengage: escort policy "engage what engages
  the convoy" makes the escort the *attacker*, so an engine-L2 pirate
  (28.6 ≥ 1.25×22) kills the freighter in 3 rounds and auto-exits the escort
  — zero-commitment hit-and-run. *Fix: combat initiator forfeits disengage
  for the engagement.*
- **R2-4 (serious).** Disengage protects no intended victim: loaded Cargo-M/L
  speedEff ≤ 15.3 can never reach 1.25× a bee/bird (28–39). Only empty ships
  escape — i.e. only worthless targets. Patch 22 is a dead letter for haulers.

**Piracy ROI (M2 monitor: FAIL)**

- **R2-5 (game-breaking vs target).** Gate scatter U(0–5) pc < r_engage
  3×1.5 (OBS L2) = 4.5 pc ⇒ **≥81% intercept** from a single camper — "no
  pinpoint camping" fails arithmetically. Income per Cargo-M kill: 30%×18 T
  + 20%×~150 T junk ≈ 8–11 T-eq vs hauler ~1 T-eq/day ⇒ **~8–14× hauling**
  (target 2–3×). Containers ×3 raised pirate take 2.25× alongside hauler 3×.
  *Fix: scatter U(0–15) pc, salvage 15%, plus R2-3 aggressor lock so escorts
  actually deter.*

**Patch re-breaks**

- **R2-6 (serious).** Vault-before-attack survives patch 31: telescope
  warning at speed ≤30 pc/day is *days–weeks*, packing is 48 h — any
  telegraphed war is dodged by freezing. Conversely, the "blocked while a
  hostile event targets the asset" clause lets a griefer block a rival's
  legitimate extraction forever with free attack-postured flybys. *Fix:
  only actual damage cancels packing; frozen planets stay conquerable as a
  deed transfer (occupation lien).*
- **R2-7 (serious).** Burn-to-minter-60d is bypassed **without the bridge**:
  pod NPCs are ordinary tradeable non-fungibles — a 45-day farm account
  auctions its Legendary to the main for a token reserve in-game. 60 d is
  also maturity, not prevention, for staggered farm pipelines. *Fix:
  pod-sourced NPCs account-bound 60 d.*
- **R2-8 (serious).** Auction escrow = cheap invulnerability vault: relist
  any asset (planets included) at ~2× value on rolling 72 h auctions;
  "not attackable-in-escrow" grants permanent plunder/conquest immunity. The
  1% bond is denominated in the seller-chosen reserve resource, so a
  worthless self-abundant resource makes it free. *Fix: bond in cells (or %
  of census value); listed planets remain attackable, sale voids on
  conquest.*
- **R2-9 (serious).** 14-day shield abuse: free throwaway accounts are
  invulnerable scouts and mules — hover ISR over enemy worlds, and the
  100 T/day receive-cap still permits ~100 T/day blockade-proof smuggling.
  Unarmed starters can never "fire first", so the shield never drops. *Fix:
  shield voids beyond N pc of own starter or on any transfer to/from another
  account's assets.*
- **R2-10 (serious).** Forced combat-landing (patch 20) snipes colonies: a
  72 h-old colony has no turrets ⇒ "defenseless" ⇒ conquerable at hour ~97
  for one Combat-M sortie, torching ~400 cells + 150 steelH + core + 200
  settlers. Undermines the 15–30 d second-planet target. *Fix: 14 d conquest
  grace for freshly established colonies.*
- **R2-11 (OK).** Settler fractional accumulator holds: route-swapping gains
  at most <1 death per route ever; long-run toll is 5% regardless. Specify
  route = persistent (origin, destination) planet pair.
- **R2-12 (minor, accepted).** Governor-transfer-on-conquest makes
  legendary-governed worlds theft targets ("conquer the piñata"). Acceptable
  stakes-politics, but GAMEBOOK §12 says the NPC "is lost" on conquest —
  amend canon to "lost to the conqueror".

**New surfaces**

- **R2-13 (minor, spec bug).** LP-withdrawal guarantee vs physicality: if
  pool reserves sit in planet stock the owner can spend/strand them; if
  system-held, that is a *second* physicality exception contradicting §18
  "escrow is the sole exception". Define custody explicitly.
- **R2-14 (minor).** Premium floors: EV fine (€12.99 ⇒ E[qMult] ≈ 2.7 vs
  1.5 base — ~1.8× deposits for 4.3× price). But specify **clamp-to-floor**
  (F/E/D reroll as C), not truncation-renormalisation, else the €10 floor
  quietly gives 15.8% A-rolls vs the "A/B never purchasable" rule's intent.
- **R2-15 (minor).** Gate-exit scatter U(0–5) is *live* randomness,
  contradicting §1 "live play is fully deterministic" and GAMEBOOK §20
  no-RNG. *Fix: scatter = seeded hash(shipId, tick) — deterministic.*

**Hard requirement & targets**

- **R2-16 (PASS).** 7-day retention: shield (14 d) + no-dump 50 pc +
  unconquerable-only-planet + ping/chat unblockable + starter guarantee ⇒ no
  player action found that blocks days 1–7. Worst case (hostile sole
  neighbour) delays *trade*, not retention-path activities.
- **R2-17 (serious, target arithmetic).** First-trade <5 d is unmeetable at
  the far shell: neighbour at 350 pc vs Cargo-S fuel range 240 pc and
  survival ceiling 336 pc — far-shell spawns cannot even reach their
  guaranteed contact one-way. Needs shell 150–250 pc, or the target restated
  as "meet-in-the-middle" (75–175 pc each ⇒ 3.1–7.3 d).

**Canon conflicts (amend GAMEBOOK first, per its own rule)**

- **R2-18.** GAMEBOOK §13 AMM "toward perfect balance (50/50)" vs guide
  §11.2 owner-ratio seeding. — §16 "frozen = indestructible by the sim" vs
  guide §14 supernova annihilates frozen planets. — §6 "fixed void
  coordinate" vs exit scatter. — §12 conquest NPC "lost" vs transfer (R2-12).

**Round-2 verdict: ANOTHER ROUND** — R2-2/3/4/5 (combat & piracy), R2-6/7/8
(vault & laundering) and R2-10 need patches before v0.3 verification.

**Economy verifier findings (same round)**

- **R2-E1 (blocker).** Round-1 patch 18 was mis-applied: guide §5 still put
  terraform cores at shipyard_M (Industrialist) — free colonization re-sealed
  for non-Industrialists. *Fix: cores politics-free.*
- **R2-E2 (blocker).** Civil-M hulls required shipyard_M (T3 Industrialist,
  seed-maskable) — same re-seal. *Fix: T2 shipyard builds S+M hulls.*
- **R2-E3 (serious).** Silicon not in the starter guarantee ⇒ cell chain
  throttles to 4 cells/day after day ~4 (colony ≈ 100 d). *Fix: guarantee it.*
- **R2-E4 (serious).** Colony fitting's 150 steelH = 150 uranium (not
  guaranteed) ⇒ +75 d. *Fix: fitting uses steelL.*
- **R2-E5 (serious).** Tile budget: full chain = 10 tiles vs ≥8 guaranteed.
  *Fix: starter ≥10 tiles.*
- **R2-E6 (minor).** Oxygen not guaranteed ⇒ water gates pop ~2 000 after
  day 10. *Fix: guarantee it.*
- **R2-E7 (minor).** §19 targets self-contradict (second planet 15–30 d vs
  colony 30–45 d). *Fix: align 30–45 d.*
- **R2-E8 (minor).** Fuel unit ↔ ton conversion undefined (fuel hauling
  incomputable). *Fix: 1 u = 1 T.*
- **R2-E9 (OK).** Bootstrap-to-contact (day ~2), population dynamics
  (u=0.6→0.7 in ~10 d), burn ÷4, containers ×3, pop-1200 start: all verify
  clean; no new breaks from round-1 patches except those above.

### Round-2 applied patches (→ DESIGN_GUIDE v0.3)

39. Terraform core: **workshop L2 recipe, politics-free** (R2-E1).
40. **T2 `shipyard` builds S and M hulls** (common mask); T3 `shipyard_M` →
    bulk/faster M + prerequisite for L (R2-E2).
41. Starter guarantee: **≥10 tiles**; deposits add **silicon + oxygen** (now
    ore, carbon, hydrogen, oxygen, silicon, climate crystal, lithium|gold)
    (R2-E3/5/6).
42. Colony fitting: 400 cells + **150 steelL** + core (R2-E4).
43. **1 fuel unit = 1 T** (haulable in containers) (R2-E8).
44. Neighbor shell 150–350 → **150–240 pc** (inside Cargo-S fuel range);
    targets restated: contact **<3 d**, first physical trade **<8 d**;
    second-planet & colony targets aligned **30–45 d** (R2-17, R2-E7).
45. **Disengage reworked** (R2-2/3/4): only the **non-initiator** may
    disengage; initiator locked 20 rounds; vs structures no disengage;
    initiator = first hostile actor of the engagement group (defensive-policy
    responders are non-initiators); escape round = `ceil(3 ×
    attackerSpeed/victimSpeed)`, cap 8 — armor+speed together decide who gets
    away.
46. Piracy ROI: exit scatter **U(0–15) pc, seeded-hash deterministic**
    (R2-15), cargo salvage 30→**15%**, junk mass 20→**15%** (R2-5).
47. NFT vault killed (R2-6): packing cancelled **only by actual damage**
    within the window (no flyby denial); **frozen planets remain attackable &
    conquerable** — conquest rewrites the deed; a burned token yields the
    world only if the minter still controls it. *The token is a deed, and
    wars rewrite deeds.*
48. **Pod-sourced NPCs account-bound 60 d** (no trade/auction/mint) (R2-7).
49. Auctions: bond = **1% of census value, paid in cells**; **listed planets
    remain attackable** (sale voids on conquest); system escrow custody only
    for movable assets; relist cooldown 72 h (R2-8).
50. New-account shield **voids beyond 100 pc of own starter or on any
    inter-account transfer**; receive-cap unchanged (R2-9).
51. **New colonies: 14 d conquest grace** (blockade legal, conquest not)
    (R2-10).
52. LP custody defined: reserves physically on-planet; **LP claims survive
    conquest** (conqueror inherits pool obligations) (R2-13).
53. Premium quality floors **clamp** (reroll-below-floor-to-floor); A/B odds
    never rise above base (R2-14).
54. Crusader-vs-unarmored one-shot **accepted as design** (capital weapons
    should delete unarmored freighters; armor is the counter) (R2-1).
55. Settler route defined as persistent (origin, destination) pair (R2-11).

### Canon amendments applied to GAMEBOOK (per its change rule)

- §6: void exits scatter deterministically near the fixed coordinate.
- §12: conquest-bound NPCs are lost **to the conqueror** (transfer, not
  death); ship/building NPCs still die with their hosts.
- §13: AMM initial price = owner's seeding ratio (perfect-balance wording
  removed); escrow noted as the sole physicality exception.
- §16: frozen assets are deeds, not bunkers — supernova and conquest still
  apply; extraction requires a vulnerable packing window.
- §22: stars flare visibly below ~5% fuel (the one warning the universe
  gives); harvest attribution readable at high telescope levels.

## Round 3 — verification of v0.3 (2026-07-12) — **VERDICT: SATISFACTORY**

Focused verifier over patches 39–55: **all 17 present in the text and
arithmetically closing.** Key confirmations:
- Free (Civic) colonization chain end-to-end: colony lands **day ~32–43** —
  inside the 30–45 d target; workforce and refinery never bind; crystal
  extraction is the pacing input (as intended).
- First contact < 3 d; first physical trade **~7 d median** (meet-in-middle),
  far-shell one-sided ≈ 10 d — targets pass.
- Disengage v0.3: armored haulers escape, unarmored die, initiators commit,
  sieges favor defense (crusader vs 3 heavy turrets now loses) — no new
  degenerate found.
- Piracy ROI **~1.5–2.7×** hauling — inside the 2–3× professional band.
- Vaults closed: extraction needs 48 h undamaged; frozen/auctioned planets
  stay conquerable; pod-NPC laundering bound; shield mules geometrically
  impossible.

Six polish items found (all trivial/minor), applied immediately:
1. §17 stale "day 5" cross-ref → aligned with §19 targets.
2. `colony_program` declared **tile-free** (chain = 10 tiles = guarantee).
3. Host transfers inherit the **strictest account-bind** of bound NPCs.
4. Auction escrow ~50% uptime weak-vault → added to monitors (M5).
5. Colony grace defined: **no conquest and no a2g bombardment** for 14 d;
   blockade/tolls legal.
6. §18 summary now states the shield's void conditions.

**The balancing loop is closed. DESIGN_GUIDE v0.3 is the foundation spec.**
All [TUNE] values remain tunable by construction; monitors M1–M5 carry into
implementation playtesting.

---

## Honesty note & Round 4 (scheduled) — content-breadth audit (2026-07-12)

**Owner asked whether the emptiness found in the prop set also existed in the
mechanics and the simulation loop. Factual answer:**

- **Systems: complete and simulated.** Rounds 1–3 exercised every *system*
  (spawn/bootstrap, population/efficiency, depletion, tech unlock/place,
  industry chains, movement/interception, combat/conquest/hijack/salvage,
  AMM/auctions/pods, colonization, NFT bridge, monetization) with closed-form
  arithmetic on the core numeric set.
- **Content breadth: WAS thin, like the props.** Until today the guide carried
  stat tables for only ~10 buildings, 2 turrets and 1 hull-upgrade matrix;
  casino/diplomatic/commerce district effects were placeholders. The sims
  therefore validated the economy through the *core chain* (mine → refine →
  cells → ships/colony/war), NOT through the full catalog.
- **Fixed today (Session 14):** DESIGN_GUIDE §5.1 now carries the complete
  27-building catalog with per-level effects, §10.1 the complete 6-type/15-
  sprite ground-unit table, §8 the per-hull upgrade/accessory sets (incl.
  climate shields). All new values are [TUNE] and **NOT yet simulation-tested**.

**⇒ Round 4 (content balancing) is REQUIRED and scheduled (BACKLOG P0.4):**
archetype campaigns re-run against the full catalog — casino/commerce fee
economies, research_center unlock-discount stacking, cannon/anti-air vs hull
matchups, shield-gated climate operations, weapon-foundry item throughput.
Until Round 4 passes, catalog-wide values are draft, and this log says so.

---

## Round 4 — content-catalog balancing (2026-07-12) — **PATCHED → guide v0.4**

Two campaigns over the full Session-14 catalog (per the CLAUDE.md
completeness rule — no half-tested content).

### 4a — Content economy (7 findings)
- **F1 casino/commerce/market stack:** no dominance (trade-tax ≈ 1:80 vs
  production) but T3 commerce was economically dead + two wording bugs
  (percentage-points reading = game-breaking; market L3 zeroed the house cut
  the casino multiplies). → fees restated in **basis points** (LP 25 bp,
  house 25 bp), casino +5% **relative**/level, market L3 cuts the **LP leg**
  only, "happiness slot" deleted.
- **F2 research stacking → free unlocks (−105% worst case):** discounts now
  **multiply, best scientist only, hard cap −50%**.
- **F3 fuelcell_plant "×2 per level pair" ambiguity** (worst readings ×8 or
  double yields): own line **40/80/160 batches/day**, yields unchanged;
  **max 1 extractor per deposit** (anti vein-stacking).
- **F4 residential L3 vs bell:** trap confirmed & healthy (E-trough 0.96→0.72,
  ~24 d regrowth); stated **additive +15 pp/level** + mandatory UI projection.
- **F5 weapon_foundry burst buckets:** → **continuous mint** (1 item /
  168·84·42 h × E); monitor **M6: items minted vs destroyed**.
- **F6 diplomatic ping-range contradicted scope canon** (fog-of-war leak):
  → ping **quota** +10/day/level + share-grant slots +2/level; treaty ≡
  standing share/route grant.
- **F7 (blocker) 19 missing T2+ unlock costs:** full cost table adopted into
  §5.1 (colony_program kept light to preserve the day-32–43 window).

### 4b — Content military (8 findings + shield rule)
- Full unit×hull matchup table computed: **ladder sound** (lights kill bees,
  heavies kill birds, only crusaders crack garrisons).
- **F2 tank_ground dead** (no reachable target): → fires on **landed &
  force-landing ships ×1.5** — punishes the 24 h conquest hold.
- **F3 cannon range undefined:** → **hover band only (~1 pc)**; engage-bubble
  sieges stay untouched (intended).
- **F4 "atmospheric" undefined** (AA clause unreachable): defined = hovering /
  landed / force-landing; per-unit targeting matrix stated.
- **F5 tank_combined strictly dominated:** ATK 50 → **70** at 30 steelL.
- **F6 fortress math:** 40×heavy-L2 needed ~28 crusaders (5:1 defender edge,
  unbreakable turtle). → **garrison slots weighted by level (L1/L2/L3 =
  1/2/3)** ⇒ maxed defense ≈ 14 crusaders; monitor **M7: assault-vs-turtle
  cost ratio (target 2–3:1)**.
- **F7 raze scale:** one bird razed a colony in ~1.5 h; Mercantile worlds
  couldn't build ANY defense (turret_light was Militarist). → buildings
  **untargetable while garrison > 0**, building HP **×10** (1 500/3 000/
  6 000), **turret_light politics-free** (self-defense is never gated).
- **F8 minors:** turret_light mit 0 explicit; bee-a2g fitting warning (UI);
  initiator may withdraw after the 20-round lock by leaving range.
- **Climate-shield rule adopted** (closes GAMEBOOK §27 open): hostile-
  environment ops without the matching shield = deterministic hull wear
  5 %/day; temperate always safe (no starter grief); buildings exempt.

**Verdict: catalog balanced under the patched wording — guide bumped to
v0.4.** No round 1–3 system patch re-opened. Monitors now M1–M7.

---

## Erratum round 4b-F7b + Round 5 (2026-07-12) — BUILD ≠ INSTALL

**Owner correction (canon):** manufacturing and installing are separate acts
— the keystone of the whole economy. Ground units (cannons, turrets, tanks)
are **portable items**: produced where politics/tech allow ("raising the
card" on a military world), then hauled (1 large item/container), traded, and
installed anywhere the owner has delivery + permission. Worlds with no
military production defend by **importing units** or **hovering defensive
ships** — protection is a market, not a politics flag.

- **4b-F7b ("turret_light politics-free") is SUPERSEDED** — it patched the
  symptom (Mercantile worlds defenseless) instead of the cause (conflated
  build+install). Production returns to Militarist; installation is never
  politics-gated. GAMEBOOK §9 now carries the principle as canon.
- Audit of prior rounds under the corrected model: rounds 1–3 did not model
  unit provenance (unaffected); 4b fortress/garrison math is provenance-
  independent (stands); 4a economy numbers unaffected — a NEW defense-items
  market opens (intended; it is the point).

**Round 5 (targeted verification, launched):** produce→haul→install chain
timings vs raze threats; defense-import market viability for a Mercantile
hub; exploit sweep on the separation (units as plunder-proof value storage,
uninstall-before-conquest, install-during-siege, mercenary garrison
swapping).

### Round 5 — results (PATCHED → guide v0.5)

- **R5-1 (blocker):** no unit-production line existed → **military_district
  produces units** (1 / 48·24·12 h × E by level, queue, levels ≤ district
  level, cost = §10.1 column) + 6 unit-card unlock costs adopted.
- **R5-2 (verified):** Mercantile hub imports 6 heavy turrets from 100 pc in
  **≈8 d ex-stock / 14 d ex-works** — inside the 14 d colony grace if ordered
  at founding. Fee income alone can't fund defense (trading margins must —
  "protection is a market", intended). **Monitor M8**: defense-package cost
  vs hub income mix; UI nudge "order defense at founding".
- **R5-3 (pass):** naked window = haul time only (first turret re-shields
  buildings); 1 armored hovering Combat-M ≈ 1 raider bird — documented.
- **R5-4/6 (serious):** uninstall-under-siege & install-conveyor → one rule:
  **siege lock** (no install/uninstall while hostiles engaged) + off-siege
  concurrency 3.
- **R5-5 (serious):** plunder-proof warehousing → warehoused items count as
  stock for the 25% plunder (census value); installed units captured with
  the world.
- **R5-7 (minor):** mercenary garrison swap legitimate; **upkeep follows the
  unit everywhere**, unpaid ⇒ offline.
- **R5-8 (minor):** ground units added to the §14 mintable list (uninstalled
  only).

**Verdict: BUILD ≠ INSTALL holds.** Round-5b confirmation pass pending (the
R5-2 arithmetic used the proposed rates — re-check now that they are in the
guide). Monitors: M1–M8.

### Round 5b — confirmation (guide v0.5 → v0.5.1)

- Text check: all 7 round-5 patches present, no garbles.
- R5-2 re-run at official rates: **ex-stock 7.0 d / ex-works 13.7 d** vs the
  14-d grace — confirmed, thin ex-works margin (~7 h): the "order defense at
  founding" nudge is load-bearing (M8).
- Lone-bee lock: no durable grief (garrisons kill it ≤1 round; undefended
  worlds rotate ~1 bee/2 d and one hired escort ends it — counterplay is the
  keystone working as intended).
- **Two wording patches applied (v0.5.1):** (1) conquest voids outbound item
  listings — escrowed items return to stock BEFORE plunder (closes the
  25:1 escrow-vault dodge; upgrades monitor M5 to patched); (2) siege lock =
  **active combat event only** (hover/posture never locks installs);
  (+ clarifier: offline units don't count toward garrison>0).

**ROUND 5 CLOSED — CONFIRMED. BUILD ≠ INSTALL is verified canon.**
Monitors: M1–M8. Guide at v0.5.1.

---

## Round 6 — warehouse & fungible caps (2026-07-12) — PATCHED → guide v0.7

### 6a — Warehouse logistics & exploits
- **Factory blocking PASS:** storage costs ≈55% of stored value + a tile —
  hoarding >2–3 months is physically impossible; the block forces markets.
- **Docks specified:** L1 2 S / L2 +2 M / L3 +2 L, dock accepts hulls ≤ size.
  **Serious:** fresh colonies have S docks only → heavy-unit delivery needs
  spaceport L2 first — M8 nudge extended ("upgrade spaceport at founding");
  R5-2 margin shrinks but holds.
- **Crew release vs pod sink: SURVIVES** (pilot demand −60–80%, carried by
  governors/rarity/war churn). Monitor **M9** (pods vs NPC deaths vs governor
  installs); tuning lever = release cost/cooldown, never revoking the canon.
- **Forward staging on ally worlds: accepted** (FOBs are politics; the cache
  is the ally's conquest-spoil). Monitor **M10**: allied-parked standing cost
  0.1 cells/day IF forward-caching dominates.
- **Crewed sales:** listing auto-releases crew to seller. **Impound rule**
  adopted for ally betrayal (hold-fire → 72 h auto-uninstall).
- **Gate-raid doctrine stated:** warehouse ground reserves = the only
  reactive defense vs 0–12 h gate arrivals.
- Buffer has no L slot → heavy production requires a warehouse [owner to
  confirm]. Foundry vs 10-item buffer: never binds (~18–74 d).

### 6b — Fungible storage caps (owner-directed study)
- **F1 (game-breaking, fixed):** without a base allowance the starter spawns
  OVER cap (mines halted day 0) — the owner's "plancher" is mandatory.
  **Adopted: S 800 / M 1 000 / L 1 200 T free allowance.**
- **F2 (game-breaking, fixed):** full-bell throttle would punish LOW stock
  (post-pickup death spiral) — **one-sided brake** adopted (free ≤0.7,
  right-branch above, halt at 1).
- Depot ladder kept (200/400/600 T) + leveling costs; tile tax 5–20% ≤ 20% ✓;
  blockade pressure: starter 24 d (retention-safe), hubs 4–9 d (weapon on
  target timescale); depots = siege endurance.
- Fuel shares the cap; **AMM pool reserves count against caps** (depot farms
  = Mercantile specialization); swaps may overfill, only production halts.
- Plunder bounded by 0.25×cap → predictable raid yields; census totals
  bounded → pod price floors stabilized.

**Verdict: warehouse + caps sound — guide v0.7. Monitors M1–M10.**

---

## Round 7 — market topology & manual channel (2026-07-12) — PATCHED → v0.8

- **F1 (pass):** max-hub (7 channels) fits a 20-tile large with 3 tiles spare
  — but only ~1.4% of worlds qualify; rational hubs run 2–4 pairs; breadth
  migrates to multi-planet networks. Fees never fund breadth (4-yr payback)
  — margins do, per R5-2. Pair scarcity is physical, as intended.
- **F2 (patched, 1 line):** cells-star is the ONLY feasible multi-resource
  topology (N−1 buildings vs N(N−1)/2) — cells-as-reserve is now design
  fact; cross non-cells trades pay 100 bp.
- **F3 (patched):** "hospitality triad" convention (food/water/fuel vs cells)
  + UI nudge — survival auto-trade never breaks silently (25% alarm +
  auto-flee already prevented deaths).
- **F4a (serious, patched):** manual-offer spam → 1 open offer/(buyer,item),
  20/day/account, 48 h expiry.
- **F4b (stated):** public warehouse = advertisement AND leak; war reserves
  → private. The split is the strategic choice.
- **F4c (patched):** census publishes GLOBAL totals only; private contents
  never enumerated to players.
- **F4d (accepted):** manual channel can't touch the AMM (fungibles never
  enter warehouses); item fee-bypass ≈ the 1% bond — relationship trading.
- **F5 (serious, patched):** dock-squat trade-DoS (6 throwaway Cargo-S lock
  a hub) → max grounded dwell 24 h + auto-undock eviction (off-siege);
  allies with a share grant browse from orbit (no dock); reserve 1–2 docks.

**VERDICT: topology viable — guide v0.8. No prior round re-opened.**

### Addendum round 7 — merchant-planet exception (owner canon)

Mercantile-governed planets trade survival resources (water/food/oxygen)
innately: no market building, owner-set keep-floor, surplus tradeable at
owner-set fixed rate. Round-7 stance confirmed by owner: everything else
stays player-lore outside hardcoded mechanics. **Monitor M11:** innate
survival trading vs market-building economy (does it cannibalize food/water
pairs? — expected no: it *frees* merchant tiles for value pairs) — verify in
the next full round rather than a dedicated sim (single small rule).
Flagged interpretations: merchant = effective Mercantile governance; strict
survival list (no fuel); pricing = fixed-rate + house cut.

### Addendum round 7 (owner amendments)

- **Fuel joins the merchant innate list** (water/food/oxygen/fuel) — the
  whole hospitality triad is redundant on merchant worlds.
- **Market trade slots = building level (1/2/3)** — round-7 tile arithmetic
  improves a fortiori: max-hub 7 channels now = 3 buildings (L3+L3+L1)
  instead of 7; the cells-star remains optimal (N−1 SLOTS, fewer tiles);
  F1/F2 conclusions hold with more headroom. No re-simulation required —
  the constraint only loosened in the already-verified direction.

---

## Round 8 — governance specializations (2026-07-12) — PATCHED → v0.9.1

- **F1a (game-breaking, fixed):** the sanctuary read as an orbital umbrella
  let hostile fleets park immune at third-party sanctuaries 5 pc from their
  targets (~5.5 h surprise, nothing ever at risk). Root cause: OUR
  over-broad interpretation — owner said "ON the planet". **Fixed: ground
  truce + docked-with-rights only; hover band = normal space; Combat hulls
  dock only with explicit grant; undock = normal space immediately.**
- **F1b (verified trade-off, stated):** full-diplo mask forecloses market
  L2+ — sanctuaries are mediation grounds/manual bazaars, never AMM hubs.
  The asymmetry IS the balance; do-not-fix note added.
- **F1c (accepted):** pirate fencing at neutral ground = politics.
- **F1d (PENDING OWNER):** 1 Rare diplomat makes any mining medium
  unconquerable forever (re-opens R5-5 plunder-proofing). Proposed: sanctuary
  additionally requires **diplomatic_district L3** (earned status ≈ cost of a
  defense package). Canon-level → submitted, not applied.
- **F2 (patched):** stacking formula base × {1, 1.6, 2.0}; Militarist = rate
  (never queues); Industrialist = durations only (never batches/day), retool
  ≤1/24 h; Scientific intel hard-capped +1 tier; permission privileges never
  stack.
- **F4 (patched):** privilege magnitudes = archetype constants, never scaled
  by the NPC's stat roll; G-term uses tier only. Stat-roll economy verified
  sound (smooth rarity overlap; "perfect" Legendary ≈0.03% of pods; 10/day
  cap binds wealth — not a paywall).
- **F5 (patched):** neutral ground waives contact, never the owner's
  blacklist; round-7 dwell/eviction unchanged.
- **F6 (noted):** sanctuary gates indestructible but exits scatter mostly
  outside the zone; zone defined = ground + docks.
- **F3:** post-F1a/F1d parity plausible; **Monitor M12** — governor-install
  shares by archetype, trigger >50% (lever: magnitudes, never masks).

### Round 8 — F1d resolved (owner approved)

Sanctuary = **earned status**: full-diplo governors **+ diplomatic_district
L3 built**. Closes the one-Rare-diplomat-unconquerable-mining-world hole and
re-closes R5-5. Round 8 fully closed; monitors M1–M12.

## Round 9 — Population & Employment v2 (2026-07-19) — **PATCHED → guide v0.10**

First round with a **numerical simulator** (`tools/balance/pop_v2_sim.py`,
dt = 0.1 day) instead of closed-form arithmetic: v2 is dynamic (waves,
momentum, spirals) and had to be integrated through time under scripted
management policies. Economy (build costs/pace) abstracted per Rounds 1–8;
governance/brake/runPct orthogonal (= 1).

### Findings → patches (all applied to DG §3.2-v2)

1. **F1 — natality 0.020 froze the arc.** Net growth ≈ +0.2 %/day (births
   barely beat senior deaths): exodus pressure would arrive ≈ J+500 vs the
   J+35 anchor. Sweep (n × child-epoch) showed the child epoch is LOCKED
   by the pyramid anchor (18/55/27 IS the stationary pyramid of 20/60/30) —
   the only lever is natality. **PATCH: n = 0.12/0.18/0.24** (+~4 %/day
   boom; exodus J+37–39).
2. **F2 — popScale floor 0.5 inverted the opening.** Small worlds' jobs
   shrank so far the starter was job-saturated from day 3 (target J+20).
   **PATCH: floor 1.0** — the shifting optimum bites beyond pop_ref only;
   saturation lands J+21.1.
3. **F3 — starter pop 650 was born over capacity.** The managed arc needs
   the starter BELOW early job capacity. **PATCH: starter ≈ 350** at the
   stable pyramid (~15 % early losses through grace — "the settler's
   life" — then boom).
4. **F4 — naïve death clocks never finished.** `P/horizon per day` on a
   shrinking P decays exponentially; canon says *everyone* dies.
   **PATCH: linear to a FIXED deadline** set at stock-out, cleared on
   recovery. Measured exact: water +3 d, food +10 d, oxygen instant.
5. **F5 — over-cap parabola 15× too weak.** At 0.015 the boom outran it
   (worlds settled at 2.3 × cap). **PATCH: 0.25** → equilibrium ≈ 1.31 ×
   cap (peak 1.48), clinics still shift it upward.

### Verified behaviours (no patch needed)

- **The over-staffing trap works as designed**: pinning τ at tolerance by
  cramming everyone into buildings floors Ē at 0.12 and divides production
  by 8 — visibly the wrong play. Rational loop = staff at optimum, export
  cohorts ≥ 200 (the colonization minimum): Ē ≈ 1.0 held for 70 days,
  deaths ÷ 2.5, 1 339 settlers exported (the planet becomes an expansion
  engine — the owner's thesis, demonstrated).
- **No-export worlds drown** by ≈ J+55 (τ pinned, Ē 0.12) — exodus or ruin.
- Neglect 10 d fully recoverable; 30 d only by amputation (≈ ⅓ of people).
- Colony 200 stabilizes (min 195 → 1 406 by J+60) under the 14-day grace.
- Comptoir under siege (30-day stocks, imports cut): extinct J+38 —
  the siege→extinction→recolonization path is REAL; flagged to P5 (it is a
  slow, plunder-free conquest — watch, maybe price it).
- No-residential worlds halve every ≈ 45 days (slow senescence) —
  residential is "practically mandatory" without being a cliff.

### Verdict

**ALL SIX owner anchors GREEN** with the patched values: saturation
J+21.1 (target ≈ 20) · exodus J+39.1 (target ≈ 35) · neglect 10/30 d
recoverable/irreversible · clocks 3/10/instant exact · stationary pyramid
18.2/54.5/27.3 · colony stabilizes · siege measured. Boom worlds skew
young (up to ~55 % children) — accepted as identity ("nursery worlds").
Implementation may start on guide v0.10.
