/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (actifs partout, starvation→0 %, pas de 5 %, batch/continu). */
/**
 * W9b — ACTIFS de conversion : réglage 0–100 % par pas de 5, fonctionne
 * PARTOUT (survol, transit, arrêt). Règlement au BORD (patron W3) :
 * `conversion_edge` à l'échéance projetée (fin de batch, starvation de
 * carburant/intrant, horizon continu) ; tout AJUSTEMENT règle d'abord
 * le couru PRO-RATA. Starvation → runPct 0 automatique (le batch
 * restant attend, reprise par re-réglage).
 *
 * BATCH (électrolyse) : l'intrant est SACRIFIÉ au lancement (retiré de
 * la soute) ; les sorties naissent au règlement, bornées par la place
 * en soute (l'excédent est VENTÉ, annoncé — le lancement refuse si la
 * soute ne peut pas accueillir la production TOTALE).
 * CONTINU (vivarium) : intrants de soute consommés au règlement.
 */
import {
  containersUsed,
  conversionOf,
  HULLS,
  isValidRunPct,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalShipFuel, rebaseShipDrain, type ShipRow } from '../sim/shipDrain.js';
import { CommandError } from './planets.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface ConversionState {
  runPct: number;
  direction: 'forward' | 'reverse';
  batchLeftT: number | null;
  startedAtMs: number;
}

function hullContainers(ship: Row): number {
  return (
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
      ?.containers ?? 0
  );
}

/**
 * Règle PRO-RATA le couru d'UN actif depuis son startedAtMs : convertit
 * min(débit × heures-jeu, batch/intrants, carburant, place), écrit
 * soute/réservoir, renvoie l'état à jour (runPct 0 si starvation).
 * Mutations sur `ship` (fuel/cargo/conversions) reflétées en BDD par
 * l'appelant via les UPDATE de cette fonction. S'exécute DANS la
 * transaction appelante, coque verrouillée FOR UPDATE.
 */
export async function settleConversion(
  client: pg.PoolClient,
  ship: Row,
  itemKey: string,
  nowMs: number,
  timeScale: number,
): Promise<ConversionState | null> {
  const conversions = { ...((ship.conversions ?? {}) as Record<string, ConversionState>) };
  const state = conversions[itemKey];
  const def = conversionOf(itemKey);
  if (!state || !def) return state ?? null;
  const elapsedH = Math.max(0, ((nowMs - state.startedAtMs) / 3_600_000) * timeScale);
  const rate = (def.ratePerHourAt100 * state.runPct) / 100;
  let refT = rate * elapsedH; // tonnes de référence potentielles
  const cargo = { ...((ship.cargo ?? {}) as Record<string, number>) };
  const input = state.direction === 'reverse' ? def.output : def.input;
  const output = state.direction === 'reverse' ? def.input : def.output;

  // Bornes : batch restant OU intrants de soute.
  let starved = false;
  if (def.mode === 'batch') {
    refT = Math.min(refT, state.batchLeftT ?? 0);
  } else {
    for (const [res, perRef] of Object.entries(input)) {
      const avail = Math.max(0, cargo[res] ?? 0);
      const cap = perRef ? avail / (perRef as number) : Infinity;
      if (cap < refT - 1e-9) {
        refT = Math.min(refT, cap);
        starved = true;
      }
    }
  }
  // Borne carburant de fonctionnement (h effectives = refT / rate).
  const tank = evalShipFuel(ship, nowMs);
  if (rate > 0 && def.fuelUPerHourAt100 > 0) {
    const fuelPerH = (def.fuelUPerHourAt100 * state.runPct) / 100;
    const maxHByFuel = fuelPerH > 0 ? tank.units / fuelPerH : Infinity;
    if (maxHByFuel < refT / rate - 1e-9) {
      refT = Math.min(refT, maxHByFuel * rate);
      starved = true;
    }
  }
  refT = Math.max(0, refT);

  // Écritures : intrants, sorties (bornées à la place — l'excédent est
  // venté, annoncé), carburant.
  if (refT > 0) {
    if (def.mode === 'batch') {
      state.batchLeftT = Math.max(0, (state.batchLeftT ?? 0) - refT);
    } else {
      for (const [res, perRef] of Object.entries(input)) {
        cargo[res] = Math.max(0, (cargo[res] ?? 0) - refT * (perRef as number));
        if (cargo[res]! <= 1e-9) delete cargo[res];
      }
    }
    const containers = hullContainers(ship);
    for (const [res, perRef] of Object.entries(output)) {
      const want = refT * (perRef as number);
      const free = Math.max(0, containers - containersUsed(cargo));
      const take = Math.min(want, free);
      if (take > 0) cargo[res] = (cargo[res] ?? 0) + take;
    }
    const fuelSpent = (def.fuelUPerHourAt100 * state.runPct * (refT / rate)) / 100;
    const newUnits = Math.max(0, tank.units - fuelSpent);
    ship.cargo = cargo;
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      ship.id,
      JSON.stringify(cargo),
    ]);
    // Réservoir matérialisé via le rebase standard (préserve les slots).
    await rebaseShipDrain(client, ship as ShipRow, nowMs, 'none', {
      setUnits: newUnits,
    });
    ship.fuel = { ...(ship.fuel ?? {}), [tank.type]: newUnits };
  }

  // Fin de batch ou starvation → 0 % automatique (décision responsable).
  const done = def.mode === 'batch' && (state.batchLeftT ?? 0) <= 1e-9;
  if (done) {
    delete conversions[itemKey];
  } else {
    if (starved) state.runPct = 0;
    state.startedAtMs = nowMs;
    conversions[itemKey] = state;
  }
  ship.conversions = conversions;
  await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
    ship.id,
    JSON.stringify(conversions),
  ]);
  // Purge des bords périmés de CET item puis replanification.
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'conversion_edge'
       AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
    [String(ship.id), itemKey],
  );
  if (!done && conversions[itemKey] && conversions[itemKey].runPct > 0) {
    await scheduleEdge(client, ship, itemKey, conversions[itemKey], nowMs, timeScale);
  }
  return conversions[itemKey] ?? null;
}

