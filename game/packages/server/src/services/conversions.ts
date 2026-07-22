/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (taxonomie DÉFINITIVE : continus mobiles/gourmands, batch immobiles/efficaces). */
/**
 * W9b — ACTIFS de conversion (taxonomie définitive 2026-07-22) :
 * - CONTINUS : partout, pas de 5 %, intrants tirés de la SOUTE au fil
 *   de l'eau, carburant brûlé activement ; starvation → 0 % auto ;
 *   règlement au BORD (horizon/starvation) + pro-rata aux ajustements.
 * - BATCH : intrants consommés À L'ACTIVATION, coque À L'ARRÊT et
 *   IMMOBILISÉE pendant `processHours`, ZÉRO carburant brûlé ; sorties
 *   au terme (clé spéciale `fuel` = unités du TYPE MOTEUR directement
 *   au réservoir, bornées à la capacité effective) ; abandon = intrants
 *   PERDUS [interp annoncée].
 */
import {
  containersUsed,
  effectiveContainers,
  conversionOf,
  effectiveTankU,
  ENHANCED_RATE_MULT,
  ENHANCED_SUFFIX,
  HULLS,
  isValidRunPct,
  shipScanPc,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { SHIP_SCAN_PC } from './world.js';
import {
  evalShipFuel,
  evalShipHull,
  rebaseShipDrain,
  rebaseShipSurvival,
  type ShipRow,
} from '../sim/shipDrain.js';
import { CommandError } from './planets.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface ConversionState {
  runPct: number;
  direction: 'forward' | 'reverse';
  /** BATCH : fin de procédé (ms epoch réels) — l'immobilisation dure
   *  jusque-là. */
  processEndsAtMs?: number;
  startedAtMs: number;
  /** W9e jump_primer : durée de charge choisie (h-jeu). */
  chargeHours?: number;
  /** W9e jump_primer : boost de vitesse actif jusqu'à cet instant. */
  boostUntilMs?: number;
  /** W9e kedge_winch : cible du halage. */
  targetX?: number;
  targetY?: number;
  /** W9e kedge_winch : MODE BOOST (< 1 u au lancement — tout brûlé). */
  boost?: boolean;
  /** W9e deep_scan_pulse : corps sous scan figé à l'activation. */
  targetBodyId?: string;
  /** W9e cryo_stasis_pod : réveil en cours (10 min) — toujours gelé. */
  waking?: boolean;
}

function hullContainers(ship: Row): number {
  return effectiveContainers(
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
      ?.containers ?? 0,
    Array.isArray(ship.accessories) ? ship.accessories : [],
  );
}

/** Un procédé BATCH court-il encore ? (garde moveShip). */
export function batchProcessRunning(ship: Row, nowMs: number): string | null {
  const conversions = (ship.conversions ?? {}) as Record<string, ConversionState>;
  for (const [itemKey, state] of Object.entries(conversions)) {
    if (state.processEndsAtMs && state.processEndsAtMs > nowMs) return itemKey;
  }
  return null;
}

