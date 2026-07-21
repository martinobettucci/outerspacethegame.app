/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P3 “Hovering”/“Survival clocks & derelicts”/“Hull wear & shields”; docs/MASTER_PLAN.md §W1/§W5/§W6; GAME_BOOK.md §6/§7/§27; DESIGN_GUIDE.md §3.5/§8.7/§8.8. */
/**
 * Drain de loitering d'un vaisseau (GB §7, DG §3.5) — le réservoir est une
 * quantité paresseuse : `ships.fuel[type]` porte le montant matérialisé,
 * `fuel_rate_u_per_day` + `fuel_as_of` le taux. Même patron purge +
 * replanification que les bords de stock (rebase.ts) : on supprime les
 * `ship_fuel_out` non traités du vaisseau puis on programme le prochain
 * bord si le taux est négatif. S'exécute DANS la transaction appelante,
 * sur une ligne `ships` déjà verrouillée FOR UPDATE.
 */
import {
  activeFuelSlot,
  armorHpMult,
  PROBE,
  evalJunkAmount,
  junkCellOf,
  junkHazardHpPerDay,
  harvestHullDamagePerDay,
  HAZARD_RADIUS_PC,
  HULL_WEAR_FLOOR_HP,
  HULLS,
  hullWearPerDay,
  shieldForClimate,
  shieldForStarField,
  starFieldRadiusPc,
  starIsFlaring,
  SURVIVAL_ALARM_FRACTION,
  survivalCapacityT,
  survivalDrainTPerDay, hoverIdleFuelUPerDay } from '@atg/shared';
import type pg from 'pg';
import { enqueue } from './events.js';
import { evalLazy, whenReaches } from './lazy.js';

/**
 * Ligne `ships` telle que lue par pg (les services manipulent des lignes
 * non typées — même idiome que lockOwnedShip).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShipRow = Record<string, any>;

/** Type + montant BRUT (as-of) du réservoir mono-type v1. */
export function shipFuelState(ship: ShipRow): { type: string; units: number } {
  const fuelObj: Record<string, number> = ship.fuel ?? {};
  // W2 : une coque à moteur TYPÉ n'a qu'un slot légitime — son type
  // moteur (même à sec, contrairement au fallback W1 qui retomberait
  // sur 'cold').
  if (ship.engine_type) {
    return { type: String(ship.engine_type), units: fuelObj[ship.engine_type] ?? 0 };
  }
  // W1 multi-fuel (sondes) : le slot ACTIF est le premier de l'ordre
  // configuré avec du stock — les coques mono-type retombent sur leur
  // unique clé naturellement.
  const type = activeFuelSlot(fuelObj, ship.fuel_order as string[] | null);
  return { type, units: fuelObj[type] ?? 0 };
}

/** Réservoir TOTAL évalué (multi-type : actif lazy + autres statiques). */
export function evalShipFuelTotal(ship: ShipRow, nowMs: number): number {
  const fuelObj: Record<string, number> = ship.fuel ?? {};
  const active = evalShipFuel(ship, nowMs);
  let total = active.units;
  for (const [t, u] of Object.entries(fuelObj)) {
    if (t !== active.type) total += Math.max(0, u ?? 0);
  }
  return total;
}

/** Réservoir ÉVALUÉ à nowMs (jamais négatif). */
export function evalShipFuel(
  ship: ShipRow,
  nowMs: number,
): { type: string; units: number } {
  const { type, units } = shipFuelState(ship);
  if (!ship.fuel_as_of) return { type, units: Math.max(0, units) };
  return {
    type,
    units: evalLazy(
      {
        amount: units,
        ratePerDay: Number(ship.fuel_rate_u_per_day ?? 0),
        asOfMs: new Date(ship.fuel_as_of).getTime(),
      },
      nowMs,
      { min: 0 },
    ),
  };
}

