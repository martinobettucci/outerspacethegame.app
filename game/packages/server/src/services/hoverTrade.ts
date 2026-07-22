/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Hover auto-trade”; GAME_BOOK.md §7; DESIGN_GUIDE.md §3.5. */
/**
 * Auto-trade du survol étranger (GB §7, DG §3.5) — la coque en orbite
 * d'un monde d'AUTRUI rachète au marché local quand un réservoir passe
 * sous le seuil d'une de ses règles. « Best effort » canon : le PREMIER
 * slot fixe actif dont le monde DONNE (give) la ressource voulue ; la
 * coque paie la contrepartie (get du slot) depuis sa SOUTE ; borne de
 * prix ≤ 3 T par tonne reçue [TUNE-v1, JOURNAL]. Physique intégrale :
 * soute → stock du monde, stock du monde → tank/provisions/soute.
 * Évaluation PARESSEUSE : auto_trade_check se replanifie au
 * franchissement de seuil le plus proche (whenReaches).
 */
import {
  AUTO_TRADE_MAX_COST_PER_T,
  autoTradeDestination,
  containersUsed,
  containersUsedTotal,
  fixedTradeOutput,
  HULLS,
  isAmmSlot,
  survivalCapacityT,
  validateAutoTradeRules,
  type AutoTradeRule,
  type HullCategory,
  type HullSize,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy, whenReaches } from '../sim/lazy.js';