/**
 * Règle le couru d'UN actif. CONTINU : pro-rata (intrants de soute,
 * carburant, place — starvation → 0 %). BATCH : au terme uniquement
 * (sorties créditées, immobilisation levée). Transaction appelante,
 * coque verrouillée FOR UPDATE.
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

  if (def.mode === 'batch') {
    // W9e jump_primer : un BOOST expiré se nettoie au bord.
    if (!state.processEndsAtMs && state.boostUntilMs) {
      if (state.boostUntilMs <= nowMs + 1) {
        delete conversions[itemKey];
        ship.conversions = conversions;
        await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
          ship.id,
          JSON.stringify(conversions),
        ]);
        return null;
      }
      return state;
    }
    if (!state.processEndsAtMs || state.processEndsAtMs > nowMs + 1) {
      return state; // procédé encore en cours : rien à régler
    }
    // Terme du procédé : sorties créditées.
    const cargo = { ...((ship.cargo ?? {}) as Record<string, number>) };
    const containers = hullContainers(ship);
    for (const [res, tons] of Object.entries(def.output)) {
      if (res === 'fuel' || res === 'hp_pct') continue;
      const free = Math.max(0, containers - containersUsed(cargo));
      const take = Math.min(tons as number, free);
      if (take > 0) cargo[res] = (cargo[res] ?? 0) + take;
    }
    ship.cargo = cargo;
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      ship.id,
      JSON.stringify(cargo),
    ]);
    const fuelOut = Number((def.output as Record<string, number>).fuel ?? 0);
    if (fuelOut > 0) {
      const tank = evalShipFuel(ship, nowMs);
      const cap = effectiveTankU(
        HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
          ?.tankU ?? 0,
        ship.upgrades,
      );
      const newUnits = Math.min(cap, tank.units + fuelOut);
      await rebaseShipDrain(client, ship as ShipRow, nowMs, 'none', {
        setUnits: newUnits,
      });
      ship.fuel = { ...(ship.fuel ?? {}), [tank.type]: newUnits };
    }
    // W9e hull_patch_kit : sortie `hp_pct` = % des HP MAX réparés,
    // bornés au plein (l'excédent est perdu — kit symbolique).
    const hpOut = Number((def.output as Record<string, number>).hp_pct ?? 0);
    if (hpOut > 0) {
      const hull = evalShipHull(ship as ShipRow, nowMs);
      if (hull.maxHp > 0) {
        const newHp = Math.min(hull.maxHp, hull.hp + (hpOut / 100) * hull.maxHp);
        ship.hull_hp = newHp;
        ship.hull_as_of = new Date(nowMs).toISOString();
        await rebaseShipDrain(client, ship as ShipRow, nowMs, 'none', {});
      }
    }
    // W9e jump_primer : au terme de la CHARGE, le boost s'arme (durée =
    // boostDurationMult × charge ; grade enhanced ×1,5 en plus).
    if (def.charge && state.chargeHours) {
      const durMult =
        def.charge.boostDurationMult *
        (itemKey.endsWith(ENHANCED_SUFFIX) ? ENHANCED_RATE_MULT : 1);
      const boostUntilMs =
        nowMs + (state.chargeHours * durMult * 3_600_000) / timeScale;
      conversions[itemKey] = {
        runPct: 0,
        direction: 'forward',
        startedAtMs: nowMs,
        boostUntilMs,
      };
      ship.conversions = conversions;
      await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
        ship.id,
        JSON.stringify(conversions),
      ]);
      await client.query(
        `DELETE FROM events
         WHERE processed_at IS NULL AND kind = 'conversion_edge'
           AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
        [String(ship.id), itemKey],
      );
      await enqueue(client, 'conversion_edge', new Date(boostUntilMs + 1), {
        shipId: String(ship.id),
        itemKey,
      });
      return conversions[itemKey]!;
    }
    // W9e kedge_winch : au terme, la coque est HALÉE vers la cible —
    // `pc` parsecs (boostPc en mode boost), sans carburant.
    if (def.kedge && state.targetX !== undefined && state.targetY !== undefined) {
      const sx = Number(ship.x);
      const sy = Number(ship.y);
      const dist = Math.hypot(state.targetX - sx, state.targetY - sy);
      const stepPc = state.boost ? def.kedge.boostPc : def.kedge.pc;
      if (dist > 1e-9) {
        const f = Math.min(1, stepPc / dist);
        const nx = sx + (state.targetX - sx) * f;
        const ny = sy + (state.targetY - sy) * f;
        ship.x = nx;
        ship.y = ny;
        await client.query(`UPDATE ships SET x = $2, y = $3 WHERE id = $1`, [
          ship.id,
          nx,
          ny,
        ]);
      }
    }
    // W9e deep_scan_pulse : instantané d'intel PERSISTÉ (plancher).
    if (def.scanSnapshotTier && state.targetBodyId) {
      await client.query(
        `INSERT INTO player_body_intel (player_id, body_id, tier)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, body_id)
         DO UPDATE SET tier = GREATEST(player_body_intel.tier, EXCLUDED.tier),
                       granted_at = now()`,
        [ship.owner_id, state.targetBodyId, def.scanSnapshotTier],
      );
    }
    delete conversions[itemKey];
    ship.conversions = conversions;
    await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
      ship.id,
      JSON.stringify(conversions),
    ]);
    await client.query(
      `DELETE FROM events
       WHERE processed_at IS NULL AND kind = 'conversion_edge'
         AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
      [String(ship.id), itemKey],
    );
    // W9e cryo_stasis_pod : fin de stase (ou de réveil) — la survie se
    // RÉARME (le gel est levé).
    if (def.stasis) {
      await rebaseShipSurvival(client, ship as ShipRow, nowMs, {});
    }
    return null;
  }

  // CONTINU.
  const elapsedH = Math.max(0, ((nowMs - state.startedAtMs) / 3_600_000) * timeScale);
  const rate = (def.ratePerHourAt100 * state.runPct) / 100;
  let refT = rate * elapsedH;
  const cargo = { ...((ship.cargo ?? {}) as Record<string, number>) };
  const input = state.direction === 'reverse' ? def.output : def.input;
  const output = state.direction === 'reverse' ? def.input : def.output;
  let starved = false;
  for (const [res, perRef] of Object.entries(input)) {
    const avail = Math.max(0, cargo[res] ?? 0);
    const cap = perRef ? avail / (perRef as number) : Infinity;
    if (cap < refT - 1e-9) {
      refT = Math.min(refT, cap);
      starved = true;
    }
  }
  const tank = evalShipFuel(ship, nowMs);
  if (rate > 0 && def.fuelUPerHourAt100 > 0) {
    const fuelPerH = (def.fuelUPerHourAt100 * state.runPct) / 100;
    const maxHByFuel = fuelPerH > 0 ? tank.units / fuelPerH : Infinity;
    if (maxHByFuel < refT / rate - 1e-9) {
      refT = Math.min(refT, maxHByFuel * rate);
      starved = true;
    }
  }
  // W9e — sorties SPÉCIALES : bord de plein = starvation (auto 0 %).
  const fuelOutPerRef = Number((output as Record<string, number>).fuel ?? 0);
  const tankCap = effectiveTankU(
    HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
      ?.tankU ?? 0,
    ship.upgrades,
  );
  if (fuelOutPerRef > 0) {
    const space = Math.max(0, tankCap - tank.units);
    if (space / fuelOutPerRef < refT - 1e-9) {
      refT = Math.min(refT, space / fuelOutPerRef);
      starved = true;
    }
  }
  const hpPctPerRef = Number((output as Record<string, number>).hp_pct ?? 0);
  const hull = hpPctPerRef > 0 ? evalShipHull(ship as ShipRow, nowMs) : null;
  if (hull) {
    const hpPerRef = (hpPctPerRef / 100) * hull.maxHp;
    const maxRefByHull =
      hpPerRef > 0 ? Math.max(0, hull.maxHp - hull.hp) / hpPerRef : 0;
    if (maxRefByHull < refT - 1e-9) {
      refT = Math.min(refT, maxRefByHull);
      starved = true;
    }
  }
  refT = Math.max(0, refT);
  if (refT > 0) {
    for (const [res, perRef] of Object.entries(input)) {
      cargo[res] = Math.max(0, (cargo[res] ?? 0) - refT * (perRef as number));
      if (cargo[res]! <= 1e-9) delete cargo[res];
    }
    const containers = hullContainers(ship);
    for (const [res, perRef] of Object.entries(output)) {
      if (res === 'fuel' || res === 'hp_pct') continue;
      const want = refT * (perRef as number);
      const free = Math.max(0, containers - containersUsed(cargo));
      const take = Math.min(want, free);
      if (take > 0) cargo[res] = (cargo[res] ?? 0) + take;
    }
    const fuelSpent = (def.fuelUPerHourAt100 * state.runPct * (refT / rate)) / 100;
    const newUnits = Math.min(
      tankCap,
      Math.max(0, tank.units - fuelSpent) + refT * fuelOutPerRef,
    );
    if (hull) {
      const newHp = Math.min(
        hull.maxHp,
        hull.hp + refT * (hpPctPerRef / 100) * hull.maxHp,
      );
      ship.hull_hp = newHp;
      ship.hull_as_of = new Date(nowMs).toISOString();
    }
    ship.cargo = cargo;
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      ship.id,
      JSON.stringify(cargo),
    ]);
    await rebaseShipDrain(client, ship as ShipRow, nowMs, 'none', {
      setUnits: newUnits,
    });
    ship.fuel = { ...(ship.fuel ?? {}), [tank.type]: newUnits };
  }
  if (starved) state.runPct = 0;
  state.startedAtMs = nowMs;
  conversions[itemKey] = state;
  ship.conversions = conversions;
  await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
    ship.id,
    JSON.stringify(conversions),
  ]);
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind = 'conversion_edge'
       AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
    [String(ship.id), itemKey],
  );
  if (state.runPct > 0) {
    await scheduleContinuousEdge(client, ship, itemKey, state, nowMs, timeScale);
  }
  return conversions[itemKey] ?? null;
}

/** CONTINU : prochaine échéance (starvation d'intrant/carburant ou
 *  horizon 24 h-jeu de matérialisation). */
