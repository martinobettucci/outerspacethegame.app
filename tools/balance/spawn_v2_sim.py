#!/usr/bin/env python3
# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Pocket luck & frontière latente”; GAME_BOOK.md §19; DESIGN_GUIDE.md §2.2b; BALANCE_LOG.md §Round 10.
"""Round 10 — Monte-Carlo universe simulator for DESIGN_GUIDE §2.2b
(Pocket luck & the latent frontier — owner directive 2026-07-20).

Unlike Rounds 1-8 (closed-form economy) and Round 9 (time-integrated
population), §2.2b is a STOCHASTIC GENERATOR whose balance is emergent
across a *filling* universe: multi-starter rarity, the far-bonus richness
gradient, and the self-throttling invisibility invariant only reveal their
behaviour once thousands of pockets have accreted. So we fill a universe
player-by-player with the EXACT spawn rules and measure the anchors.

Every constant below mirrors a [TUNE] value in the shipped code
(game/packages/server/src/gen/{rolls,spawn}.ts,
 game/packages/server/src/services/world.ts). If a value here and there
diverge, THIS FILE is wrong — the code is the authority.

Owner-intent anchors being tested (§2.2b):
  A. Multi-starter is a RARE lucky bonus: P(2 starters)=1%, P(3)=0.1%;
     wilds 2/3/4 at 98.9/1/0.1%. It must not be a farmable strategy.
  B. "The farther from centre, the richer": bonus richness ρ_eff must
     actually CLIMB as the settled cluster walks outward — or we learn it
     is dead on arrival and surface options.
  C. Self-throttle: "the more crowded, the fewer bonus spawn" — skip rate
     must rise with density; the frontier must not fully starve.
  D. Invisibility invariant holds at spawn (structural: 800 pc floor >
     660 pc max telescope scope) — verified, plus tested under telescope
     adoption to bound the skip rate honestly.
  E. Reward vs reach: is a far bonus world worth the expedition?

Usage: python3 spawn_v2_sim.py [--players N] [--seed S]
       [--telescope-adoption early|mature] [--csv out.csv]
"""

from __future__ import annotations

import argparse
import math
import random
from dataclasses import dataclass, field

# ------------------------------------------------------------ constants
# Universe (shared/src/constants.ts)
UNIVERSE_SIZE_PC = 1_000_000
CENTER = UNIVERSE_SIZE_PC / 2  # 500 000 on each axis

# Pocket geometry (gen/spawn.ts)
BELT_MIN, BELT_MAX = 480_000, 520_000
POCKET_MIN_ISOLATION_PC = 150
POCKET_NEIGHBOR_MAX_PC = 240
POCKET_STAR_MAX_PC = 40
POCKET_WILD_MIN_PC, POCKET_WILD_MAX_PC = 18, 60

# Scope / visibility (services/world.ts)
BASE_SKY_PC = 60
TELESCOPE_SCOPE_PC_PER_LEVEL = 200  # max active level 3 -> +600
PROBE_SCAN_PC = 60
SHIP_SCAN_PC = 20

# Pocket luck thresholds (gen/rolls.ts luckCount) — LITERAL
LUCK_PLUS2 = 0.001
LUCK_PLUS1 = 0.011

# Far bonus worlds (gen/rolls.ts / spawn.ts)
BONUS_COUNT_MIN, BONUS_COUNT_MAX = 1, 3
BONUS_MIN_PC, BONUS_MAX_PC = 800, 4_000
BONUS_PLACEMENT_ATTEMPTS = 8
BONUS_STAR_CHANCE = 0.25
BONUS_STAR_FUEL_RICH_FACTOR = 2.0
BONUS_RHO_FLOOR = 0.25
BONUS_RHO_R0_PC = 20_000
BONUS_RHO_SCALE_PC = 80_000

# Richness -> rolls (gen/rolls.ts)
TILE_RANGES = {"s": (4, 8), "m": (6, 12), "l": (10, 20)}
SIZE_WEIGHTS = {"s": 0.5, "m": 0.35, "l": 0.15}
RICH_SIZE_WEIGHTS = {"s": 0.2, "m": 0.4, "l": 0.4}
QUALITY_WEIGHTS = {"F": 0.4, "E": 0.25, "D": 0.16, "C": 0.1, "B": 0.06, "A": 0.03}
RICH_QUALITY_WEIGHTS = {"F": 0.02, "E": 0.05, "D": 0.13, "C": 0.25, "B": 0.30, "A": 0.25}
# POP_QUALITY_MULT & DEPOSIT_SIZE_MULT proxies (shared) — relative value only.
# EXACT mirrors of shared/src/formulas.ts (POP_QUALITY_MULT, DEPOSIT_SIZE_MULT,
# DEPOSIT_BASE_STOCK_T). The size mult {1,3,10} is load-bearing: rich worlds
# skew large (size weight .15->.40 with ρ), so the reward spread across ρ is
# ~10x — an early proxy of {1,1.6,2.6} understated it ~4x (Round-10 Latecomer).
QUALITY_MULT = {"F": 1.0, "E": 1.3, "D": 1.7, "C": 2.2, "B": 3.0, "A": 4.0}
SIZE_DEPOSIT_MULT = {"s": 1.0, "m": 3.0, "l": 10.0}
DEPOSIT_BASE_T = 2_000.0  # DEPOSIT_BASE_STOCK_T (per-deposit tonnage unit)