/**
 * Matérialise le réservoir à nowMs, applique la cible de drain ('tank' =
 * le réservoir paie, 'none' = figé), écrit fuel/taux/as_of, purge les
 * `ship_fuel_out` non traités et replanifie le bord si nécessaire.
 * Un survol entamé réservoir vide échoue immédiatement (whenReaches d'un
 * montant nul → asOfMs) — uniforme et voulu.
 */
export async function rebaseShipDrain(
  client: pg.PoolClient,
  ship: ShipRow,
  nowMs: number,
  target: 'tank' | 'none',
  opts: {
    setUnits?: number;
    survivalServed?: boolean;
    repairHpPerDay?: number;
  } = {},
): Promise<{ type: string; units: number; ratePerDay: number }> {
  const evaluated = evalShipFuel(ship, nowMs);
  const units = Math.max(0, opts.setUnits ?? evaluated.units);
  const perDay = hoverIdleFuelUPerDay(
    ship.hull_category,
    ship.hull_size,
    Number(ship.probe_level ?? 1),
  );
  const rate = target === 'tank' && perDay > 0 ? -perDay : 0;

  // W1 : préserver les slots NON actifs (multi-fuel des sondes) — une
  // coque mono-type n'a qu'une clé, comportement inchangé.
  const otherSlots: Record<string, number> = {};
  for (const [t, u] of Object.entries(
    (ship.fuel ?? {}) as Record<string, number>,
  )) {
    if (t !== evaluated.type && (u ?? 0) > 1e-9) otherSlots[t] = u;
  }
  await client.query(
    `UPDATE ships SET fuel = $2, fuel_rate_u_per_day = $3,
        fuel_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [
      ship.id,
      JSON.stringify({ ...otherSlots, [evaluated.type]: units }),
      rate,
      nowMs,
    ],
  );
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'ship_fuel_out'
       AND payload->>'shipId' = $1`,
    [ship.id],
  );
  if (rate < 0) {
    const at = whenReaches({ amount: units, ratePerDay: rate, asOfMs: nowMs }, 0);
    if (at !== null) {
      await enqueue(client, 'ship_fuel_out', new Date(at), { shipId: ship.id });
    }
  }
  // L'horloge de SURVIE suit chaque rebase de drain (mêmes points de
  // bascule d'état) — elle décide de son taux selon le statut, et le
  // recompute planétaire lui transmet l'état « servi » (GB §7).
  await rebaseShipSurvival(client, ship, nowMs, {
    survivalServed: opts.survivalServed,
  });
  // L'USURE de coque suit les mêmes points (GB §27 : climat, hasards,
  // récolte d_safe, réparation d'atelier — tout se rebase là où l'état
  // change ; le taux de réparation SERVI vient du recompute planétaire).
  await rebaseShipHull(client, ship, nowMs, {
    repairHpPerDay: opts.repairHpPerDay,
  });
  return { type: evaluated.type, units, ratePerDay: rate };
}

/** Provisions de survie ÉVALUÉES à la lecture (motif fuel — le taux
 * matérialisé s'applique à parts égales à food et water). */
export function evalShipSurvival(
  ship: ShipRow,
  nowMs: number,
): { food: number; water: number; ratePerDay: number } {
  const raw = (ship.survival ?? {}) as Record<string, number>;
  const rate = Number(ship.survival_rate_t_per_day ?? 0);
  const asOf = ship.survival_as_of ? new Date(ship.survival_as_of).getTime() : null;
  const evalOne = (amount: number) =>
    asOf === null || rate === 0
      ? Math.max(0, amount)
      : Math.max(0, evalLazy({ amount, ratePerDay: rate, asOfMs: asOf }, nowMs, { min: 0 }));
  return {
    food: evalOne(Number(raw.food ?? 0)),
    water: evalOne(Number(raw.water ?? 0)),
    ratePerDay: rate,
  };
}

/**
 * Rebase de l'horloge de SURVIE (GB §6, DG §3.5) : matérialise les
 * provisions, écrit le taux (−0.01 × équipage là où l'équipage vit à
 * bord), purge et replanifie les bords survival_low (alarme 25 % de la
 * capacité de coque) et survival_out (mort). Appelé aux mêmes points que
 * le rebase du fuel — l'équipage est compté ici (une requête).
 */
