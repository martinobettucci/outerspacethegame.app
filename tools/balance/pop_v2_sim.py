#!/usr/bin/env python3
# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2.pop “Campagnes simulées”; DESIGN_GUIDE.md §3.2-v2; BALANCE_LOG.md §Round 9.
"""Round 9 — numerical simulator for DESIGN_GUIDE §3.2-v2
(Population, demographics & employment v2 — THE central mechanic).

Implements the spec formulas exactly (every constant mirrors a [TUNE]
value in §3.2-v2) and integrates them through time (dt = 0.1 day) under
scripted management policies, to verify the six owner-validated balance
anchors (§3.2-v2 m):

  1. managed S-F: job saturation ≈ J+20, exodus profitable ≈ J+35
  2. neglect 10 d recoverable, 30 d irreversible
  3. famine clocks: food 10 d, water 3 d, oxygen instant
  4. stable pyramid ≈ 18 / 55 / 27
  5. a 200-settler colony that builds normally stabilizes
  6. siege-to-extinction measured

Deliberate simplifications (documented in BALANCE_LOG Round 9):
- The resource ECONOMY (build costs, throughput chains) was validated in
  Rounds 1–8 and is abstracted: building construction is gated by a
  build-pace budget (ore-equivalents from one L1 mine), not itemized.
- One recipe batch = 1 T of output for farms/waterworks (their §6 yields
  feed thousands; survival flow is never the binding constraint — jobs
  are, which is the point of v2).
- Governance G = 1, storage brake = 1, runPct = 1 (orthogonal systems).

Usage: python3 pop_v2_sim.py [--scenario all|managed|neglect|famine|
colony|overcap|siege] [--days N] [--csv]
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass, field, replace

# ---------------------------------------------------------------- params

@dataclass
class Params:
    # §a — aging epochs (days)
    child_days: float = 20.0
    active_days: float = 60.0
    senior_days: float = 30.0
    # §b — rations per 1000 heads per day (T)
    food_per_1000: float = 1.0
    water_per_1000: float = 1.0
    oxygen_per_1000: float = 0.6      # hostile climates only
    ration_cs: float = 0.6            # children/seniors ratio
    # §c — natality per active per day by residential level (0 = none)
    natality: tuple[float, float, float, float] = (0.0, 0.120, 0.180, 0.240)
    # §d — growth modulator
    eff_floor: float = 0.5            # M_eff = floor + (1-floor) × Ē
    eff_neutral: float = 0.7          # Ē with no employing buildings
    life_deficit: float = 0.5
    life_abundance: float = 1.15
    life_cap: float = 1.5
    # §e — employment
    level_mult: tuple[float, float, float] = (1.0, 2.4, 5.0)
    pop_ref: float = 2000.0
    pop_scale_exp: float = 0.5
    pop_scale_min: float = 1.0
    pop_scale_max: float = 2.0
    # §f — bell (DG §3.4, unchanged)
    mu: float = 0.70
    sigma_lo: float = 0.35
    sigma_hi: float = 0.15
    e_floor: float = 0.12
    # §g — unemployment
    unemp_tolerance: float = 0.07
    unemp_grace_days: float = 3.0
    gamma: float = 0.02
    colony_grace_days: float = 14.0
    # §h — over-capacity & illness
    overcap_illness: float = 1.2
    overcap_deaths: float = 0.25
    illness_decay: float = 0.05
    illness_deaths: float = 0.03
    clinic_reduction: tuple[float, float, float, float] = (0.0, 0.10, 0.20, 0.35)
    # §i — death clocks (days to total death once stock = 0)
    clock_water: float = 3.0
    clock_food: float = 10.0
    # build pacing (economy abstraction): ore-equivalents/day from one L1
    # mine at optimum, and per-building placement cost (Rounds 1–8 values)
    build_income: float = 9.5
    build_cost: float = 25.0


BASE_JOBS: dict[str, int] = {
    "telescope": 10, "probe_pad": 15, "depot": 10, "warehouse": 20,
    "mine": 50, "farm": 50, "waterworks": 50, "smelter": 50,
    "crystal_extractor": 50, "refinery": 50, "fuelcell_plant": 50,
    "spaceport": 30, "workshop": 40, "market": 30, "residential": 15,
    "lab": 40, "obs_station": 30, "shipyard": 60, "military_district": 60,
    "weapon_foundry": 60, "research_center": 50, "diplomatic_district": 40,
    "casino": 50, "commerce_district": 50, "faction_hq": 40,
    "stargate_yard": 80, "terraformer": 60, "artificial_planet_yard": 100,
    "clinic": 30,
}

BATCHES = {1: 10.0, 2: 20.0, 3: 40.0}   # DG §5.1 throughputs (T/day at E=1)

# S-F starter build order (uses tiles; telescope/probe_pad are no-tile)
MANAGED_BUILD_ORDER = [
    "mine", "depot", "waterworks", "farm", "residential", "telescope",
    "spaceport", "workshop", "market", "clinic", "probe_pad", "lab",
    "obs_station", "shipyard",
]


# ---------------------------------------------------------------- model

def bell(u: float, p: Params) -> float:
    if u <= 0:
        return p.e_floor
    sigma = p.sigma_lo if u < p.mu else p.sigma_hi
    return max(p.e_floor, math.exp(-((u - p.mu) ** 2) / (2 * sigma * sigma)))


@dataclass
class Building:
    type: str
    level: int = 1
    staff: float = 0.0


@dataclass
class Planet:
    p: Params
    children: float
    actives: float
    seniors: float
    pop_cap: float = 2000.0            # S-F
    hostile: bool = False              # oxygen from stock?
    tiles: int = 10
    buildings: list[Building] = field(default_factory=list)
    stocks: dict[str, float] = field(default_factory=lambda: {
        "food": 32.0, "water": 32.0, "oxygen": 20.0})
    illness: float = 0.0
    clock_deadline: dict[str, float] = field(default_factory=dict)
    day: float = 0.0
    unemp_over_days: float = 0.0
    build_bank: float = 0.0
    deaths_total: float = 0.0
    exodus_total: float = 0.0

    # ---- derived -------------------------------------------------
    @property
    def pop(self) -> float:
        return self.children + self.actives + self.seniors

    def pop_scale(self) -> float:
        raw = (max(self.pop, 1.0) / self.p.pop_ref) ** self.p.pop_scale_exp
        return min(self.p.pop_scale_max, max(self.p.pop_scale_min, raw))

    def jobs_optimal(self, b: Building) -> float:
        return BASE_JOBS[b.type] * self.p.level_mult[b.level - 1] * self.pop_scale()

    def mean_efficiency(self) -> float:
        tot_staff, acc = 0.0, 0.0
        for b in self.buildings:
            if b.staff > 0:
                e = bell(b.staff / self.jobs_optimal(b), self.p)
                acc += e * b.staff
                tot_staff += b.staff
        return acc / tot_staff if tot_staff > 0 else self.p.eff_neutral

    def production(self, rtype: str) -> float:
        out = 0.0
        for b in self.buildings:
            if b.type == rtype and b.staff > 0:
                u = b.staff / self.jobs_optimal(b)
                out += BATCHES[b.level] * bell(u, self.p)
        return out

    def consumption(self, res: str) -> float:
        heads = self.actives + self.p.ration_cs * (self.children + self.seniors)
        rate = {"food": self.p.food_per_1000, "water": self.p.water_per_1000,
                "oxygen": self.p.oxygen_per_1000}[res]
        if res == "oxygen" and not self.hostile:
            return 0.0
        return heads / 1000.0 * rate

    def resources(self) -> list[str]:
        res = ["water", "food"]
        if self.hostile:
            res.append("oxygen")
        return res

    def m_life(self) -> float:
        m = 1.0
        for res in self.resources():
            cons = self.consumption(res)
            prod = self.production({"food": "farm", "water": "waterworks",
                                    "oxygen": "mine"}[res])
            rho = prod / cons if cons > 0 else 10.0
            if rho < 1.0:
                m *= self.p.life_deficit
            elif rho >= 1.5:
                m *= self.p.life_abundance
        return min(self.p.life_cap, m)

    def residential_level(self) -> int:
        return max((b.level for b in self.buildings if b.type == "residential"),
                   default=0)

    def clinic_level(self) -> int:
        return max((b.level for b in self.buildings if b.type == "clinic"),
                   default=0)

    def unemployment(self) -> float:
        if self.actives <= 0:
            return 0.0
        staffed = sum(b.staff for b in self.buildings)
        return max(0.0, 1.0 - staffed / self.actives)

    # ---- dynamics ------------------------------------------------
    def scale_deaths(self, deaths: float) -> None:
        """Deaths strike all categories AND staff proportionally (§g)."""
        if deaths <= 0 or self.pop <= 0:
            return
        deaths = min(deaths, self.pop)
        frac = deaths / self.pop
        self.children *= (1 - frac)
        self.actives *= (1 - frac)
        self.seniors *= (1 - frac)
        for b in self.buildings:
            b.staff *= (1 - frac)
        self.deaths_total += deaths

    def step(self, dt: float) -> None:
        p = self.p
        # 1. production/consumption of survival stocks
        clock_deaths = 0.0
        for res in self.resources():
            prod = self.production({"food": "farm", "water": "waterworks",
                                    "oxygen": "mine"}[res])
            cons = self.consumption(res)
            self.stocks[res] += (prod - cons) * dt
            if self.stocks[res] <= 0:
                self.stocks[res] = 0.0
                if prod < cons:  # §i death clocks — LINEAR to a fixed deadline
                    if res == "oxygen":
                        clock_deaths = self.pop  # instant
                    else:
                        horizon = p.clock_water if res == "water" else p.clock_food
                        dl = self.clock_deadline.setdefault(res, self.day + horizon)
                        left = max(dl - self.day, dt)
                        clock_deaths = max(clock_deaths, self.pop * dt / left)
                else:
                    self.clock_deadline.pop(res, None)
            else:
                self.clock_deadline.pop(res, None)
        # 2. natality (modulated) + aging
        n = p.natality[self.residential_level()]
        m_growth = (p.eff_floor + (1 - p.eff_floor) * self.mean_efficiency()) \
            * self.m_life()
        births = n * self.actives * m_growth * dt
        aging_ca = self.children / p.child_days * dt
        aging_as = self.actives / p.active_days * dt
        aging_sd = self.seniors / p.senior_days * dt
        self.children += births - aging_ca
        new_actives = aging_ca
        self.actives += new_actives - aging_as
        self.seniors += aging_as - aging_sd
        self.deaths_total += aging_sd
        # 3. unemployment mortality (§g) — inert during colony grace
        tau = self.unemployment()
        if self.day >= p.colony_grace_days and tau > p.unemp_tolerance:
            self.unemp_over_days += dt
        elif tau <= p.unemp_tolerance:
            self.unemp_over_days = 0.0
        unemp_deaths = 0.0
        if self.unemp_over_days >= p.unemp_grace_days:
            unemp_deaths = p.gamma * (tau - p.unemp_tolerance) * self.pop * dt
        # 4. over-capacity illness & deaths (§h)
        o = max(0.0, self.pop / self.pop_cap - 1.0)
        self.illness += (p.overcap_illness * o * o - p.illness_decay
                         * self.illness) * dt
        self.illness = max(0.0, min(1.0, self.illness))
        ill_eff = max(0.0, self.illness
                      - p.clinic_reduction[self.clinic_level()])
        ill_deaths = p.illness_deaths * ill_eff * self.pop * dt
        overcap_deaths = p.overcap_deaths * o * o * self.pop * dt
        self.scale_deaths(unemp_deaths + ill_deaths + overcap_deaths
                          + clock_deaths)
        self.day += dt


# ---------------------------------------------------------------- policies

def restaff_optimal(w: Planet) -> None:
    """Daily management: staff every building toward u = 0.7, then—if
    unemployment would exceed tolerance—spread the surplus (over-staff)
    to keep τ at the tolerance edge (the owner's forced-employment trap)."""
    if not w.buildings:
        return
    targets = [0.7 * w.jobs_optimal(b) for b in w.buildings]
    ideal = sum(targets)
    avail = w.actives
    if ideal >= avail:
        frac = avail / ideal if ideal > 0 else 0
        for b, t in zip(w.buildings, targets):
            b.staff = t * frac
        return
    # surplus: keep τ at tolerance by over-staffing evenly
    need = avail * (1 - w.p.unemp_tolerance)
    extra = max(0.0, need - ideal)
    caps = [w.jobs_optimal(b) * 1.4 for b in w.buildings]  # E-floor edge
    room = [max(0.0, c - t) for c, t in zip(caps, targets)]
    room_tot = sum(room)
    for i, b in enumerate(w.buildings):
        add = extra * (room[i] / room_tot) if room_tot > 0 else 0.0
        b.staff = targets[i] + add


def export_surplus(w: Planet) -> float:
    """Rational-player valve: ship out the MIXED surplus beyond what the
    planet can employ at optimum (+5 % headroom). Returns heads exported."""
    ideal = sum(0.7 * w.jobs_optimal(b) for b in w.buildings)
    share = w.actives / w.pop if w.pop > 0 else 1.0
    needed = (ideal / share if share > 0 else 0.0) * 1.05
    excess = w.pop - needed
    if excess < 200:                     # a real colony cohort (GB §19)
        return 0.0
    frac = excess / w.pop
    w.children *= (1 - frac)
    w.actives *= (1 - frac)
    w.seniors *= (1 - frac)
    for b in w.buildings:
        b.staff = min(b.staff, w.actives)
    w.exodus_total += excess
    return excess


def build_tick(w: Planet, order: list[str], dt: float) -> None:
    """Economy abstraction: bank build_income/day, place next building
    when affordable (tiles permitting; telescope/probe_pad are no-tile)."""
    w.build_bank += w.p.build_income * dt
    placed = [b.type for b in w.buildings]
    for t in order:
        if t in placed:
            continue
        tile_used = sum(1 for b in w.buildings
                        if b.type not in ("telescope", "probe_pad"))
        if t not in ("telescope", "probe_pad") and tile_used >= w.tiles:
            return
        if w.build_bank >= w.p.build_cost:
            w.build_bank -= w.p.build_cost
            w.buildings.append(Building(t))
        return  # one candidate per tick (sequential builder)


def level_up_tick(w: Planet) -> None:
    """After the order is exhausted, level up job-heavy buildings —
    but only when the workforce can actually staff the enlarged optimum
    (a rational player never levels into an empty labor pool)."""
    ideal_now = sum(0.7 * w.jobs_optimal(b) for b in w.buildings)
    for b in sorted(w.buildings, key=lambda b: -BASE_JOBS[b.type]):
        if b.level < 3 and w.build_bank >= 6 * w.p.build_cost:
            gain = 0.7 * (w.p.level_mult[b.level] - w.p.level_mult[b.level - 1]) \
                * BASE_JOBS[b.type] * w.pop_scale()
            if w.actives < 0.8 * (ideal_now + gain):
                continue
            w.build_bank -= 6 * w.p.build_cost
            b.level += 1
            return


# ---------------------------------------------------------------- scenarios

def starter(p: Params, pop: float = 350.0, hostile: bool = False) -> Planet:
    return Planet(p=p, children=0.182 * pop, actives=0.545 * pop,
                  seniors=0.273 * pop, hostile=hostile)


def run_managed(p: Params, days: float = 60.0, pop0: float = 350.0,
                trace: bool = False, export: bool = False):
    w = starter(p, pop0)
    dt = 0.1
    sat_day = exo_day = None
    last_prod_per_a = 0.0
    rows = []
    while w.day < days and w.pop > 1:
        build_tick(w, MANAGED_BUILD_ORDER, dt)
        if all(t in [b.type for b in w.buildings] for t in MANAGED_BUILD_ORDER[:9]):
            level_up_tick(w)
        if abs(w.day % 1.0) < dt / 2:      # daily management
            if export and w.day > p.colony_grace_days:
                export_surplus(w)
            restaff_optimal(w)
        w.step(dt)
        ideal = sum(0.7 * w.jobs_optimal(b) for b in w.buildings)
        # saturation = the planet can employ EVERYONE at optimum
        if sat_day is None and w.buildings and ideal >= w.actives:
            sat_day = w.day
        # exodus profitable = the re-grown surplus reaches a colony cohort
        # (MIXED heads: settlers ship as families, children mature on site)
        prod = w.production("farm") + w.production("waterworks") + \
            w.production("mine")
        if exo_day is None and w.exodus_total > 0:
            exo_day = w.day
        if trace and abs(w.day % 5.0) < dt / 2:
            rows.append((round(w.day, 1), round(w.pop), round(w.actives),
                         round(ideal), round(w.unemployment() * 100),
                         round(w.mean_efficiency(), 2), round(prod, 1)))
    return w, sat_day, exo_day, rows


def run_neglect(p: Params, neglect_from: float, neglect_days: float,
                total_days: float = 90.0):
    """Manage well, stop restaffing during [from, from+neglect], resume,
    then measure recovery (pop & production trend 10 d after resume)."""
    w = starter(p)
    dt = 0.1
    metrics = {}
    pop_at_resume = prod_at_resume = None
    prod_before = None
    while w.day < total_days and w.pop > 1:
        build_tick(w, MANAGED_BUILD_ORDER, dt)
        if all(t in [b.type for b in w.buildings] for t in MANAGED_BUILD_ORDER[:9]):
            level_up_tick(w)
        if prod_before is None and w.day >= neglect_from:
            prod_before = w.production("mine")
        neglecting = neglect_from <= w.day < neglect_from + neglect_days
        if not neglecting and abs(w.day % 1.0) < dt / 2:
            if w.day > p.colony_grace_days:
                export_surplus(w)
            restaff_optimal(w)
        w.step(dt)
        resume = neglect_from + neglect_days
        if pop_at_resume is None and w.day >= resume:
            pop_at_resume = w.pop
            prod_at_resume = w.production("mine")
        if w.day >= resume + 10 and "pop_after" not in metrics:
            metrics["pop_after"] = w.pop
            metrics["prod_after"] = w.production("mine")
    metrics.update(pop_resume=pop_at_resume, prod_resume=prod_at_resume,
                   prod_before=prod_before, final_pop=w.pop, final_day=w.day)
    return metrics


def run_famine(p: Params, cut: str):
    """Cut a survival production at day 25 (mature colony), watch clocks."""
    w = starter(p, hostile=(cut == "oxygen"))
    dt = 0.1
    cut_day, dead_day, act_pop = 25.0, None, None
    while w.day < 80 and w.pop > 1:
        build_tick(w, MANAGED_BUILD_ORDER, dt)
        if abs(w.day % 1.0) < dt / 2:
            restaff_optimal(w)
        if w.day >= cut_day:
            if w.day < cut_day + dt:   # au moment de la coupure : 2 j de stock
                res = cut
                w.stocks[res] = min(w.stocks[res], 2.0 * w.consumption(res)) \
                    if w.consumption(res) > 0 else 0.0
            for b in w.buildings:
                if b.type == {"food": "farm", "water": "waterworks",
                              "oxygen": "mine"}[cut]:
                    b.staff = 0.0
        w.step(dt)
        if act_pop is None and w.day >= cut_day:
            act_pop = w.pop
    return {"pop_at_cut": act_pop, "final_pop": w.pop, "final_day": w.day,
            "stock_left": w.stocks[cut if cut != "oxygen" else "oxygen"]}


def run_colony(p: Params, settlers: float = 200.0, days: float = 60.0):
    w = Planet(p=p, children=0.0, actives=settlers, seniors=0.0,
               pop_cap=2000.0, tiles=10)
    w.stocks = {"food": 30.0, "water": 30.0, "oxygen": 0.0}
    w.buildings = [Building("depot"), Building("spaceport")]
    dt = 0.1
    min_pop = settlers
    while w.day < days and w.pop > 1:
        build_tick(w, ["mine", "waterworks", "farm", "residential",
                       "workshop", "market", "clinic"], dt)
        if abs(w.day % 1.0) < dt / 2:
            restaff_optimal(w)
        w.step(dt)
        min_pop = min(min_pop, w.pop)
    return {"final_pop": w.pop, "min_pop": min_pop, "days": w.day,
            "tau": w.unemployment()}


def run_overcap(p: Params, days: float = 200.0):
    w = starter(p, pop=1800.0)
    for t in MANAGED_BUILD_ORDER:
        w.buildings.append(Building(t, level=3))
    dt = 0.1
    peak = 0.0
    while w.day < days and w.pop > 1:
        if abs(w.day % 1.0) < dt / 2:
            restaff_optimal(w)
        w.step(dt)
        peak = max(peak, w.pop)
    return {"peak_ratio": peak / w.pop_cap, "final_ratio": w.pop / w.pop_cap,
            "illness": w.illness}


def run_siege(p: Params, stock_days_food: float = 30.0):
    """Comptoir world: no farms/waterworks, lives off stock (imports cut)."""
    w = starter(p, pop=1000.0)
    w.buildings = [Building("depot"), Building("market"), Building("spaceport")]
    heads = (w.actives + p.ration_cs * (w.children + w.seniors)) / 1000
    w.stocks["food"] = stock_days_food * heads * p.food_per_1000
    w.stocks["water"] = stock_days_food * heads * p.water_per_1000
    dt = 0.1
    while w.day < 400 and w.pop > 1:
        if abs(w.day % 1.0) < dt / 2:
            restaff_optimal(w)
        w.step(dt)
    return {"extinct_day": w.day if w.pop <= 1 else None, "final_pop": w.pop}


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="all")
    ap.add_argument("--days", type=float, default=60.0)
    ap.add_argument("--pop0", type=float, default=350.0)
    args = ap.parse_args()
    p = Params()

    if args.scenario in ("all", "managed"):
        w, sat, exo, rows = run_managed(p, days=args.days, pop0=args.pop0,
                                        trace=True, export=True)
        print("== ANCHOR 1 — managed S-F ==")
        for r in rows:
            print("  day %5.1f  pop %5d  A %4d  idealStaff %4d  tau %2d%%  "
                  "Ē %.2f  prod %5.1f" % r)
        print(f"  job saturation day : {sat and round(sat, 1)}  (target ≈ 20)")
        print(f"  exodus-profit day  : {exo and round(exo, 1)}  (target ≈ 35)")
        print(f"  exodus_total {w.exodus_total:.0f}  deaths {w.deaths_total:.0f}")
        print(f"  final pop {w.pop:.0f}  pyramid "
              f"{w.children / w.pop:.2f}/{w.actives / w.pop:.2f}/"
              f"{w.seniors / w.pop:.2f}  (target .18/.55/.27)")

    if args.scenario in ("all", "neglect"):
        print("== ANCHOR 2 — neglect ==")
        for nd in (10.0, 30.0):
            m = run_neglect(p, neglect_from=20.0, neglect_days=nd)
            rec = (m["prod_after"] >= m["prod_before"] * 0.95
                   and m["pop_after"] >= m["pop_resume"] * 0.95)
            print(f"  neglect {nd:4.0f} d: prod avant {m['prod_before']:.1f} → "
                  f"reprise {m['prod_resume']:.1f} → +10 j {m['prod_after']:.1f} ; "
                  f"pop {m['pop_resume']:.0f}→{m['pop_after']:.0f} ; récupère: {rec}")

    if args.scenario in ("all", "famine"):
        print("== ANCHOR 3 — famines (cut at day 25) ==")
        for cut in ("water", "food", "oxygen"):
            m = run_famine(p, cut)
            print(f"  {cut:7s}: pop@cut {m['pop_at_cut']:.0f} → final "
                  f"{m['final_pop']:.0f} (day {m['final_day']:.0f})")

    if args.scenario in ("all", "colony"):
        m = run_colony(p)
        print("== ANCHOR 5 — colony 200 ==")
        print(f"  min pop {m['min_pop']:.0f}  final {m['final_pop']:.0f} "
              f"after {m['days']:.0f} d  tau {m['tau'] * 100:.0f}%  "
              f"stabilizes: {m['final_pop'] > 100}")

    if args.scenario in ("all", "overcap"):
        m = run_overcap(p)
        print("== ANCHOR (h) — overcap equilibrium ==")
        print(f"  peak P/cap {m['peak_ratio']:.2f}  settles {m['final_ratio']:.2f} "
              f" illness {m['illness']:.2f}")

    if args.scenario in ("all", "siege"):
        m = run_siege(p)
        print("== ANCHOR 6 — siege (comptoir, 30 d stocks) ==")
        print(f"  extinction day: {m['extinct_day'] and round(m['extinct_day'])} "
              f" final pop {m['final_pop']:.0f}")


if __name__ == "__main__":
    main()