/** Projette la prochaine échéance (fin de batch, sec de carburant,
 * starvation d'intrant continu, ou horizon 24 h-jeu) et l'enfile. */
async function scheduleEdge(
  client: pg.PoolClient,
  ship: Row,
  itemKey: string,
  state: ConversionState,
  nowMs: number,
  timeScale: number,
): Promise<void> {
  const def = conversionOf(itemKey);
  if (!def || state.runPct <= 0) return;
  const rate = (def.ratePerHourAt100 * state.runPct) / 100;
  if (rate <= 0) return;
  let horizonH = 24; // matérialisation continue [TUNE]
  if (def.mode === 'batch') {
    horizonH = Math.min(horizonH, (state.batchLeftT ?? 0) / rate);
  } else {
    const input = state.direction === 'reverse' ? def.output : def.input;
    const cargo = (ship.cargo ?? {}) as Record<string, number>;
    for (const [res, perRef] of Object.entries(input)) {
      const avail = Math.max(0, cargo[res] ?? 0);
      if (perRef) horizonH = Math.min(horizonH, avail / (perRef as number) / rate);
    }
  }
  const fuelPerH = (def.fuelUPerHourAt100 * state.runPct) / 100;
  if (fuelPerH > 0) {
    const tank = evalShipFuel(ship, nowMs);
    horizonH = Math.min(horizonH, tank.units / fuelPerH);
  }
  const due = new Date(nowMs + Math.max(1, (horizonH * 3_600_000) / timeScale));
  await enqueue(client, 'conversion_edge', due, {
    shipId: String(ship.id),
    itemKey,
  });
}

/**
 * Règle/lance un actif : l'accessoire doit être MONTÉ ; pas de 5 % ;
 * batch : `batchT` sacrifié de la soute au lancement (refus si la soute
 * ne peut accueillir la production totale) ; `direction` reverse
 * réservé aux items réversibles. runPct 0 = OFF (le batch attend).
 */
