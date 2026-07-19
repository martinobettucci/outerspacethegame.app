/**
 * Récolte stellaire (GB §22, DG §8.8) — le rig s'équipe à l'atelier, la
 * récolte se fait IMMOBILE (statut idle [interp annoncée : l'image canon
 * est un gréement déployé dans le vide]) à ≤ 8 pc d'une étoile du MÊME
 * type de carburant que le réservoir (mono-type v1). Deux ledgers
 * paresseux se répondent : le réservoir de la coque monte à
 * net = rendement − entretien idle, le stock CACHÉ de l'étoile descend de
 * Σ rendements. Bords : harvest_full (réservoir plein → la récolte
 * s'arrête, annoncé) et star_supernova (stock 0 → annihilation, handler).
 * Le stock d'étoile n'est JAMAIS exposé (canon : pas de jauge) — seul le
 * flare ≤ 5 % est visible sous scope.
 */
import {
  HARVEST_RIG_COST,
  harvestYieldPerDay,
  hoverIdleFuelUPerDay,
  HULLS,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy, whenReaches } from '../sim/lazy.js';
import { payCost, CommandError } from './planets.js';
import { evalShipFuel, rebaseShipDrain, type ShipRow } from '../sim/shipDrain.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function lockOwnedShip(
  client: pg.PoolClient,
  playerId: string,
  shipId: string,
): Promise<Row> {
  const { rows } = await client.query(
    `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
    [shipId],
  );
  const ship = rows[0];
  if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
  if (ship.owner_id !== playerId) {
    throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
  }
  return ship;
}

/** Stock d'étoile ÉVALUÉ à nowMs (jamais négatif) — usage INTERNE
 * uniquement : le canon interdit toute jauge publique. */
export function evalStarFuel(star: Row, nowMs: number): number {
  const amount = Number(star.star_fuel_stock ?? 0);
  if (!star.star_fuel_as_of) return Math.max(0, amount);
  return evalLazy(
    {
      amount,
      ratePerDay: Number(star.star_fuel_rate_u_per_day ?? 0),
      asOfMs: new Date(star.star_fuel_as_of).getTime(),
    },
    nowMs,
    { min: 0 },
  );
}

/**
 * Matérialise le stock de l'étoile à nowMs, applique un delta de taux
 * (Σ rendements des récolteurs), purge et replanifie le bord
 * star_supernova. La ligne bodies doit être verrouillée FOR UPDATE.
 */
export async function settleStarHarvest(
  client: pg.PoolClient,
  star: Row,
  nowMs: number,
  deltaRatePerDay: number,
): Promise<void> {
  const stock = evalStarFuel(star, nowMs);
  const rate = Number(star.star_fuel_rate_u_per_day ?? 0) + deltaRatePerDay;
  const clamped = Math.abs(rate) < 1e-9 ? 0 : rate;
  await client.query(
    `UPDATE bodies SET star_fuel_stock = $2, star_fuel_rate_u_per_day = $3,
        star_fuel_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [star.id, stock, clamped, nowMs],
  );
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'star_supernova'
       AND payload->>'bodyId' = $1`,
    [star.id],
  );
  if (clamped < 0) {
    const at = whenReaches({ amount: stock, ratePerDay: clamped, asOfMs: nowMs }, 0);
    if (at !== null) {
      await enqueue(client, 'star_supernova', new Date(at), { bodyId: star.id });
    }
  }
}

/**
 * Monte le harvest rig (accessoire atelier, politics-free — DG §8.8) : à
 * quai sur SON monde avec un workshop ACTIF (L1 suffit [TUNE interp — le
 * guide n'exige L2 que pour le terraform core]), coût 20 steelL +
 * 5 crystal_temperate + 5 gold [TUNE]. Sondes et personnel exclus (pas de
 * réservoir).
 */
export async function fitHarvestRig(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ cost: typeof HARVEST_RIG_COST }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (['probe', 'personal'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque ne porte pas de rig');
    }
    if (ship.harvest_rig) {
      throw new CommandError('not_available', 'Le rig est déjà monté');
    }
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'Le rig se monte à quai');
    }
    const { rows: worlds } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
      [ship.docked_body_id],
    );
    if (!worlds[0] || worlds[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
    }
    const { rows: shop } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'workshop' AND status = 'active'`,
      [ship.docked_body_id],
    );
    if (!shop[0]) {
      throw new CommandError('not_available', 'Un workshop actif est requis');
    }
    await payCost(client, worlds[0].id, worlds[0].climate, HARVEST_RIG_COST, nowMs);
    await client.query(`UPDATE ships SET harvest_rig = true WHERE id = $1`, [shipId]);
    await client.query('COMMIT');
    return { cost: HARVEST_RIG_COST };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Démarre la récolte : coque IDLE, rig monté, étoile à ≤ 8 pc, MÊME type
 * de carburant (mono-type v1 [interp]), réservoir non plein, et rendement
 * NET positif (rendement − entretien idle — trop loin = le gréement ne
 * couvre pas sa propre consommation, refus explicite).
 */