# ------------------------------------------------------------ helpers


def luck_count(u: float, base: int) -> int:
    if u < LUCK_PLUS2:
        return base + 2
    if u < LUCK_PLUS1:
        return base + 1
    return base


def rho_eff(x: float, y: float) -> float:
    """SHIPPED model — distance from the universe centre (§2.2b as coded)."""
    d = math.hypot(x - CENTER, y - CENTER)
    t = min(1.0, max(0.0, (d - BONUS_RHO_R0_PC) / BONUS_RHO_SCALE_PC))
    return BONUS_RHO_FLOOR + (1 - BONUS_RHO_FLOOR) * t


# Candidate re-anchorings (Round 10 — evaluated once the owner rules).
# A: richness from the bonus world's DISTANCE FROM ITS OWN POCKET (the
#    explorer's expedition depth): 800 pc -> floor, 4000 pc -> saturated.
POCKET_RHO_R0_PC = BONUS_MIN_PC          # 800
POCKET_RHO_SCALE_PC = BONUS_MAX_PC - BONUS_MIN_PC  # 3200


def rho_from_pocket(d_pocket: float) -> float:
    t = min(1.0, max(0.0, (d_pocket - POCKET_RHO_R0_PC) / POCKET_RHO_SCALE_PC))
    return BONUS_RHO_FLOOR + (1 - BONUS_RHO_FLOOR) * t


# B: richness from DISTANCE TO THE NEAREST OWNED BODY (depth into the void
#    away from ALL settled players) — a purely local "void depth" proxy.
VOID_RHO_R0_PC = 200                      # just past the neighbour ring
VOID_RHO_SCALE_PC = 3800                  # saturate near the bonus band ceiling


def rho_from_void(d_nearest_owned: float) -> float:
    t = min(1.0, max(0.0, (d_nearest_owned - VOID_RHO_R0_PC) / VOID_RHO_SCALE_PC))
    return BONUS_RHO_FLOOR + (1 - BONUS_RHO_FLOOR) * t


# B' (Latecomer-recommended): richness from DISTANCE TO THE LIVE SETTLED
#    CENTROID with a FIXED scale — origin sits inside the population so
#    distance has real variance, and mean-distance-from-centroid = (2/3)R
#    grows as R ∝ √N, giving an EMERGENT temporal lift for free. Higher
#    floor so every bonus world is legibly "at least rich".
CENTROID_RHO_FLOOR = 0.40
CENTROID_RHO_SCALE_PC = 22_000
CENTROID_FALLBACK_N = 50  # tiny universe -> fall back to distance-from-pocket


def rho_from_centroid(d_centroid: float) -> float:
    t = min(1.0, max(0.0, d_centroid / CENTROID_RHO_SCALE_PC))
    return CENTROID_RHO_FLOOR + (1 - CENTROID_RHO_FLOOR) * t


def blend(base: dict, rich: dict, rho: float) -> dict:
    return {k: base[k] * (1 - rho) + rich.get(k, 0.0) * rho for k in base}


def pick(rng: random.Random, weights: dict) -> str:
    total = sum(weights.values())
    r = rng.random() * total
    acc = 0.0
    for k, w in weights.items():
        acc += w
        if r < acc:
            return k
    return list(weights)[-1]


# ------------------------------------------------------------ spatial grid
CELL = 1_000  # pc; a candidate's 3x3 neighbourhood covers the 660 max scope