import {
  evalShipFuel,
  evalShipSurvival,
  rebaseShipDrain,
} from '../sim/shipDrain.js';
import { CommandError } from './planets.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Configure les règles d'auto-trade de SA coque (§10, validation). */
export async function setAutoTrade(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  rules: AutoTradeRule[],
): Promise<void> {
  const error = validateAutoTradeRules(rules);
  if (error) throw new CommandError('not_available', error);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    await client.query(`UPDATE ships SET auto_trade = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(rules),
    ]);
    // Replanification immédiate si la coque est déjà en survol étranger.
    await scheduleAutoTradeCheck(client, { ...ship, auto_trade: rules }, Date.now());
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Niveau COURANT du réservoir de destination d'une règle. */
function destinationLevel(
  ship: Row,
  resource: ResourceId,
  nowMs: number,
): { level: number; capLeft: number } {
  const hull =
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
  const dest = autoTradeDestination(resource, evalShipFuel(ship, nowMs).type);
  if (dest === 'tank') {
    const tank = evalShipFuel(ship, nowMs);
    return { level: tank.units, capLeft: (hull?.tankU ?? 0) - tank.units };
  }
  if (dest === 'survival_food' || dest === 'survival_water') {
    const sv = evalShipSurvival(ship, nowMs);
    const level = dest === 'survival_food' ? sv.food : sv.water;
    // La capacité dépend de l'équipage — évaluée par l'appelant (le crew
    // ne change pas en survol) via le cap passé au moment de l'achat.
    return { level, capLeft: Number.POSITIVE_INFINITY };
  }
  const cargo = (ship.cargo ?? {}) as Partial<Record<ResourceId, number>>;
  const free = (hull?.containers ?? 0) - containersUsedTotal(cargo, ship.item_cargo);
  return { level: Number(cargo[resource] ?? 0), capLeft: Math.max(0, free) };
}

/**
 * Exécute les règles actives d'une coque en survol ÉTRANGER — retourne
 * le nombre d'achats réalisés. S'exécute dans la transaction appelante
 * (ships verrouillé FOR UPDATE conseillé).
 */
export async function runAutoTrade(
  client: pg.PoolClient,
  ship: Row,
  nowMs: number,
): Promise<number> {
  if (ship.status !== 'hovering' || !ship.hover_body_id) return 0;
  const rules = (ship.auto_trade ?? []) as AutoTradeRule[];
  if (rules.length === 0) return 0;
  const { rows: worlds } = await client.query(
    `SELECT * FROM bodies WHERE id = $1`,
    [ship.hover_body_id],
  );
  const world = worlds[0];
  if (!world || !world.owner_id || world.owner_id === ship.owner_id) return 0;
  const { rows: markets } = await client.query(
    `SELECT * FROM buildings
     WHERE body_id = $1 AND key = 'market' AND status = 'active'
     ORDER BY tile_index`,
    [ship.hover_body_id],
  );
  let purchases = 0;
  const { rows: crewRows } = await client.query(
    `SELECT count(*)::int AS crew FROM npcs
     WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [ship.id],
  );
  const crew = Number(crewRows[0]?.crew ?? 0);
  const hull =
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
  const survivalCap = survivalCapacityT(hull?.survivalCrewDays ?? 0, crew);

  for (const rule of rules) {
    const { level } = destinationLevel(ship, rule.resource, nowMs);
    if (level >= rule.belowT - 1e-9) continue;
    // « Best effort » : premier slot fixe actif où le monde DONNE la
    // ressource (slot.give = ce que le monde vend).
    let executed = false;
    for (const market of markets) {
      if (executed) break;
      const slots = Array.isArray(market.config?.slots) ? market.config.slots : [];
      for (const slot of slots) {
        if (!slot || isAmmSlot(slot)) continue;
        if (slot.give !== rule.resource) continue;
        const rate = Number(slot.rate ?? 0);
        if (rate <= 0) continue;
        // Prix par tonne reçue = 1/rate T de contrepartie [TUNE-v1 ≤ 3].
        if (1 / rate > AUTO_TRADE_MAX_COST_PER_T) continue;
        const dest = autoTradeDestination(
          rule.resource,
          evalShipFuel(ship, nowMs).type,
        );
        const capLeft =
          dest === 'tank'
            ? (hull?.tankU ?? 0) - evalShipFuel(ship, nowMs).units
            : dest === 'survival_food'
              ? survivalCap - evalShipSurvival(ship, nowMs).food
              : dest === 'survival_water'
                ? survivalCap - evalShipSurvival(ship, nowMs).water
                : Math.max(
                    0,
                    (hull?.containers ?? 0) -
                      containersUsedTotal(
                        (ship.cargo ?? {}) as Partial<Record<ResourceId, number>>,
                        ship.item_cargo,
                      ),
                  );
        // Le stock du monde PAIE (il vend rule.resource).
        const { rows: giveStock } = await client.query(
          `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
           WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
          [ship.hover_body_id, rule.resource],
        );
        const worldHas = giveStock[0]
          ? evalLazy(
              {
                amount: giveStock[0].amount_t,
                ratePerDay: giveStock[0].rate_t_per_day,
                asOfMs: new Date(giveStock[0].as_of).getTime(),
              },
              nowMs,
              { min: 0 },
            )
          : 0;
        const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
        const counterHeld = Number(cargo[slot.get] ?? 0);
        // gotT visé, borné par : monde vendeur, contrepartie en soute,
        // capacité de destination.
        const wantGot = Math.min(rule.buyT, worldHas, capLeft);
        if (wantGot <= 1e-9) continue;
        const giveT = wantGot / rate; // contrepartie payée par la coque
        const gotT = fixedTradeOutput(giveT, rate);
        if (counterHeld + 1e-9 < giveT) continue; // soute courte : skip
        // — Physique : soute → stock (contrepartie) ; stock → dest (achat).
        cargo[slot.get] = counterHeld - giveT;
        if ((cargo[slot.get] ?? 0) < 1e-9) delete cargo[slot.get];
        if (dest === 'cargo') {
          cargo[rule.resource] = Number(cargo[rule.resource] ?? 0) + gotT;
        }
        const { rows: counterStock } = await client.query(
          `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
           WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
          [ship.hover_body_id, slot.get],
        );
        const counterHas = counterStock[0]
          ? evalLazy(
              {
                amount: counterStock[0].amount_t,
                ratePerDay: counterStock[0].rate_t_per_day,
                asOfMs: new Date(counterStock[0].as_of).getTime(),
              },
              nowMs,
              { min: 0 },
            )
          : 0;
        await client.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
           ON CONFLICT (body_id, resource)
             DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
          [ship.hover_body_id, slot.get, counterHas + giveT, nowMs],
        );
        await client.query(
          `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
           WHERE body_id = $1 AND resource = $2`,
          [ship.hover_body_id, rule.resource, worldHas - gotT, nowMs],
        );
        // Destination : soute / provisions / réservoir.
        if (dest === 'tank') {
          const tank = evalShipFuel(ship, nowMs);
          await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
            ship.id,
            JSON.stringify(cargo),
          ]);
          ship.cargo = cargo;
          await rebaseShipDrain(client, ship, nowMs, 'tank', {
            setUnits: tank.units + gotT,
          });
          ship.fuel = { [tank.type]: tank.units + gotT };
        } else if (dest === 'survival_food' || dest === 'survival_water') {
          const sv = evalShipSurvival(ship, nowMs);
          await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
            ship.id,
            JSON.stringify(cargo),
          ]);
          ship.cargo = cargo;
          const { rebaseShipSurvival } = await import('../sim/shipDrain.js');
          await rebaseShipSurvival(client, ship, nowMs, {
            setFoodT: dest === 'survival_food' ? sv.food + gotT : sv.food,
            setWaterT: dest === 'survival_water' ? sv.water + gotT : sv.water,
          });
          ship.survival = {
            food: dest === 'survival_food' ? sv.food + gotT : sv.food,
            water: dest === 'survival_water' ? sv.water + gotT : sv.water,
          };
        } else {
          await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
            ship.id,
            JSON.stringify(cargo),
          ]);
          ship.cargo = cargo;
        }
        // Journal (slot -3 = auto-trade orbital).
        await client.query(
          `INSERT INTO trades (market_building_id, body_id, trader, slot_index,
              gave_resource, gave_t, got_resource, got_t)
           VALUES ($1, $2, $3, -3, $4, $5, $6, $7)`,
          [
            market.id,
            ship.hover_body_id,
            ship.owner_id,
            slot.get,
            giveT,
            rule.resource,
            gotT,
          ],
        );
        purchases++;
        executed = true;
        break;
      }
    }
  }
  return purchases;
}

