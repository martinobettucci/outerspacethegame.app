/**
 * Drain de loitering d'un vaisseau (GB §7, DG §3.5) — le réservoir est une
 * quantité paresseuse : `ships.fuel[type]` porte le montant matérialisé,
 * `fuel_rate_u_per_day` + `fuel_as_of` le taux. Même patron purge +
 * replanification que les bords de stock (rebase.ts) : on supprime les
 * `ship_fuel_out` non traités du vaisseau puis on programme le prochain
 * bord si le taux est négatif. S'exécute DANS la transaction appelante,
 * sur une ligne `ships` déjà verrouillée FOR UPDATE.
 */
import { hoverIdleFuelUPerDay } from '@atg/shared';
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
  return { type: evaluated.type, units, ratePerDay: rate };
}