class Grid:
    """Owned-body positions with per-body visibility radius, bucketed."""

    def __init__(self) -> None:
        self.cells: dict[tuple[int, int], list[tuple[float, float, float]]] = {}
        self.all: list[tuple[float, float]] = []

    def _key(self, x: float, y: float) -> tuple[int, int]:
        return (int(x // CELL), int(y // CELL))

    def add(self, x: float, y: float, scope: float) -> None:
        self.cells.setdefault(self._key(x, y), []).append((x, y, scope))
        self.all.append((x, y))

    def _neighbours(self, x: float, y: float, reach_cells: int):
        cx, cy = self._key(x, y)
        for dx in range(-reach_cells, reach_cells + 1):
            for dy in range(-reach_cells, reach_cells + 1):
                yield from self.cells.get((cx + dx, cy + dy), ())

    def visible(self, x: float, y: float) -> bool:
        # max scope 660 -> reach 1 cell each side is enough (CELL 1000)
        for ox, oy, scope in self._neighbours(x, y, 1):
            if (ox - x) ** 2 + (oy - y) ** 2 <= scope * scope:
                return True
        return False

    def too_close(self, x: float, y: float, floor: float) -> bool:
        reach = int(floor // CELL) + 1
        for ox, oy, _ in self._neighbours(x, y, reach):
            if (ox - x) ** 2 + (oy - y) ** 2 < floor * floor:
                return True
        return False

    def neighbour_within(self, x: float, y: float, lo: float, hi: float) -> bool:
        reach = int(hi // CELL) + 1
        for ox, oy, _ in self._neighbours(x, y, reach):
            d2 = (ox - x) ** 2 + (oy - y) ** 2
            if lo * lo <= d2 <= hi * hi:
                return True
        return False

    def nearest_owned_dist(self, x: float, y: float, cap: float = 6000.0) -> float:
        """Distance to the nearest owned body via expanding-ring search
        (capped; returns cap if none within). Used by the 'void' ρ model."""
        best2 = cap * cap
        max_reach = int(cap // CELL) + 1
        for reach in range(1, max_reach + 1):
            found = False
            for ox, oy, _ in self._neighbours(x, y, reach):
                d2 = (ox - x) ** 2 + (oy - y) ** 2
                if d2 < best2:
                    best2 = d2
                    found = True
            # Once a ring yields a hit, one more ring guarantees the true min.
            if found and reach >= 2:
                break
        return math.sqrt(best2)


# ------------------------------------------------------------ telescope model
def scope_for(rng: random.Random, adoption: str) -> float:
    """Visibility radius of an EXISTING owned body when a new player spawns.
    'early' = fresh universe (nobody has built a telescope yet).
    'mature' = mixed adoption bound (upper bound on skip)."""
    if adoption == "early":
        return BASE_SKY_PC
    # mature: telescope max 1 instance, level 1-3 (+200 pc each) or none
    roll = rng.random()
    if roll < 0.40:
        return BASE_SKY_PC  # not built yet
    if roll < 0.70:
        return BASE_SKY_PC + 200  # L1 = 260
    if roll < 0.90:
        return BASE_SKY_PC + 400  # L2 = 460
    return BASE_SKY_PC + 600  # L3 = 660


# ------------------------------------------------------------ per-player
@dataclass
class BonusWorld:
    x: float
    y: float
    d_center: float
    rho: float
    has_star: bool
    quality: str
    size: str
    tiles: int
    n_deposits: int
    deposit_value: float
    n_ruins: int
    ruin_score: int  # sum of ruin levels (inherited "power")


@dataclass
class PlayerSpawn:
    idx: int
    starters: int
    wilds: int
    center: tuple[float, float]
    d_center: float
    bonus: list[BonusWorld] = field(default_factory=list)
    bonus_skipped: int = 0


def roll_bonus_world(rng: random.Random, x: float, y: float, has_star: bool, rho: float) -> BonusWorld:
    size = pick(rng, blend(SIZE_WEIGHTS, RICH_SIZE_WEIGHTS, rho))
    quality = pick(rng, blend(QUALITY_WEIGHTS, RICH_QUALITY_WEIGHTS, rho))
    climate_poison = rng.random() < 0.10
    lo, hi = TILE_RANGES[size]
    tiles = 0 if climate_poison else rng.randint(math.ceil((lo + hi) / 2), hi)
    n_dep = rng.randint(4, 8)
    dep_value = (
        n_dep
        * DEPOSIT_BASE_T
        * SIZE_DEPOSIT_MULT[size]
        * QUALITY_MULT[quality]
        * (1 + 2 * rho)
    )
    raw = round(rho * rng.uniform(0, 4))
    n_ruins = max(0, min(raw, tiles // 2, max(0, tiles - 2)))
    ruin_score = 0
    p_l3 = 0.15 + 0.45 * rho
    for _ in range(n_ruins):
        u = rng.random()
        ruin_score += 3 if u < p_l3 else 2 if u < p_l3 + 0.30 else 1
    return BonusWorld(
        x, y, math.hypot(x - CENTER, y - CENTER), rho, has_star,
        quality, size, tiles, n_dep, dep_value, n_ruins, ruin_score,
    )


def place_pocket(rng: random.Random, grid: Grid) -> tuple[float, float] | None:
    if not grid.all:
        return rng.uniform(BELT_MIN, BELT_MAX), rng.uniform(BELT_MIN, BELT_MAX)
    for _ in range(512):
        ax, ay = rng.choice(grid.all)
        r = rng.uniform(POCKET_MIN_ISOLATION_PC, POCKET_NEIGHBOR_MAX_PC)
        th = rng.uniform(0, 2 * math.pi)
        x, y = ax + r * math.cos(th), ay + r * math.sin(th)
        if grid.too_close(x, y, POCKET_MIN_ISOLATION_PC):
            continue
        return x, y
    return None


def simulate(n_players: int, seed: int, adoption: str, rho_model: str = "center") -> list[PlayerSpawn]:
    rng = random.Random(seed)
    grid = Grid()
    out: list[PlayerSpawn] = []
    sum_x = sum_y = 0.0  # running settled centroid (owned bodies only)
    n_owned = 0
    for i in range(n_players):
        u_starters, u_wilds = rng.random(), rng.random()
        starters = luck_count(u_starters, 1)
        wilds = luck_count(u_wilds, 2)
        center = place_pocket(rng, grid)
        if center is None:
            break  # universe saturated for pockets (не atteint à ces N)
        cx, cy = center
        rec = PlayerSpawn(
            idx=i, starters=starters, wilds=wilds, center=center,
            d_center=math.hypot(cx - CENTER, cy - CENTER),
        )
        # Owned bodies: primary at centre + extras 18-60 pc. Star r_nova ~40
        # (S class) -> its own r_nova respected by construction; unowned.
        owned_now: list[tuple[float, float]] = [(cx, cy)]
        for _ in range(starters - 1):
            r = rng.uniform(POCKET_WILD_MIN_PC, POCKET_WILD_MAX_PC)
            th = rng.uniform(0, 2 * math.pi)
            owned_now.append((cx + r * math.cos(th), cy + r * math.sin(th)))

        # Far bonus worlds — invisibility invariant against CURRENT universe.
        n_bonus = rng.randint(BONUS_COUNT_MIN, BONUS_COUNT_MAX)
        for _ in range(n_bonus):
            placed = False
            for _ in range(BONUS_PLACEMENT_ATTEMPTS):
                r = rng.uniform(BONUS_MIN_PC, BONUS_MAX_PC)
                th = rng.uniform(0, 2 * math.pi)
                bx, by = cx + r * math.cos(th), cy + r * math.sin(th)
                d_pocket = math.hypot(bx - cx, by - cy)
                if rho_model == "pocket":
                    rho = rho_from_pocket(d_pocket)
                elif rho_model == "void":
                    void_depth = min(d_pocket, grid.nearest_owned_dist(bx, by))
                    rho = rho_from_void(void_depth)
                elif rho_model == "centroid":
                    if n_owned < CENTROID_FALLBACK_N:
                        rho = rho_from_pocket(d_pocket)  # tiny universe
                    else:
                        d_cen = math.hypot(bx - sum_x / n_owned, by - sum_y / n_owned)
                        rho = rho_from_centroid(d_cen)
                else:  # shipped
                    rho = rho_eff(bx, by)
                # Star chance scales with richness (owner decision 2026-07-21):
                # far/rich worlds — highest logistics tax — get a refuel star
                # more often. Flat 0.25 under the shipped 'center' model.
                p_star = BONUS_STAR_CHANCE if rho_model == "center" else (0.25 + 0.5 * rho)
                has_star = rng.random() < p_star
                if grid.visible(bx, by):
                    continue
                if has_star:
                    sd = rng.uniform(45, 70)
                    sth = rng.uniform(0, 2 * math.pi)
                    sx, sy = bx + sd * math.cos(sth), by + sd * math.sin(sth)
                    if grid.visible(sx, sy):
                        continue
                rec.bonus.append(roll_bonus_world(rng, bx, by, has_star, rho))
                placed = True
                break
            if not placed:
                rec.bonus_skipped += 1

        # Commit owned bodies to the grid AFTER this player's bonus check
        # (a player is not visible to their own bonus test — matches code:
        # the new owner's bodies are inserted, but the invariant is about
        # OTHER players' current visibility; own pocket is ≥800 pc away).
        for ox, oy in owned_now:
            grid.add(ox, oy, scope_for(rng, adoption))
            sum_x += ox
            sum_y += oy
            n_owned += 1
        out.append(rec)
    return out


# ------------------------------------------------------------ reporting
def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.3f}%" if d else "—"


def report(spawns: list[PlayerSpawn], adoption: str) -> None:
    N = len(spawns)
    print(f"\n===== §2.2b spawn simulation — {N} players, telescope={adoption} =====")

    # Anchor A — luck frequencies
    s2 = sum(1 for s in spawns if s.starters == 2)
    s3 = sum(1 for s in spawns if s.starters == 3)
    w3 = sum(1 for s in spawns if s.wilds == 3)
    w4 = sum(1 for s in spawns if s.wilds == 4)
    print("\n-- ANCHOR A: pocket luck (target starters 1%/0.1%, wilds 1%/0.1%) --")
    print(f"  2 starters: {s2:5d}  {pct(s2, N)}   (target 1.000%)")
    print(f"  3 starters: {s3:5d}  {pct(s3, N)}   (target 0.100%)")
    print(f"  3 wilds   : {w3:5d}  {pct(w3, N)}   (target 1.000%)")
    print(f"  4 wilds   : {w4:5d}  {pct(w4, N)}   (target 0.100%)")
    print(f"  players with a multi-starter: {pct(s2 + s3, N)}")

    # Anchors B/C/E — by cohort decile
    bins = 10
    per = max(1, N // bins)
    print("\n-- ANCHORS B/C/D/E: by cohort (as the universe fills) --")
    print(f"  {'cohort':>14} | {'pocket dc':>9} | {'bonus/plr':>9} | "
          f"{'skip%':>6} | {'ρ_eff':>12} | {'ruins/w':>7} | {'star%':>5} | {'value':>7}")
    for b in range(bins):
        chunk = spawns[b * per:(b + 1) * per] if b < bins - 1 else spawns[b * per:]
        if not chunk:
            continue
        pocket_dc = sum(s.d_center for s in chunk) / len(chunk)
        placed = [w for s in chunk for w in s.bonus]
        attempts = sum(len(s.bonus) + s.bonus_skipped for s in chunk)
        skipped = sum(s.bonus_skipped for s in chunk)
        rhos = [w.rho for w in placed]
        rho_lo = min(rhos) if rhos else 0
        rho_hi = max(rhos) if rhos else 0
        rho_mean = sum(rhos) / len(rhos) if rhos else 0
        ruins = sum(w.n_ruins for w in placed) / len(placed) if placed else 0
        stars = sum(1 for w in placed if w.has_star) / len(placed) if placed else 0
        value = sum(w.deposit_value + 40 * w.ruin_score for w in placed) / len(placed) if placed else 0
        lo_hi = f"{rho_lo:.2f}-{rho_hi:.2f}"
        print(f"  {b*per:6d}-{b*per+len(chunk):6d} | {pocket_dc:9.0f} | "
              f"{len(placed)/len(chunk):9.2f} | {pct(skipped, attempts):>6} | "
              f"{lo_hi:>7}({rho_mean:.2f}) | {ruins:7.2f} | {stars*100:4.0f}% | {value:7.0f}")

    # Frontier walk: how far has the owned cloud reached?
    max_dc = max(s.d_center for s in spawns)
    print(f"\n  frontier reach: max pocket d_center = {max_dc:.0f} pc "
          f"(ρ_eff saturates at {BONUS_RHO_R0_PC + BONUS_RHO_SCALE_PC:.0f} pc from centre)")
    rich = sum(1 for s in spawns for w in s.bonus if w.rho > 0.5)
    allb = sum(len(s.bonus) for s in spawns)
    print(f"  bonus worlds with ρ_eff > 0.50 (meaningfully rich): {pct(rich, allb)} of {allb}")
    print(f"  bonus worlds at the ρ floor 0.25 (d_center ≤ {BONUS_RHO_R0_PC}): "
          f"{pct(sum(1 for s in spawns for w in s.bonus if w.rho <= 0.2501), allb)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", type=int, default=8000)
    ap.add_argument("--seed", type=int, default=20260721)
    ap.add_argument("--telescope-adoption", choices=["early", "mature"], default="early")
    ap.add_argument("--both", action="store_true", help="run early AND mature")
    ap.add_argument("--rho-model", choices=["center", "pocket", "void", "centroid"], default="center",
                    help="richness anchor: center=shipped, pocket=distance-from-pocket, "
                         "void=distance-to-nearest-owned")
    args = ap.parse_args()

    modes = ["early", "mature"] if args.both else [args.telescope_adoption]
    for mode in modes:
        spawns = simulate(args.players, args.seed, mode, args.rho_model)
        report(spawns, mode)
        print(f"  [ρ model: {args.rho_model}]")


if __name__ == "__main__":
    main()