async function scheduleContinuousEdge(
  client: pg.PoolClient,
  ship: Row,
  itemKey: string,
  state: ConversionState,
  nowMs: number,
  timeScale: number,
): Promise<void> {
  const def = conversionOf(itemKey);
  if (!def || def.mode !== 'continuous' || state.runPct <= 0) return;
  const rate = (def.ratePerHourAt100 * state.runPct) / 100;
  if (rate <= 0) return;
  let horizonH = 24; // [TUNE]
  const input = state.direction === 'reverse' ? def.output : def.input;
  const cargo = (ship.cargo ?? {}) as Record<string, number>;
  for (const [res, perRef] of Object.entries(input)) {
    const avail = Math.max(0, cargo[res] ?? 0);
    if (perRef) horizonH = Math.min(horizonH, avail / (perRef as number) / rate);
  }
  const fuelPerH = (def.fuelUPerHourAt100 * state.runPct) / 100;
  if (fuelPerH > 0) {
    const tank = evalShipFuel(ship, nowMs);
    horizonH = Math.min(horizonH, tank.units / fuelPerH);
  }
  // W9e — bords de PLEIN des sorties spéciales (réservoir, coque).
  const outDef = state.direction === 'reverse' ? def.input : def.output;
  const fuelOutPerRef = Number((outDef as Record<string, number>).fuel ?? 0);
  if (fuelOutPerRef > 0) {
    const tank = evalShipFuel(ship, nowMs);
    const cap = effectiveTankU(
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
        ?.tankU ?? 0,
      ship.upgrades,
    );
    horizonH = Math.min(
      horizonH,
      Math.max(0, cap - tank.units) / (fuelOutPerRef * rate),
    );
  }
  const hpPctPerRef = Number((outDef as Record<string, number>).hp_pct ?? 0);
  if (hpPctPerRef > 0) {
    const hull = evalShipHull(ship as ShipRow, nowMs);
    if (hull.maxHp > 0) {
      horizonH = Math.min(
        horizonH,
        Math.max(0, hull.maxHp - hull.hp) /
          ((hpPctPerRef / 100) * hull.maxHp * rate),
      );
    }
  }
  const due = new Date(nowMs + Math.max(1, (horizonH * 3_600_000) / timeScale));
  await enqueue(client, 'conversion_edge', due, {
    shipId: String(ship.id),
    itemKey,
  });
}