export async function setConversion(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  input: {
    itemKey: string;
    runPct: number;
    batchT?: number;
    direction?: 'forward' | 'reverse';
  },
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ state: ConversionState | null }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const def = conversionOf(input.itemKey);
  if (!def) throw new CommandError('not_found', 'Actif inconnu');
  if (!isValidRunPct(input.runPct)) {
    throw new CommandError('not_available', 'Réglage par pas de 5 % (0–100)');
  }
  const direction = input.direction ?? 'forward';
  if (direction === 'reverse' && !def.reversible) {
    throw new CommandError('not_available', 'Cet actif ne sait pas inverser');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship: Row | undefined = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    const accessories: string[] = Array.isArray(ship.accessories)
      ? ship.accessories
      : [];
    if (!accessories.includes(input.itemKey)) {
      throw new CommandError('not_available', 'Cet accessoire n\'est pas monté');
    }
    // Règle le couru de CET item avant tout changement.
    await settleConversion(client, ship, input.itemKey, nowMs, timeScale);
    const conversions = { ...((ship.conversions ?? {}) as Record<string, ConversionState>) };
    let state = conversions[input.itemKey] ?? null;

    if (def.mode === 'batch' && input.batchT !== undefined) {
      if (state && (state.batchLeftT ?? 0) > 1e-9) {
        throw new CommandError('not_available', 'Un batch est déjà engagé — attendez sa fin ou son épuisement');
      }
      if (!(input.batchT > 0)) {
        throw new CommandError('not_available', 'Montant de batch invalide');
      }
      const cargo = { ...((ship.cargo ?? {}) as Record<string, number>) };
      const inRes = direction === 'reverse' ? def.output : def.input;
      const outRes = direction === 'reverse' ? def.input : def.output;
      for (const [res, perRef] of Object.entries(inRes)) {
        const need = input.batchT * (perRef as number);
        if ((cargo[res] ?? 0) + 1e-9 < need) {
          throw new CommandError(
            'insufficient_resources',
            `Soute : ${res} ${Number(cargo[res] ?? 0).toFixed(1)}/${need} T`,
          );
        }
      }
      // La soute doit pouvoir accueillir la production TOTALE (pire cas).
      const after = { ...cargo };
      for (const [res, perRef] of Object.entries(inRes)) {
        after[res] = Math.max(0, (after[res] ?? 0) - input.batchT * (perRef as number));
        if (after[res]! <= 1e-9) delete after[res];
      }
      let outTotal = 0;
      for (const [res, perRef] of Object.entries(outRes)) {
        after[res] = (after[res] ?? 0) + input.batchT * (perRef as number);
        outTotal += input.batchT * (perRef as number);
      }
      if (containersUsed(after) > hullContainers(ship)) {
        throw new CommandError(
          'not_available',
          `La soute ne peut pas accueillir les ${outTotal.toFixed(0)} T produites — videz des conteneurs`,
        );
      }
      // SACRIFIÉ au lancement.
      for (const [res, perRef] of Object.entries(inRes)) {
        cargo[res] = Math.max(0, (cargo[res] ?? 0) - input.batchT * (perRef as number));
        if (cargo[res]! <= 1e-9) delete cargo[res];
      }
      ship.cargo = cargo;
      await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
        shipId,
        JSON.stringify(cargo),
      ]);
      state = {
        runPct: input.runPct,
        direction,
        batchLeftT: input.batchT,
        startedAtMs: nowMs,
      };
    } else if (state) {
      state = { ...state, runPct: input.runPct, direction, startedAtMs: nowMs };
    } else {
      if (def.mode === 'batch') {
        throw new CommandError('not_available', 'Aucun batch engagé — fournissez un montant');
      }
      state = { runPct: input.runPct, direction, batchLeftT: null, startedAtMs: nowMs };
    }
    if (state.runPct === 0 && def.mode === 'continuous') {
      delete conversions[input.itemKey];
      state = null;
    } else {
      conversions[input.itemKey] = state;
    }
    ship.conversions = conversions;
    await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(conversions),
    ]);
    await client.query(
      `DELETE FROM events
       WHERE processed_at IS NULL AND kind = 'conversion_edge'
         AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
      [shipId, input.itemKey],
    );
    if (state && state.runPct > 0) {
      await scheduleEdge(client, ship, input.itemKey, state, nowMs, timeScale);
    }
    await client.query('COMMIT');
    return { state };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
