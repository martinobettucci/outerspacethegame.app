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
  HULLS,
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
  const type = Object.keys(fuelObj)[0] ?? 'cold';
  return { type, units: fuelObj[type] ?? 0 };
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
  opts: { setUnits?: number } = {},
): Promise<{ type: string; units: number; ratePerDay: number }> {
  const evaluated = evalShipFuel(ship, nowMs);
  const units = Math.max(0, opts.setUnits ?? evaluated.units);
  const perDay = hoverIdleFuelUPerDay(ship.hull_category, ship.hull_size);
  const rate = target === 'tank' && perDay > 0 ? -perDay : 0;

  await client.query(
    `UPDATE ships SET fuel = $2, fuel_rate_u_per_day = $3,
        fuel_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [ship.id, JSON.stringify({ [evaluated.type]: units }), rate, nowMs],
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
  // bascule d'état) — elle décide seule de son taux selon le statut.
  await rebaseShipSurvival(client, ship, nowMs);
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
  opts: { overOwnWorld?: boolean; setFoodT?: number; setWaterT?: number } = {},
): Promise<{ food: number; water: number; ratePerDay: number }> {
  const { rows: crewRows } = await client.query(
    `SELECT count(*)::int AS crew FROM npcs
     WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [ship.id],
  );
  const crew = Number(crewRows[0]?.crew ?? 0);
  let overOwnWorld = opts.overOwnWorld ?? false;
  if (!overOwnWorld && ship.status === 'hovering' && ship.hover_body_id && ship.owner_id) {
    const { rows } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
      [ship.hover_body_id, ship.owner_id],
    );
    overOwnWorld = !!rows[0];
  }
  const evaluated = evalShipSurvival(ship, nowMs);
  const food = Math.max(0, opts.setFoodT ?? evaluated.food);
  const water = Math.max(0, opts.setWaterT ?? evaluated.water);
  const perDay = survivalDrainTPerDay(
    ship.hull_category,
    ship.status,
    crew,
    { overOwnWorld },
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