/**
 * Règle un CONTINU (runPct pas de 5, 0 = off) ou lance/abandonne un
 * BATCH (runPct > 0 = lancement : coque À L'ARRÊT exigée, intrants
 * consommés à l'activation, immobilisée `processHours` ; runPct 0 =
 * abandon, intrants PERDUS [interp annoncée]).
 */
export async function setConversion(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  input: {
    itemKey: string;
    runPct: number;
    direction?: 'forward' | 'reverse';
    /** W9e jump_primer (durée de charge) / cryo enhanced (durée de
     *  stase choisie), en h-jeu. */
    hours?: number;
    /** W9e kedge_winch : cible du halage. */
    target?: { x: number; y: number };
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
  if (direction === 'reverse' && (def.mode !== 'continuous' || !def.reversible)) {
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
    await settleConversion(client, ship, input.itemKey, nowMs, timeScale);
    const conversions = { ...((ship.conversions ?? {}) as Record<string, ConversionState>) };
    let state: ConversionState | null = conversions[input.itemKey] ?? null;

    if (def.mode === 'batch') {
      if (input.runPct === 0) {
        // W9e cryo_stasis_pod : « abandonner » une stase = SE RÉVEILLER
        // (10 min, toujours gelé) ; l'autopilote (enhanced) refuse.
        if (def.stasis && state?.processEndsAtMs && state.processEndsAtMs > nowMs) {
          if (input.itemKey.endsWith(ENHANCED_SUFFIX)) {
            throw new CommandError(
              'not_available',
              'Autopilote cryostatique — irréveillable avant le terme',
            );
          }
          if (!state.waking) {
            const wakeEndsMs =
              nowMs + ((def.stasis.wakeMinutes / 60) * 3_600_000) / timeScale;
            state = {
              ...state,
              waking: true,
              processEndsAtMs: Math.min(state.processEndsAtMs, wakeEndsMs),
            };
            conversions[input.itemKey] = state;
            await client.query(
              `DELETE FROM events
               WHERE processed_at IS NULL AND kind = 'conversion_edge'
                 AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
              [shipId, input.itemKey],
            );
            await enqueue(
              client,
              'conversion_edge',
              new Date(state.processEndsAtMs! + 1),
              { shipId, itemKey: input.itemKey },
            );
          }
        } else if (state) {
          // Abandon : intrants PERDUS (annoncé), immobilisation levée.
          delete conversions[input.itemKey];
          state = null;
        }
      } else {
        if (state?.processEndsAtMs && state.processEndsAtMs > nowMs) {
          throw new CommandError('not_available', 'Un procédé est déjà en cours');
        }
        // BATCH : coque À L'ARRÊT (jamais en transit).
        if (ship.status === 'transit') {
          throw new CommandError(
            'not_available',
            'Le procédé batch exige l\'arrêt (survol/arrêt/quai)',
          );
        }
        // W9e — paramètres et gardes des batch SPÉCIAUX.
        let processHours = def.processHours;
        const extra: Partial<ConversionState> = {};
        if (def.charge) {
          const h = Number(input.hours);
          if (
            !Number.isFinite(h) ||
            h < def.charge.minHours ||
            h > def.charge.maxHours
          ) {
            throw new CommandError(
              'not_available',
              `Charge libre : ${def.charge.minHours} h à ${def.charge.maxHours} h-jeu`,
            );
          }
          processHours = h;
          extra.chargeHours = h;
        }
        if (def.stasis && input.itemKey.endsWith(ENHANCED_SUFFIX)) {
          // L2 autopilote : la DURÉE de stase est choisie au lancement.
          const h = Number(input.hours);
          if (!Number.isFinite(h) || h < 1 || h > def.stasis.maxHours) {
            throw new CommandError(
              'not_available',
              `Durée de stase requise : 1 h à ${def.stasis.maxHours} h-jeu`,
            );
          }
          processHours = h;
        }
        if (def.kedge) {
          if (ship.status === 'docked') {
            throw new CommandError(
              'not_available',
              'Le treuil ne hale qu\'en espace (pas à quai)',
            );
          }
          const tgt = input.target;
          if (
            !tgt ||
            !Number.isFinite(tgt.x) ||
            !Number.isFinite(tgt.y)
          ) {
            throw new CommandError('not_available', 'Cible de halage requise');
          }
          extra.targetX = tgt.x;
          extra.targetY = tgt.y;
          // MODE BOOST : lancé avec < 1 u restant — TOUT est brûlé d'un
          // coup, la dérive passe à boostPc.
          const tank = evalShipFuel(ship, nowMs);
          if (tank.units < 1) {
            extra.boost = true;
            await rebaseShipDrain(client, ship as ShipRow, nowMs, 'none', {
              setUnits: 0,
            });
            ship.fuel = { ...(ship.fuel ?? {}), [tank.type]: 0 };
          }
        }
        if (def.scanSnapshotTier) {
          // Cible = corps SOUS SCAN le plus proche, figé à l'activation.
          const scanPc = shipScanPc(accessories, SHIP_SCAN_PC);
          const { rows: nearest } = await client.query(
            `SELECT id FROM bodies
             WHERE body_type = 'planet' AND owner_id IS DISTINCT FROM $1
               AND (x - $2::float)^2 + (y - $3::float)^2 <= $4::float^2
             ORDER BY (x - $2::float)^2 + (y - $3::float)^2 LIMIT 1`,
            [playerId, Number(ship.x), Number(ship.y), scanPc],
          );
          if (!nearest[0]) {
            throw new CommandError('not_available', 'Aucun corps sous scan');
          }
          extra.targetBodyId = nearest[0].id;
        }
        // Intrants consommés À L'ACTIVATION (depuis la soute).
        const cargo = { ...((ship.cargo ?? {}) as Record<string, number>) };
        for (const [res, tons] of Object.entries(def.input)) {
          if ((cargo[res] ?? 0) + 1e-9 < (tons as number)) {
            throw new CommandError(
              'insufficient_resources',
              `Soute : ${res} ${Number(cargo[res] ?? 0).toFixed(1)}/${tons} T`,
            );
          }
        }
        for (const [res, tons] of Object.entries(def.input)) {
          cargo[res] = Math.max(0, (cargo[res] ?? 0) - (tons as number));
          if (cargo[res]! <= 1e-9) delete cargo[res];
        }
        ship.cargo = cargo;
        await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
          shipId,
          JSON.stringify(cargo),
        ]);
        const endsAtMs = nowMs + (processHours * 3_600_000) / timeScale;
        state = {
          runPct: 100,
          direction: 'forward',
          processEndsAtMs: endsAtMs,
          startedAtMs: nowMs,
          ...extra,
        };
        conversions[input.itemKey] = state;
        await enqueue(client, 'conversion_edge', new Date(endsAtMs + 1), {
          shipId,
          itemKey: input.itemKey,
        });
      }
    } else {
      if (input.runPct === 0) {
        delete conversions[input.itemKey];
        state = null;
      } else {
        state = {
          runPct: input.runPct,
          direction,
          startedAtMs: nowMs,
        };
        conversions[input.itemKey] = state;
      }
    }
    ship.conversions = conversions;
    await client.query(`UPDATE ships SET conversions = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(conversions),
    ]);
    // W9e cryo : le gel (ou son maintien pendant le réveil) se reflète
    // immédiatement sur le taux de survie.
    if (def.mode === 'batch' && def.stasis) {
      await rebaseShipSurvival(client, ship as ShipRow, nowMs, {});
    }
    if (def.mode === 'continuous') {
      await client.query(
        `DELETE FROM events
         WHERE processed_at IS NULL AND kind = 'conversion_edge'
           AND payload->>'shipId' = $1 AND payload->>'itemKey' = $2`,
        [shipId, input.itemKey],
      );
      if (state && state.runPct > 0) {
        await scheduleContinuousEdge(client, ship, input.itemKey, state, nowMs, timeScale);
      }
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
