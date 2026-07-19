/**
 * Colonisation — GB §19/§14/§12, DG §12/§3.2/§10.3.
 *
 * Le chemin canon complet : équiper une coque Civil M/L du fitting colonie
 * (colony_program déverrouillé + workshop L2 actif sur le monde d'équipe-
 * ment, coût = 1 terraform core + 400 cells + 150 steelL [TUNE]) →
 * embarquer ≥ 200 settlers (spaceport actif requis pour manipuler de la
 * population — DG §3.2) et le stock d'amorçage (30 food + 30 water) →
 * voler vers un monde SAUVAGE non-poison → coloniser : 72 h d'établisse-
 * ment, puis la coque est CONSOMMÉE (depot L1 + spaceport L1), les
 * settlers deviennent la population, l'équipage se re-lie à la planète
 * comme gouverneur [TUNE interp, JOURNAL]. Le péage de trajet des
 * settlers est déterministe (accumulateur fractionnaire par route —
 * handler d'arrivée).
 */
import {
  canColonizeBody,
  canFitColonyKit,
  COLONY_ESTABLISH_HOURS,
  COLONY_FITTING_CORES,
  COLONY_FITTING_COST,
  COLONY_MIN_SETTLERS,
  COLONY_SEED_STOCK,
  HULLS,
  ITEMS,
  type CostBundle,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { recomputePlanetRates } from '../sim/rebase.js';
import { rebaseShipDrain } from '../sim/shipDrain.js';
import { CommandError, payCost } from './planets.js';

/** Verrouille un vaisseau possédé (patron ships.ts). */
async function lockShip(
  client: pg.PoolClient,
  playerId: string,
  shipId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const { rows } = await client.query(`SELECT * FROM ships WHERE id = $1 FOR UPDATE`, [
    shipId,
  ]);
  const ship = rows[0];
  if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
  if (ship.owner_id !== playerId) {
    throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
  }
  return ship;
}

/** Le monde à quai, possédé par le joueur (FOR UPDATE). */
async function lockDockedOwnedWorld(
  client: pg.PoolClient,
  playerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ship: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  if (ship.status !== 'docked' || !ship.docked_body_id) {
    throw new CommandError('not_available', 'Cette opération se fait à quai');
  }
  const { rows } = await client.query(
    `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
    [ship.docked_body_id],
  );
  if (!rows[0] || rows[0].owner_id !== playerId) {
    throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
  }
  return rows[0];
}

/**
 * Équipe le fitting colonie : Civil M/L à quai d'un monde possédé ayant
 * colony_program déverrouillé ET un workshop L2+ actif (le core est un
 * consommable du workshop — v1 paie son coût matière directement, le
 * substrat d'items n'existant pas encore [gap annoncé]).
 */
export async function fitColonyKit(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ cost: CostBundle }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockShip(client, playerId, shipId);
    if (!canFitColonyKit({ category: ship.hull_category, size: ship.hull_size })) {
      throw new CommandError(
        'not_available',
        'Le fitting colonie exige une coque Civil M ou L (DG §8.6)',
      );
    }
    if (ship.colony_kit) {
      throw new CommandError('not_available', 'Cette coque est déjà équipée');
    }
    const world = await lockDockedOwnedWorld(client, playerId, ship);
    const { rows: unlocked } = await client.query(
      `SELECT 1 FROM tech_unlocks WHERE body_id = $1 AND node_key = 'colony_program'`,
      [world.id],
    );
    if (!unlocked[0]) {
      throw new CommandError(
        'not_unlocked',
        'Le programme colonial doit être déverrouillé sur ce monde',
      );
    }
    const { rows: shop } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'workshop' AND status = 'active' AND level >= $2`,
      [world.id, ITEMS.terraform_core.producerMinLevel],
    );
    if (!shop[0]) {
      throw new CommandError(
        'not_available',
        'Un workshop L2 actif est requis pour produire le terraform core',
      );
    }
    // Coût total : le core (×1) + le fitting + les PROVISIONS d'amorçage.
    // [TUNE interp, JOURNAL] : le canon exige 30 food + 30 water (DG §12)
    // mais la soute d'un Civil M (2 conteneurs, DG §7) ne peut pas les
    // porter — le kit colonie embarque donc ses provisions en cales
    // dédiées, payées ici et déchargées à l'établissement.
    const cost: CostBundle = { ...COLONY_FITTING_COST };
    for (const [res, qty] of Object.entries(ITEMS.terraform_core.cost)) {
      cost[res as keyof CostBundle] =
        (cost[res as keyof CostBundle] ?? 0) + (qty as number) * COLONY_FITTING_CORES;
    }
    for (const [res, qty] of Object.entries(COLONY_SEED_STOCK)) {
      cost[res as keyof CostBundle] =
        (cost[res as keyof CostBundle] ?? 0) + (qty as number);
    }
    await payCost(client, world.id, world.climate, cost, nowMs);
    await client.query(`UPDATE ships SET colony_kit = true WHERE id = $1`, [shipId]);
    await recomputePlanetRates(client, world.id, nowMs);
    await client.query('COMMIT');
    return { cost };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Embarque/débarque des settlers — la population ne voyage QUE par coque
 * Civil, et sa manutention exige un spaceport actif sur le monde habité
 * (DG §3.2). Garde v1 [TUNE interp] : la population restante doit couvrir
 * la workforce assignée (part assignable 60 %).
 */
export async function transferSettlers(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  input: { count: number; direction: 'embark' | 'disembark' },
  opts: { nowMs?: number } = {},
): Promise<{ settlers: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const count = Math.floor(input.count);
  if (!Number.isFinite(count) || count <= 0) {
    throw new CommandError('not_available', 'Effectif invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockShip(client, playerId, shipId);
    if (ship.hull_category !== 'civil') {
      throw new CommandError(
        'not_available',
        'La population ne voyage que par coque Civil (DG §3.2)',
      );
    }
    const world = await lockDockedOwnedWorld(client, playerId, ship);
    const { rows: port } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'spaceport' AND status = 'active'`,
      [world.id],
    );
    if (!port[0]) {
      throw new CommandError(
        'not_available',
        'Un spaceport actif est requis pour manipuler la population (DG §3.2)',
      );
    }

    // Matérialise la population à l'instant t (pop_daily la fait vivre).
    const snap = await recomputePlanetRates(client, world.id, nowMs);
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');

    if (input.direction === 'embark') {
      const hull =
        HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
      const pax = hull?.pax ?? 0;
      if (ship.settlers + count > pax) {
        throw new CommandError(
          'not_available',
          `Capacité passagers dépassée (${ship.settlers + count}/${pax})`,
        );
      }
      if (ship.settlers > 0 && ship.settlers_origin_body_id !== world.id) {
        throw new CommandError(
          'not_available',
          'Des settlers d\'un autre monde sont déjà à bord (une route à la fois)',
        );
      }
      // v2 (chunk BB) : les settlers embarqués sont des ACTIFS (le choix
      // par catégorie arrive au chunk BD) — les actifs restants doivent
      // couvrir la workforce assignée.
      const remainingActives = snap.pyramid.actives - count;
      const remaining = snap.population - count;
      const { rows: wf } = await client.query(
        `SELECT COALESCE(sum(workforce), 0)::int AS assigned FROM buildings
         WHERE body_id = $1`,
        [world.id],
      );
      if (remaining < 0 || remainingActives < 0 || wf[0].assigned > remainingActives) {
        throw new CommandError(
          'workforce_invalid',
          'Les actifs restants ne couvriraient plus la workforce assignée',
        );
      }
      await client.query(
        `UPDATE bodies SET population = $2, pop_as_of = to_timestamp($3 / 1000.0)
         WHERE id = $1`,
        [world.id, remaining, nowMs],
      );
      await client.query(
        `UPDATE ships SET settlers = settlers + $2, settlers_origin_body_id = $3
         WHERE id = $1`,
        [shipId, count, world.id],
      );
    } else {
      if (ship.settlers < count) {
        throw new CommandError('not_available', 'Pas assez de settlers à bord');
      }
      // Débordement de popCap permis : la cloche (§3.4) punit, pas nous.
      await client.query(
        `UPDATE bodies SET population = population + $2,
           pop_as_of = to_timestamp($3 / 1000.0)
         WHERE id = $1`,
        [world.id, count, nowMs],
      );
      await client.query(
        `UPDATE ships SET settlers = settlers - $2,
           settlers_origin_body_id = CASE WHEN settlers - $2 = 0 THEN NULL
                                          ELSE settlers_origin_body_id END
         WHERE id = $1`,
        [shipId, count],
      );
    }
    await recomputePlanetRates(client, world.id, nowMs);
    const { rows: after } = await client.query(
      `SELECT settlers FROM ships WHERE id = $1`,
      [shipId],
    );
    await client.query('COMMIT');
    return { settlers: after[0].settlers };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Colonise le monde sauvage sous la coque : 72 h d'établissement via
 * événement. Réservation anti-course : refus transactionnel si un
 * colony_established non traité vise déjà ce corps.
 */
export async function colonizeShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date; bodyId: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockShip(client, playerId, shipId);
    if (ship.status !== 'hovering' || !ship.hover_body_id) {
      throw new CommandError('not_available', 'Il faut survoler le monde à coloniser');
    }
    if (!canFitColonyKit({ category: ship.hull_category, size: ship.hull_size })) {
      throw new CommandError('not_available', 'Coque inapte à la colonisation (Civil M/L)');
    }
    if (!ship.colony_kit) {
      throw new CommandError('not_available', 'Le fitting colonie manque (DG §12)');
    }
    if (ship.settlers < COLONY_MIN_SETTLERS) {
      throw new CommandError(
        'not_available',
        `Au moins ${COLONY_MIN_SETTLERS} settlers requis (${ship.settlers} à bord)`,
      );
    }
    // Les provisions d'amorçage (30 food + 30 water) voyagent DANS le kit
    // (payées au fitting — voir fitColonyKit) : rien à vérifier en soute.
    const { rows: bodies } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
      [ship.hover_body_id],
    );
    const body = bodies[0];
    if (!body) throw new CommandError('not_found', 'Monde inconnu');
    const eligible = canColonizeBody({
      bodyType: body.body_type,
      ownerId: body.owner_id,
      climate: body.climate,
    });
    if (!eligible.ok) {
      throw new CommandError(
        eligible.reason === 'poison_unbuildable' ? 'unbuildable' : 'not_available',
        eligible.reason === 'poison_unbuildable'
          ? 'Les mondes poison sont inconstructibles (GB §3)'
          : 'Ce monde ne se colonise pas (déjà possédé ou pas une planète)',
      );
    }
    const { rows: pending } = await client.query(
      `SELECT 1 FROM events
       WHERE kind = 'colony_established' AND processed_at IS NULL
         AND payload->>'bodyId' = $1`,
      [body.id],
    );
    if (pending[0]) {
      throw new CommandError('not_available', 'Une colonie s\'établit déjà ici');
    }
    const completesAt = new Date(
      nowMs + (COLONY_ESTABLISH_HOURS * 3600 * 1000) / timeScale,
    );
    // La coque se pose (droit sauvage du fitting colonie — GB §14/DG §8.6) ;
    // le drain de survol se désarme (statut colonizing exempt, GB §7).
    await client.query(
      `UPDATE ships SET status = 'colonizing', docked_body_id = $2,
         hover_body_id = NULL WHERE id = $1`,
      [shipId, body.id],
    );
    await rebaseShipDrain(client, ship, nowMs, 'none');
    await enqueue(client, 'colony_established', completesAt, {
      shipId,
      bodyId: body.id,
      playerId,
    });
    await client.query('COMMIT');
    return { completesAt, bodyId: body.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