export async function rebaseShipSurvival(
  client: pg.PoolClient,
  ship: ShipRow,
  nowMs: number,
  opts: { survivalServed?: boolean; setFoodT?: number; setWaterT?: number } = {},
): Promise<{ food: number; water: number; ratePerDay: number }> {
  const { rows: crewRows } = await client.query(
    `SELECT count(*)::int AS crew FROM npcs
     WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [ship.id],
  );
  const crew = Number(crewRows[0]?.crew ?? 0);
  const evaluated = evalShipSurvival(ship, nowMs);
  const food = Math.max(0, opts.setFoodT ?? evaluated.food);
  const water = Math.max(0, opts.setWaterT ?? evaluated.water);
  // « Servi » (GB §7 : le monde possédé survolé nourrit l'équipage) est
  // DÉCIDÉ par recomputePlanetRates (familles food+water couvertes, tout-
  // ou-rien) et transmis ici ; défaut PESSIMISTE — chaque entrée en survol
  // d'un monde possédé passe par un recompute qui rétablit l'exemption
  // dans la même transaction (patron fuel, aucun double-paiement).
  const perDay = survivalDrainTPerDay(
    ship.hull_category,
    ship.status,
    crew,
    { planetServes: opts.survivalServed === true },
  );
  // [TUNE-v1 annoncé, JOURNAL] : l'horloge ne S'ARME que si des provisions
  // existent (worst > 0) — une coque jamais avitaillée ne meurt pas
  // instantanément au départ (l'Arche de colonisation porte ses vivres en
  // SOUTE ; l'avitaillement de survie devient une boucle de jeu quand les
  // réservoirs sont remplis, ex. le hauler de spawn 2/2/2).
  const worstNow = Math.min(food, water);
  const rate = perDay > 0 && worstNow > 1e-12 ? -perDay : 0;
  const raw = (ship.survival ?? {}) as Record<string, number>;
  await client.query(
    `UPDATE ships SET survival = $2, survival_rate_t_per_day = $3,
        survival_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [
      ship.id,
      JSON.stringify({ ...raw, food, water }),
      rate,
      nowMs,
    ],
  );
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind IN ('survival_low', 'survival_out')
       AND payload->>'shipId' = $1`,
    [ship.id],
  );
  if (rate < 0) {
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as keyof typeof HULLS];
    const capPerRes = survivalCapacityT(hull?.survivalCrewDays ?? 0, crew);
    const alarmAt = capPerRes * SURVIVAL_ALARM_FRACTION;
    const worst = Math.min(food, water);
    if (worst > alarmAt && alarmAt > 0) {
      const at = whenReaches({ amount: worst, ratePerDay: rate, asOfMs: nowMs }, alarmAt);
      if (at !== null) {
        await enqueue(client, 'survival_low', new Date(at), { shipId: ship.id });
      }
    }
    const dead = whenReaches({ amount: worst, ratePerDay: rate, asOfMs: nowMs }, 0);
    if (dead !== null) {
      await enqueue(client, 'survival_out', new Date(dead), { shipId: ship.id });
    }
  }
  return { food, water, ratePerDay: rate };
}


/** HP max de la coque (0 si inconnu — sondes : exemptes d'usure v1). */
export function shipMaxHp(ship: ShipRow): number {
  // Sondes v3 (2026-07-20) : la sonde a des points de coque — fragile,
  // endommagée par le scoop stellaire, attaquable (combat P5).
  if (ship.hull_category === 'probe') return PROBE.maxHp;
  // W6 : l'upgrade d'armure multiplie les HP max (DG §8.2).
  return (
    (HULLS[`${ship.hull_category}_${ship.hull_size}` as keyof typeof HULLS]
      ?.armorHp ?? 0) * armorHpMult(ship.upgrades)
  );
}

/** HP de coque ÉVALUÉS à nowMs — hull_hp NULL = coque neuve ; plancher
 * canon 1 HP (péage, jamais une mort — GB §27). */
export function evalShipHull(
  ship: ShipRow,
  nowMs: number,
): { hp: number; maxHp: number } {
  const maxHp = shipMaxHp(ship);
  if (maxHp <= 0) return { hp: 0, maxHp: 0 };
  const floor = Math.min(HULL_WEAR_FLOOR_HP, maxHp);
  const amount = ship.hull_hp === null || ship.hull_hp === undefined
    ? maxHp
    : Number(ship.hull_hp);
  if (!ship.hull_as_of) return { hp: Math.max(floor, Math.min(maxHp, amount)), maxHp };
  return {
    hp: Math.max(
      floor,
      Math.min(
        maxHp,
        evalLazy(
          {
            amount,
            ratePerDay: Number(ship.hull_wear_hp_per_day ?? 0),
            asOfMs: new Date(ship.hull_as_of).getTime(),
          },
          nowMs,
          { min: floor },
        ),
      ),
    ),
    maxHp,
  };
}

/**
 * Rebase de l'USURE de coque (GB §27 SETTLED, DG §8.8) : matérialise les
 * HP, recalcule le taux selon les sources hostiles NON blindées — climat
 * du monde sous la coque (hot/cold), zone de hasard ≤ 5 pc (trou noir ou
 * étoile en flare), dégâts de proximité du harvest rig (d < d_safe) —
 * et écrit le tout. AUCUN bord : le péage planche à 1 HP. Transit,
 * entrepôt, colonisation et épaves : exempts [TUNE-v1 annoncé].
 */
export async function rebaseShipHull(
  client: pg.PoolClient,
  ship: ShipRow,
  nowMs: number,
  opts: { repairHpPerDay?: number } = {},
): Promise<{ hp: number; maxHp: number; wearPerDay: number }> {
  const { hp, maxHp } = evalShipHull(ship, nowMs);
  if (maxHp <= 0) return { hp: 0, maxHp: 0, wearPerDay: 0 };
  let hostileClimateUnshielded = false;
  let hazardZoneUnshielded = false;
  let harvestDamagePerDay = 0;
  let starFieldsUnshielded = 0;
  if (['docked', 'hovering', 'idle', 'stranded'].includes(ship.status)) {
    const bodyId = ship.docked_body_id ?? ship.hover_body_id;
    if (bodyId) {
      const { rows } = await client.query(
        `SELECT climate FROM bodies WHERE id = $1`,
        [bodyId],
      );
      const kind = shieldForClimate(rows[0]?.climate ?? null);
      if (kind && !ship[`shield_${kind}`]) hostileClimateUnshielded = true;
    }
    if (!ship.shield_radio) {
      const sx = Number(ship.x);
      const sy = Number(ship.y);
      const { rows: hazards } = await client.query(
        `SELECT body_type, x, y, star_fuel_stock, star_fuel_rate_u_per_day,
                star_fuel_as_of, star_fuel_initial
         FROM bodies
         WHERE (body_type = 'black_hole' OR body_type = 'star')
           AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
        [
          sx - HAZARD_RADIUS_PC,
          sx + HAZARD_RADIUS_PC,
          sy - HAZARD_RADIUS_PC,
          sy + HAZARD_RADIUS_PC,
        ],
      );
      for (const h of hazards) {
        if (Math.hypot(h.x - ship.x, h.y - ship.y) > HAZARD_RADIUS_PC) continue;
        if (h.body_type === 'black_hole') {
          hazardZoneUnshielded = true;
          break;
        }
        const stock = h.star_fuel_as_of
          ? evalLazy(
              {
                amount: Number(h.star_fuel_stock ?? 0),
                ratePerDay: Number(h.star_fuel_rate_u_per_day ?? 0),
                asOfMs: new Date(h.star_fuel_as_of).getTime(),
              },
              nowMs,
              { min: 0 },
            )
          : Number(h.star_fuel_stock ?? 0);
        if (starIsFlaring(stock, Number(h.star_fuel_initial ?? 0))) {
          hazardZoneUnshielded = true;
          break;
        }
      }
    }
    // W5 : champs climatiques stellaires (0,5 × r_nova) — une coque À
    // L'ARRÊT DANS L'ESPACE baignant dans un champ sans le bouclier
    // apparié use (+5 %/j PAR champ, additif). À quai : exempt [interp
    // annoncée — la coque posée est sous le champ du MONDE, dont le
    // climat fait déjà loi]. Sondes concernées (aucun bouclier possible).
    if (ship.status !== 'docked') {
      const sx = Number(ship.x);
      const sy = Number(ship.y);
      const maxField = 51; // ≥ starFieldRadiusPc(r_nova L ≈ 100,8) = 50,4
      const { rows: fieldStars } = await client.query(
        `SELECT x, y, star_fuel_type, r_nova FROM bodies
         WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
           AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
        [sx - maxField, sx + maxField, sy - maxField, sy + maxField],
      );
      for (const s of fieldStars) {
        const radius = starFieldRadiusPc(Number(s.r_nova ?? 0));
        if (radius <= 0) continue;
        if (Math.hypot(Number(s.x) - sx, Number(s.y) - sy) > radius) continue;
        const kind = shieldForStarField(s.star_fuel_type);
        if (kind && !ship[`shield_${kind}`]) starFieldsUnshielded += 1;
      }
    }
    // Champ de junk dans la cellule (DG §10.4) : dégâts de présence —
    // aucun bouclier n'atténue (cinétique) [TUNE-v1]. Taux gelé entre
    // rebases (la décroissance affine au prochain point d'état, annoncé).
    {
      const { rows: junk } = await client.query(
        `SELECT amount_t, as_of FROM junk_fields
         WHERE cell_x = $1 AND cell_y = $2`,
        [junkCellOf(Number(ship.x)), junkCellOf(Number(ship.y))],
      );
      if (junk[0]) {
        harvestDamagePerDay += junkHazardHpPerDay(
          evalJunkAmount(
            Number(junk[0].amount_t),
            new Date(junk[0].as_of).getTime(),
            nowMs,
          ),
        );
      }
    }
    if (ship.harvesting_star_id) {
      const { rows: stars } = await client.query(
        `SELECT x, y FROM bodies WHERE id = $1`,
        [ship.harvesting_star_id],
      );
      if (stars[0]) {
        harvestDamagePerDay = harvestHullDamagePerDay(
          Math.hypot(stars[0].x - ship.x, stars[0].y - ship.y),
        );
      }
    }
  }
  const wearPerDay = hullWearPerDay(maxHp, {
    hostileClimateUnshielded,
    hazardZoneUnshielded,
    harvestDamagePerDay,
    starFieldsUnshielded,
  });
  // Réparation d'atelier (DG §8.7) : taux SERVI transmis par le recompute
  // planétaire (défaut pessimiste 0) — nul si la coque est déjà pleine.
  const repair =
    ship.status === 'docked' && hp < maxHp - 1e-9
      ? Math.max(0, opts.repairHpPerDay ?? 0)
      : 0;
  const net = repair - wearPerDay;
  const rate =
    net < 0 && hp > Math.min(HULL_WEAR_FLOOR_HP, maxHp) + 1e-9
      ? net
      : net > 0
        ? net
        : 0;
  await client.query(
    `UPDATE ships SET hull_hp = $2, hull_wear_hp_per_day = $3,
        hull_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [ship.id, hp, rate, nowMs],
  );
  // Bord de PLEIN (rate > 0) : l'événement hull_repaired arrête l'acier.
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'hull_repaired'
       AND payload->>'shipId' = $1`,
    [ship.id],
  );
  if (rate > 0) {
    const at = whenReaches({ amount: hp, ratePerDay: rate, asOfMs: nowMs }, maxHp);
    if (at !== null) {
      await enqueue(client, 'hull_repaired', new Date(Math.ceil(at) + 2), {
        shipId: ship.id,
      });
    }
  }
  return { hp, maxHp, wearPerDay: -rate };
}