export async function startHarvest(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  starId: string,
  opts: { nowMs?: number } = {},
): Promise<{ netPerDay: number; yieldPerDay: number; distancePc: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!ship.harvest_rig) {
      throw new CommandError('not_available', 'Aucun harvest rig sur cette coque');
    }
    if (ship.status !== 'idle') {
      throw new CommandError(
        'not_available',
        'La récolte se fait immobile dans le vide (statut idle)',
      );
    }
    if (ship.harvesting_star_id) {
      throw new CommandError('not_available', 'Récolte déjà en cours');
    }
    const { rows: stars } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 AND body_type = 'star' FOR UPDATE`,
      [starId],
    );
    const star = stars[0];
    if (!star) throw new CommandError('not_found', 'Étoile inconnue');
    const d = Math.hypot(ship.x - star.x, ship.y - star.y);
    const yieldPerDay = harvestYieldPerDay(d);
    if (yieldPerDay <= 0) {
      throw new CommandError('not_available', 'Trop loin (portée du rig : 8 pc)');
    }
    const { type, units } = evalShipFuel(ship, nowMs);
    if (star.star_fuel_type !== type) {
      throw new CommandError(
        'not_available',
        `Réservoir ${type} — cette étoile distribue du ${star.star_fuel_type} (mono-type v1)`,
      );
    }
    const netPerDay =
      yieldPerDay - hoverIdleFuelUPerDay(ship.hull_category, ship.hull_size);
    if (netPerDay <= 0) {
      throw new CommandError(
        'not_available',
        'Rendement insuffisant à cette distance (l\'entretien mange tout)',
      );
    }
    const tankU = shipTankU(ship);
    if (units >= tankU - 1e-9) {
      throw new CommandError('not_available', 'Réservoir déjà plein');
    }
    if (evalStarFuel(star, nowMs) <= 0) {
      // Étoile à sec sans supernova encore tirée : rien à pomper (le bord
      // arrive) — refus neutre, JAMAIS de jauge (canon).
      throw new CommandError('not_available', 'Le gréement ne remonte rien ici');
    }
    // Coque : taux NET positif + bord harvest_full au réservoir plein.
    await client.query(
      `UPDATE ships SET harvesting_star_id = $2, fuel = $3,
          fuel_rate_u_per_day = $4, fuel_as_of = to_timestamp($5 / 1000.0)
       WHERE id = $1`,
      [shipId, starId, JSON.stringify({ [type]: units }), netPerDay, nowMs],
    );
    await client.query(
      `DELETE FROM events
       WHERE processed_at IS NULL AND kind IN ('ship_fuel_out', 'harvest_full')
         AND payload->>'shipId' = $1`,
      [shipId],
    );
    const fullAt = whenReaches(
      { amount: units, ratePerDay: netPerDay, asOfMs: nowMs },
      tankU,
    );
    if (fullAt !== null) {
      await enqueue(client, 'harvest_full', new Date(fullAt), { shipId });
    }
    // Étoile : Σ rendements BRUTS (le drawdown ignore l'entretien).
    await settleStarHarvest(client, star, nowMs, -yieldPerDay);
    await client.query('COMMIT');
    return { netPerDay, yieldPerDay, distancePc: d };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Arrête la récolte : réservoir matérialisé, retour au drain idle,
 * l'étoile récupère le rendement de cette coque. */
export async function stopHarvest(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<void> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!ship.harvesting_star_id) {
      throw new CommandError('not_available', 'Aucune récolte en cours');
    }
    await releaseHarvest(client, ship, nowMs);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Détache une coque de son étoile (arrêt volontaire, réservoir plein, ou
 * départ) : matérialise le réservoir, purge harvest_full, repasse le
 * drain à l'entretien idle, et rend son rendement à l'étoile. La ligne
 * ships doit être verrouillée ; s'exécute dans la transaction appelante.
 */
export async function releaseHarvest(
  client: pg.PoolClient,
  ship: ShipRow,
  nowMs: number,
): Promise<void> {
  const starId = ship.harvesting_star_id as string | null;
  if (!starId) return;
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'harvest_full'
       AND payload->>'shipId' = $1`,
    [ship.id],
  );
  await client.query(
    `UPDATE ships SET harvesting_star_id = NULL WHERE id = $1`,
    [ship.id],
  );
  // Réservoir : matérialisation + retour au drain idle (statut inchangé).
  await rebaseShipDrain(client, ship, nowMs, 'tank');
  const { rows: stars } = await client.query(
    `SELECT * FROM bodies WHERE id = $1 AND body_type = 'star' FOR UPDATE`,
    [starId],
  );
  if (stars[0]) {
    const d = Math.hypot(ship.x - stars[0].x, ship.y - stars[0].y);
    await settleStarHarvest(client, stars[0], nowMs, harvestYieldPerDay(d));
  }
}

/** Capacité de réservoir de la coque (u). */
function shipTankU(ship: Row): number {
  return (
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
      ?.tankU ?? 0
  );
}

/** Instrumentation §15 : fixe le stock d'une étoile (bords replanifiés). */
export async function setStarStockForTest(
  pool: pg.Pool,
  starId: string,
  stockU: number,
  opts: { nowMs?: number } = {},
): Promise<void> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 AND body_type = 'star' FOR UPDATE`,
      [starId],
    );
    if (!rows[0]) throw new CommandError('not_found', 'Étoile inconnue');
    await client.query(
      `UPDATE bodies SET star_fuel_stock = $2,
          star_fuel_as_of = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [starId, Math.max(0, stockU), nowMs],
    );
    const { rows: after } = await client.query(
      `SELECT * FROM bodies WHERE id = $1`,
      [starId],
    );
    await settleStarHarvest(client, after[0]!, nowMs, 0);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