/**
 * Planifie le prochain auto_trade_check de la coque : au franchissement
 * du seuil le plus proche parmi les règles (whenReaches sur le réservoir
 * de destination), seulement en survol ÉTRANGER. Purge les checks
 * existants (idempotent).
 */
export async function scheduleAutoTradeCheck(
  client: pg.PoolClient,
  ship: Row,
  nowMs: number,
): Promise<void> {
  await client.query(
    `DELETE FROM events WHERE processed_at IS NULL
       AND kind = 'auto_trade_check' AND payload->>'shipId' = $1`,
    [ship.id],
  );
  if (ship.status !== 'hovering' || !ship.hover_body_id) return;
  const rules = (ship.auto_trade ?? []) as AutoTradeRule[];
  if (rules.length === 0) return;
  const { rows: worlds } = await client.query(
    `SELECT owner_id FROM bodies WHERE id = $1`,
    [ship.hover_body_id],
  );
  if (!worlds[0]?.owner_id || worlds[0].owner_id === ship.owner_id) return;
  let earliest: number | null = null;
  for (const rule of rules) {
    const dest = autoTradeDestination(
      rule.resource,
      evalShipFuel(ship, nowMs).type,
    );
    let amount = 0;
    let ratePerDay = 0;
    if (dest === 'tank') {
      amount = evalShipFuel(ship, nowMs).units;
      ratePerDay = Number(ship.fuel_rate_u_per_day ?? 0);
    } else if (dest === 'survival_food' || dest === 'survival_water') {
      const sv = evalShipSurvival(ship, nowMs);
      amount = dest === 'survival_food' ? sv.food : sv.water;
      ratePerDay = Number(ship.survival_rate_t_per_day ?? 0);
    } else {
      amount = Number((ship.cargo ?? {})[rule.resource] ?? 0);
    }
    if (amount < rule.belowT - 1e-9) {
      earliest = nowMs; // déjà sous le seuil : check immédiat
      break;
    }
    if (ratePerDay < -1e-12) {
      const at = whenReaches({ amount, ratePerDay, asOfMs: nowMs }, rule.belowT);
      if (at !== null && (earliest === null || at < earliest)) earliest = at;
    }
  }
  if (earliest !== null) {
    await enqueue(client, 'auto_trade_check', new Date(Math.max(earliest, nowMs) + 2), {
      shipId: ship.id,
    });
  }
}

/** Rebase + planifie après une entrée en survol étranger (helper hooks). */
export async function armAutoTradeOnHover(
  client: pg.PoolClient,
  shipId: string,
  nowMs: number,
): Promise<void> {
  const { rows } = await client.query(`SELECT * FROM ships WHERE id = $1`, [
    shipId,
  ]);
  if (rows[0]) await scheduleAutoTradeCheck(client, rows[0], nowMs);
}
