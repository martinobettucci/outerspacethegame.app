/**
 * Handlers d'événements de simulation. Chaque handler est idempotent
 * (at-least-once) et ne manipule que l'état passé par sa transaction.
 */
import {
  allocateSettlerDeaths,
  agingFlows,
  applyDeaths,
  breathesFromStock,
  BUILD_FUEL_FRACTION,
  BUILDINGS,
  CLAIM_RADIUS_PC,
  CLOCK_DAYS,
  clockDeathsPerDay,
  COLONY_SEED_STOCK,
  FOOD_RESOURCES,
  GEAR,
  engineSpeedMult,
  hasFullMedicineSupply,
  HULL_WEAR_FLOOR_HP,
  HULL_WEAR_FRACTION_PER_DAY,
  HULLS,
  illnessDeathsPerDay,
  PROBE,
  segmentCircleCrossingPc,
  SHIELD_KINDS,
  shieldForStarField,
  starFieldRadiusPc,
  illnessDeltaV2,
  isAmmSlot,
  JUNK_CARCASS_T,
  normalizeDemographicCounters,
  overcapDeathsPerDay,
  popCap,
  settlerLosses,
  settlerManifestTotal,
  settlerTripRisk,
  UNEMP_GRACE_DAYS,
  UNEMP_TOLERANCE,
  unemploymentDeathsPerDay,
  unemploymentRate,
  type DemographicCounters,
  type Pyramid,
  type SettlerManifest,
} from '@atg/shared';
import type pg from 'pg';
import { aggregateCensus } from './census.js';
import { enqueue, type EventHandler } from './events.js';
import { whenReaches } from './lazy.js';
import { recomputePlanetRates } from './rebase.js';
import { populationIndicators } from './population.js';
import { extinguishPlanet } from './extinction.js';
import { evalStarFuel, releaseHarvest } from '../services/harvest.js';
import { depositJunkAt } from '../services/junk.js';
import { runAutoTrade, scheduleAutoTradeCheck } from '../services/hoverTrade.js';
import { settleAnchorTransfer, shipPosition } from '../services/ships.js';
import { payStep, WORK_ORDER_RETRY_HOURS } from '../services/workOrders.js';
import { evalShipFuel, evalShipHull, evalShipSurvival, rebaseShipDrain, rebaseShipHull, rebaseShipSurvival, shipMaxHp } from './shipDrain.js';

/**
 * construction_complete { buildingId } — active un bâtiment échu puis
 * rebase la planète (le nouveau bâtiment produit/stocke dès maintenant).
 */
export const constructionComplete: EventHandler = async (client, event) => {
  const buildingId = String(event.payload.buildingId ?? '');
  if (!buildingId) return;
  const { rows } = await client.query(
    `UPDATE buildings
       SET status = 'active', completes_at = NULL
     WHERE id = $1 AND status = 'constructing' AND completes_at <= $2
     RETURNING body_id`,
    [buildingId, event.dueAt],
  );
  if (rows[0]) {
    await recomputePlanetRates(client, rows[0].body_id, event.dueAt.getTime());
  }
};

/**
 * retool_complete { buildingId } — fin du rééquipage (DG §5.1) : la
 * recette (déjà écrite) s'éveille, la production reprend au rebase.
 */
export const retoolComplete: EventHandler = async (client, event) => {
  const buildingId = String(event.payload.buildingId ?? '');
  if (!buildingId) return;
  const { rows } = await client.query(
    `UPDATE buildings
       SET status = 'active', completes_at = NULL
     WHERE id = $1 AND status = 'retooling' AND completes_at <= $2
     RETURNING body_id`,
    [buildingId, event.dueAt],
  );
  if (rows[0]) {
    await recomputePlanetRates(client, rows[0].body_id, event.dueAt.getTime());
  }
};

/**
 * fuel_transfer_complete { probeId, startedAtMs } — bord d'un transfert
 * ancré (W3) : règle le transfert au montant planifié (min donneur/
 * capacité au moment du bord). Idempotence : ne règle que si la sonde
 * porte encore CE transfert (transfer_started_at = startedAtMs) — une
 * annulation ou un nouveau transfert a purgé/remplacé ce bord.
 */
export const fuelTransferComplete: EventHandler = async (client, event) => {
  const probeId = String(event.payload.probeId ?? '');
  const startedAtMs = Number(event.payload.startedAtMs ?? 0);
  if (!probeId || !startedAtMs) return;
  const { rows } = await client.query(
    `SELECT * FROM ships
     WHERE id = $1 AND transfer_started_at = to_timestamp($2 / 1000.0)
     FOR UPDATE`,
    [probeId, startedAtMs],
  );
  if (!rows[0]) return;
  await settleAnchorTransfer(
    client,
    rows[0],
    event.dueAt.getTime(),
    Number(rows[0].transfer_units ?? 0),
  );
};

/**
 * shield_morph_complete { shipId, startedAtMs } — fin de morphose (W5) :
 * l'adaptation demandée devient LA SEULE active (coque morphique — une
 * chimie à la fois), l'usure re-basée sur le nouvel état. Idempotence :
 * ne règle que si la coque porte encore CETTE morphose.
 */
export const shieldMorphComplete: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  const startedAtMs = Number(event.payload.startedAtMs ?? 0);
  if (!shipId || !startedAtMs) return;
  const { rows } = await client.query(
    `SELECT * FROM ships
     WHERE id = $1 AND morphing_shield IS NOT NULL
       AND morph_started_at = to_timestamp($2 / 1000.0)
     FOR UPDATE`,
    [shipId, startedAtMs],
  );
  const ship = rows[0];
  if (!ship) return;
  const kind = String(ship.morphing_shield);
  const flags = Object.fromEntries(
    SHIELD_KINDS.map((k) => [`shield_${k}`, k === kind]),
  );
  await client.query(
    `UPDATE ships
       SET shield_hot = $2, shield_cold = $3, shield_radio = $4,
           morphing_shield = NULL, morph_started_at = NULL
     WHERE id = $1`,
    [shipId, flags.shield_hot, flags.shield_cold, flags.shield_radio],
  );
  // Le péage cesse (ou commence) immédiatement selon la nouvelle chimie.
  const { rows: fresh } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [shipId],
  );
  if (fresh[0]) {
    await rebaseShipHull(client, fresh[0], event.dueAt.getTime());
  }
};

/**
 * item_fabricated { bodyId, itemKey } — fin de fabrication (W6) : la
 * ligne non-fongible naît en entrepôt. Exactement-une-fois par la
 * transaction du processeur.
 */
export const itemFabricated: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  const itemKey = String(event.payload.itemKey ?? '');
  if (!bodyId || !itemKey || !GEAR[itemKey]) return;
  await client.query(
    `INSERT INTO planet_items (body_id, item_key) VALUES ($1, $2)`,
    [bodyId, itemKey],
  );
};

/**
 * item_installed { shipId, itemKey, startedAtMs } — fin d'installation
 * (W6) : accessoire ajouté OU upgrade écrit (1 par famille, le niveau
 * remplace). Idempotence : la coque doit porter encore CETTE
 * installation.
 */
export const itemInstalled: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  const itemKey = String(event.payload.itemKey ?? '');
  const startedAtMs = Number(event.payload.startedAtMs ?? 0);
  if (!shipId || !itemKey || !startedAtMs) return;
  const def = GEAR[itemKey];
  if (!def) return;
  const { rows } = await client.query(
    `SELECT * FROM ships
     WHERE id = $1 AND installing_item = $2
       AND install_started_at = to_timestamp($3 / 1000.0)
     FOR UPDATE`,
    [shipId, itemKey, startedAtMs],
  );
  const ship = rows[0];
  if (!ship) return;
  if (def.kind === 'accessory') {
    const accessories: string[] = Array.isArray(ship.accessories)
      ? ship.accessories
      : [];
    if (!accessories.includes(itemKey)) accessories.push(itemKey);
    await client.query(
      `UPDATE ships SET accessories = $2,
          installing_item = NULL, install_started_at = NULL
       WHERE id = $1`,
      [shipId, JSON.stringify(accessories)],
    );
  } else {
    const upgrades = { ...(ship.upgrades ?? {}) } as Record<string, number>;
    upgrades[def.slot] = def.level ?? 2;
    await client.query(
      `UPDATE ships SET upgrades = $2,
          installing_item = NULL, install_started_at = NULL
       WHERE id = $1`,
      [shipId, JSON.stringify(upgrades)],
    );
  }
};

/**
 * work_step { orderId, stepMs } — un palier d'usinage partiel (W7) :
 * l'ordre ne court que s'il est le PLUS ANCIEN inachevé de son usine
 * (FIFO d'insertion) ; 5 % payés ou `starved` (retry 1 h-jeu × stepMs
 * relatif) ; 20e palier → événement terminal EXISTANT.
 */
export const workStep: EventHandler = async (client, event) => {
  const orderId = String(event.payload.orderId ?? '');
  const stepMs = Number(event.payload.stepMs ?? 0);
  if (!orderId || !stepMs) return;
  const { rows } = await client.query(
    `SELECT * FROM work_orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );
  const order = rows[0];
  if (!order) return;
  const nowMs = event.dueAt.getTime();
  // FIFO par usine : un ordre plus ancien inachevé de la même usine
  // passe d'abord — ce palier se replanifie derrière lui.
  if (order.factory_building_id) {
    const { rows: elder } = await client.query(
      `SELECT 1 FROM work_orders
       WHERE factory_building_id = $1 AND created_at < $2 LIMIT 1`,
      [order.factory_building_id, order.created_at],
    );
    if (elder[0]) {
      await enqueue(client, 'work_step', new Date(nowMs + stepMs), {
        orderId,
        stepMs,
      });
      return;
    }
  }
  const paid = await payStep(
    client,
    order.body_id,
    order.cost as Record<string, number>,
    nowMs,
  );
  if (!paid) {
    // Affamé : retry à LA CADENCE DU PALIER (stepMs porte déjà l'échelle
    // de temps) [TUNE-v1 simplification annoncée — la constante
    // WORK_ORDER_RETRY_HOURS reste le levier de tuning].
    void WORK_ORDER_RETRY_HOURS;
    await client.query(
      `UPDATE work_orders SET status = 'starved' WHERE id = $1`,
      [orderId],
    );
    await enqueue(client, 'work_step', new Date(nowMs + stepMs), {
      orderId,
      stepMs,
    });
    return;
  }
  const done = Number(order.steps_done) + 1;
  if (done >= Number(order.steps_total)) {
    await client.query(`DELETE FROM work_orders WHERE id = $1`, [orderId]);
    // Naissance par la voie EXISTANTE (exactement-une-fois).
    const kind = order.kind === 'ship' ? 'ship_built' : 'item_fabricated';
    await enqueue(client, kind as 'ship_built', event.dueAt, order.payload);
    return;
  }
  await client.query(
    `UPDATE work_orders SET steps_done = $2, status = 'running' WHERE id = $1`,
    [orderId, done],
  );
  await enqueue(client, 'work_step', new Date(nowMs + stepMs), {
    orderId,
    stepMs,
  });
};

/** demolition_complete { buildingId } — retire le bâtiment puis rebase. */
export const demolitionComplete: EventHandler = async (client, event) => {
  const buildingId = String(event.payload.buildingId ?? '');
  if (!buildingId) return;
  const { rows } = await client.query(
    `DELETE FROM buildings WHERE id = $1 AND status = 'demolishing'
     RETURNING body_id`,
    [buildingId],
  );
  if (rows[0]) {
    await recomputePlanetRates(client, rows[0].body_id, event.dueAt.getTime());
  }
};

/** stock_edge { bodyId } — un bord de stock/frein est atteint : rebase. */
export const stockEdge: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  if (!bodyId) return;
  const nowMs = event.dueAt.getTime();
  const snap = await recomputePlanetRates(client, bodyId, nowMs);
  // Oxygène (DG §3.2-v2 i) : la population d'un climat hostile qui
  // épuise son stock meurt INSTANTANÉMENT — vérifié au bord exact.
  if (
    snap?.ownerId &&
    snap.population > 0 &&
    snap.rates.popNeeds.oxygen > 1e-9 &&
    snap.rates.popConsumption.oxygen < snap.rates.popNeeds.oxygen - 1e-9 &&
    (snap.stocks.oxygen ?? 0) <= 1e-6
  ) {
    await extinguishPlanet(client, snap, nowMs);
  }
};

/**
 * deposit_dry { bodyId, resource } — gisement à sec POUR TOUJOURS
 * (canon GB §3) : fige à 0 puis rebase (l'extracteur s'arrête).
 */
export const depositDry: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  const resource = String(event.payload.resource ?? '');
  if (!bodyId || !resource) return;
  await client.query(
    `UPDATE deposits SET amount_t = 0, rate_t_per_day = 0, as_of = now()
     WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  await recomputePlanetRates(client, bodyId, event.dueAt.getTime());
};

type ResourceIdLike = Parameters<typeof String>[0] & string;

/** Impute `deaths` proportionnellement aux catégories dans les compteurs. */
function addProportionalDeaths(
  counters: DemographicCounters,
  pyr: Pyramid,
  deaths: number,
): void {
  const pop = pyr.children + pyr.actives + pyr.seniors;
  if (deaths <= 0 || pop <= 0) return;
  const frac = Math.min(1, deaths / pop);
  counters.deaths.children += pyr.children * frac;
  counters.deaths.actives += pyr.actives * frac;
  counters.deaths.seniors += pyr.seniors * frac;
}

/**
 * pop_daily { bodyId } — matérialisation quotidienne v2 (DG §3.2-v2,
 * chunk BA) : vieillissement 3 âges, natalité (residential × M_growth),
 * maladie/morts paraboliques de sur-cap, horloges de mort linéaires à
 * échéance fixe (eau 3 j / vivres 10 j ; oxygène = instantané, traité
 * aussi au bord de stock). Puis rebase et replanification.
 */
export const popDaily: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  if (!bodyId) return;
  const nowMs = event.dueAt.getTime();
  const snap = await recomputePlanetRates(client, bodyId, nowMs);
  if (!snap || !snap.ownerId) return;

  const medicineSupplied = hasFullMedicineSupply(
    snap.rates.popConsumption.medicine,
    snap.rates.popNeeds.medicine,
  );
  const cap = popCap(snap.size, snap.quality);

  // 1. Vieillissement (jamais modulé — §3.2-v2 a/d).
  let pyr: Pyramid = { ...snap.pyramid };
  const flows = agingFlows(pyr, 1);
  pyr = {
    children: pyr.children - flows.toActives,
    actives: pyr.actives + flows.toActives - flows.toSeniors,
    seniors: pyr.seniors + flows.toSeniors - flows.seniorDeaths,
  };
  const counters = normalizeDemographicCounters(snap.demoCounters);
  counters.deaths.seniors += flows.seniorDeaths;

  // 2. Natalité : facteurs calculés dans l'unique projection partagée
  // par le tick et la page stats (imports exclus de la croissance).
  const indicators = populationIndicators(snap);
  const clinicLevel = indicators.clinicLevel;
  const staffSum = indicators.employedActives;
  // Le vieillissement a déjà modifié les actifs depuis le snapshot : on
  // applique son taux de natalité courant à cette cohorte post-flux.
  const births =
    indicators.birthsPerDay *
    (snap.pyramid.actives > 1e-9
      ? pyr.actives / snap.pyramid.actives
      : 0);
  pyr.children += births;

  // 2b. Le chômage tue (chunk BB, DG §3.2-v2 g) : τ sur les ACTIFS,
  // tolérance 7 %, grâce de 3 jours CONSÉCUTIFS — inerte pendant la
  // grâce de colonie de 14 j (starter compris, colonized_at) ; puis
  // morts γ(τ−7 %)×P frappant toute la pyramide (le staff est décrémenté
  // en fin de journée avec TOUTES les morts — vagues et momentum).
  const tau = unemploymentRate(staffSum, pyr.actives);
  const inColonyGrace =
    snap.colonizedAtMs !== null &&
    nowMs < snap.colonizedAtMs + 14 * 86_400_000;
  let unempOverDays = snap.unempOverDays;
  let unempDeaths = 0;
  if (!inColonyGrace && tau > UNEMP_TOLERANCE) {
    unempOverDays += 1;
    if (unempOverDays >= UNEMP_GRACE_DAYS) {
      const popHere = pyr.children + pyr.actives + pyr.seniors;
      unempDeaths = unemploymentDeathsPerDay(tau, popHere);
      addProportionalDeaths(counters, pyr, unempDeaths);
      pyr = applyDeaths(pyr, unempDeaths);
    }
  } else if (tau <= UNEMP_TOLERANCE) {
    unempOverDays = 0;
  }

  // 3. Maladie v2 (parabole de sur-cap, clinique) + morts.
  const popNow = pyr.children + pyr.actives + pyr.seniors;
  const over = popNow / cap - 1;
  const newIllness = Math.min(
    1,
    Math.max(
      0,
      snap.illness + illnessDeltaV2(over, snap.illness, !medicineSupplied),
    ),
  );
  const parabDeaths =
    illnessDeathsPerDay(newIllness, clinicLevel, popNow) +
    overcapDeathsPerDay(popNow, cap);
  addProportionalDeaths(counters, pyr, parabDeaths);
  pyr = applyDeaths(pyr, parabDeaths);

  // 4. Horloges de mort (eau/vivres) : famille À SEC et besoin non servi
  //    ⇒ échéance FIXE posée + morts linéaires quotidiennes ; le retour
  //    du stock lève l'horloge. Oxygène : mort INSTANTANÉE totale.
  const clocks: Partial<Record<'water' | 'food', string>> = {
    ...snap.clockDeadlines,
  };
  const stockOf = snap.stocks as Record<string, number | undefined>;
  const familyStock = (family: readonly string[]) =>
    family.reduce((s, r) => s + (stockOf[r] ?? 0), 0);
  const starving = (family: 'water' | 'food') => {
    const need =
      family === 'water' ? snap.rates.popNeeds.water : snap.rates.popNeeds.food;
    const served =
      family === 'water'
        ? snap.rates.popConsumption.water
        : snap.rates.popConsumption.food;
    const stock = familyStock(family === 'water' ? ['water'] : FOOD_RESOURCES);
    return need > 1e-9 && served < need - 1e-9 && stock <= 1e-6;
  };
  for (const family of ['water', 'food'] as const) {
    if (starving(family)) {
      if (!clocks[family]) {
        const deadline = nowMs + CLOCK_DAYS[family] * 86_400_000;
        clocks[family] = new Date(deadline).toISOString();
        await enqueue(client, 'pop_clock', new Date(deadline), {
          bodyId,
          family,
        });
      } else {
        const pop = pyr.children + pyr.actives + pyr.seniors;
        const d = Math.min(
          pop,
          clockDeathsPerDay(pop, nowMs, new Date(clocks[family]!).getTime()),
        );
        addProportionalDeaths(counters, pyr, d);
        pyr = applyDeaths(pyr, d);
      }
    } else if (clocks[family]) {
      delete clocks[family];
      await client.query(
        `DELETE FROM events WHERE processed_at IS NULL AND kind = 'pop_clock'
           AND payload->>'bodyId' = $1 AND payload->>'family' = $2`,
        [bodyId, family],
      );
    }
  }
  if (
    snap.rates.popNeeds.oxygen > 1e-9 &&
    snap.rates.popConsumption.oxygen < snap.rates.popNeeds.oxygen - 1e-9 &&
    familyStock(['oxygen']) <= 1e-6
  ) {
    addProportionalDeaths(counters, pyr, pyr.children + pyr.actives + pyr.seniors);
    pyr = { children: 0, actives: 0, seniors: 0 };
  }

  const round3 = (v: number) => Math.max(0, Math.round(v * 1000) / 1000);
  const newPop = round3(pyr.children) + round3(pyr.actives) + round3(pyr.seniors);
  if (newPop <= 0) {
    // Oxygène, famine/maladie exacte ou reliquat sous le millième : une
    // seule transition retire la propriété et ne replannifie pas demain.
    await extinguishPlanet(
      client,
      { bodyId, pyramid: pyr, demoCounters: counters },
      nowMs,
    );
    return;
  }
  await client.query(
    `UPDATE bodies SET population = $2, pop_children = $3, pop_seniors = $4,
            illness = $5, clock_deadlines = $6, demo_counters = $7,
            unemp_over_days = $8, pop_as_of = to_timestamp($9 / 1000.0)
     WHERE id = $1`,
    [
      bodyId,
      newPop,
      round3(pyr.children),
      round3(pyr.seniors),
      newIllness,
      JSON.stringify(clocks),
      JSON.stringify(counters),
      unempOverDays,
      nowMs,
    ],
  );
  // Les morts frappent AUSSI les employés (canon) : le staff de chaque
  // bâtiment suit la proportion d'actifs disparus dans la journée.
  const activesBefore = snap.pyramid.actives + 1e-9;
  const activesFrac = Math.min(1, Math.max(0, pyr.actives / activesBefore));
  if (activesFrac < 1) {
    await client.query(
      `UPDATE buildings SET workforce = floor(workforce * $2::float8)::int
       WHERE body_id = $1 AND workforce > 0`,
      [bodyId, activesFrac],
    );
  }
  // La population a changé ⇒ consommation et optimums d'emploi aussi : rebase.
  await recomputePlanetRates(client, bodyId, nowMs);
  // pop_daily suivant (recomputePlanetRates ne le crée que s'il manque —
  // l'événement courant est déjà réclamé mais pas encore marqué traité,
  // donc on planifie explicitement le prochain jour).
  await client.query(
    `DELETE FROM events WHERE processed_at IS NULL AND kind = 'pop_daily'
       AND payload->>'bodyId' = $1 AND id <> $2`,
    [bodyId, event.id],
  );
  await client.query(
    `INSERT INTO events (due_at, kind, payload)
     VALUES (to_timestamp($1 / 1000.0), 'pop_daily', $2)`,
    [nowMs + 86_400_000, JSON.stringify({ bodyId })],
  );
};

/**
 * pop_clock { bodyId, family } — échéance d'une horloge de mort (eau 3 j
 * / vivres 10 j, DG §3.2-v2 i) : si la famine court TOUJOURS, toute la
 * population restante meurt (canon « everyone dies ») ; si le stock est
 * revenu entre-temps, l'événement périmé se tait (l'horloge a été levée
 * par le pop_daily). Idempotent.
 */
export const popClock: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  const family = String(event.payload.family ?? '') as 'water' | 'food';
  if (!bodyId || !['water', 'food'].includes(family)) return;
  const nowMs = event.dueAt.getTime();
  const snap = await recomputePlanetRates(client, bodyId, nowMs);
  if (!snap || !snap.ownerId || snap.population <= 0) return;
  if (!snap.clockDeadlines[family]) return; // horloge levée entre-temps
  const need =
    family === 'water' ? snap.rates.popNeeds.water : snap.rates.popNeeds.food;
  const served =
    family === 'water'
      ? snap.rates.popConsumption.water
      : snap.rates.popConsumption.food;
  const stock = (family === 'water' ? ['water'] : [...FOOD_RESOURCES]).reduce(
    (s, r) => s + (snap.stocks[r as keyof typeof snap.stocks] ?? 0),
    0,
  );
  if (need > 1e-9 && served < need - 1e-9 && stock <= 1e-6) {
    await extinguishPlanet(client, snap, nowMs);
  } else {
    // Famine résolue : lever l'horloge persistée.
    await client.query(
      `UPDATE bodies SET clock_deadlines = clock_deadlines - $2 WHERE id = $1`,
      [bodyId, family],
    );
  }
};

/**
 * ship_arrival { shipId } — fin de segment : position à destination,
 * survol si corps visé, sinon à l'arrêt dans le vide. Idempotent.
 */
export const shipArrival: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  // Verrou d'abord : le péage settlers et l'atterrissage de mission doivent
  // se décider sur l'état réel (idempotent : le WHERE status='transit'
  // vaut garde de rejeu).
  const { rows: ships } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND status = 'transit'
       AND arrives_at <= $2 FOR UPDATE`,
    [shipId, event.dueAt],
  );
  const ship = ships[0];
  if (!ship) return;

  // Péage de trajet des settlers (DG §3.2) : déterministe, par ROUTE
  // persistante (origine, destination) — l'accumulateur fractionnaire
  // garantit « no free sub-20 cohorts ». Appliqué à l'arrivée sur une
  // planète, quel que soit son propriétaire.
  if (ship.settlers > 0 && ship.dest_body_id && ship.settlers_origin_body_id) {
    const { rows: dest } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND body_type = 'planet'`,
      [ship.dest_body_id],
    );
    if (dest[0]) {
      const { rows: pilots } = await client.query(
        `SELECT stat_rolls FROM npcs
         WHERE bound_host_type = 'ship' AND bound_host_id = $1 AND role = 'pilot'`,
        [shipId],
      );
      const reductions = pilots.map(
        (p) => Number(p.stat_rolls?.settler_risk_reduction ?? 0),
      );
      const { rows: routes } = await client.query(
        `INSERT INTO settler_routes (origin_body_id, dest_body_id)
         VALUES ($1, $2)
         ON CONFLICT (origin_body_id, dest_body_id) DO UPDATE
           SET updated_at = now()
         RETURNING loss_carry`,
        [ship.settlers_origin_body_id, ship.dest_body_id],
      );
      const { deaths, carryOut } = settlerLosses(
        ship.settlers,
        settlerTripRisk(reductions),
        Number(routes[0].loss_carry),
      );
      if (deaths > 0) {
        const manifest: SettlerManifest = {
          children: Number(ship.settlers_children ?? 0),
          actives: Number(ship.settlers_actives ?? ship.settlers),
          seniors: Number(ship.settlers_seniors ?? 0),
        };
        const lost = allocateSettlerDeaths(manifest, deaths);
        if (settlerManifestTotal(lost) !== deaths) {
          throw new Error('Invariant BD : ventilation du péage settlers incohérente');
        }
        await client.query(
          `UPDATE ships
              SET settlers = settlers - $2,
                  settlers_children = settlers_children - $3,
                  settlers_actives = settlers_actives - $4,
                  settlers_seniors = settlers_seniors - $5
            WHERE id = $1`,
          [shipId, deaths, lost.children, lost.actives, lost.seniors],
        );

        // Les morts de voyage racontent la responsabilité du monde qui a
        // envoyé la cohorte, même si ce monde est devenu sauvage depuis.
        const { rows: origins } = await client.query(
          `SELECT demo_counters FROM bodies WHERE id = $1 FOR UPDATE`,
          [ship.settlers_origin_body_id],
        );
        if (origins[0]) {
          const counters = normalizeDemographicCounters(origins[0].demo_counters);
          counters.deaths.children += lost.children;
          counters.deaths.actives += lost.actives;
          counters.deaths.seniors += lost.seniors;
          await client.query(`UPDATE bodies SET demo_counters = $2 WHERE id = $1`, [
            ship.settlers_origin_body_id,
            JSON.stringify(counters),
          ]);
        }
      }
      await client.query(
        `UPDATE settler_routes SET loss_carry = $3, updated_at = now()
         WHERE origin_body_id = $1 AND dest_body_id = $2`,
        [ship.settlers_origin_body_id, ship.dest_body_id, carryOut],
      );
    }
  }

  // W5 : traversée des CHAMPS climatiques stellaires (0,5 × r_nova) —
  // dégâts réglés AU BORD : longueur d'intersection du segment avec
  // chaque champ non blindé, jours = longueur/vitesse, 5 % HP max/jour,
  // PLANCHER 1 HP (un péage, jamais une mort — GB §27).
  if (ship.origin_x !== null && ship.dest_x !== null) {
    const ox = Number(ship.origin_x);
    const oy = Number(ship.origin_y);
    const dxx = Number(ship.dest_x);
    const dyy = Number(ship.dest_y);
    const speed =
      (ship.hull_category === 'probe'
        ? PROBE.speedPcPerDay
        : (HULLS[
            `${ship.hull_category}_${ship.hull_size}` as keyof typeof HULLS
          ]?.speedPcPerDay ?? 0)) * engineSpeedMult(ship.upgrades);
    if (speed > 0) {
      const pad = 51; // ≥ champ L ≈ 50,4 pc
      const { rows: fieldStars } = await client.query(
        `SELECT x, y, star_fuel_type, r_nova FROM bodies
         WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
           AND x BETWEEN LEAST($1::float8, $3::float8) - $5::float8
                     AND GREATEST($1::float8, $3::float8) + $5::float8
           AND y BETWEEN LEAST($2::float8, $4::float8) - $5::float8
                     AND GREATEST($2::float8, $4::float8) + $5::float8`,
        [ox, oy, dxx, dyy, pad],
      );
      let crossingDays = 0;
      for (const s of fieldStars) {
        const kind = shieldForStarField(s.star_fuel_type);
        if (!kind || ship[`shield_${kind}`]) continue;
        const radius = starFieldRadiusPc(Number(s.r_nova ?? 0));
        if (radius <= 0) continue;
        crossingDays +=
          segmentCircleCrossingPc(ox, oy, dxx, dyy, Number(s.x), Number(s.y), radius) /
          speed;
      }
      if (crossingDays > 0) {
        const maxHp = shipMaxHp(ship);
        const { hp } = evalShipHull(ship, event.dueAt.getTime());
        const toll = HULL_WEAR_FRACTION_PER_DAY * maxHp * crossingDays;
        const newHp = Math.max(Math.min(HULL_WEAR_FLOOR_HP, maxHp), hp - toll);
        await client.query(
          `UPDATE ships SET hull_hp = $2, hull_as_of = to_timestamp($3 / 1000.0)
           WHERE id = $1`,
          [shipId, newHp, event.dueAt.getTime()],
        );
        ship.hull_hp = newHp;
      }
    }
  }

  await client.query(
    `UPDATE ships
       SET x = dest_x, y = dest_y,
           status = CASE WHEN dest_body_id IS NULL THEN 'idle' ELSE 'hovering' END,
           hover_body_id = dest_body_id,
           origin_x = NULL, origin_y = NULL, dest_x = NULL, dest_y = NULL,
           departed_at = NULL, arrives_at = NULL, dest_body_id = NULL
     WHERE id = $1 AND status = 'transit' AND arrives_at <= $2`,
    [shipId, event.dueAt],
  );

  // Armement du drain de loitering (GB §7) : survol de SON monde ⇒ le
  // rebase planétaire décide (stock ou réservoir) ; survol étranger/
  // sauvage ou vide ⇒ le réservoir paie (0 pour probe/personal).
  const nowMs = event.dueAt.getTime();
  // Ligne COMPLÈTE : le rebase en cascade touche aussi la SURVIE — une
  // ligne partielle écraserait les provisions (régression corrigée, AE).
  const { rows: landedRows } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [shipId],
  );
  const landed = landedRows[0];
  if (!landed) return;
  if (landed.status === 'hovering' && landed.hover_body_id) {
    const { rows: over } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1`,
      [landed.hover_body_id],
    );
    if (over[0]?.owner_id === landed.owner_id) {
      await recomputePlanetRates(client, landed.hover_body_id, nowMs);
      return;
    }
  }
  if (landed.status === 'hovering' || landed.status === 'idle') {
    await rebaseShipDrain(client, landed, nowMs, 'tank');
    // Survol étranger : l'auto-trade s'arme (GB §7) — check immédiat si
    // un seuil est déjà franchi, sinon au whenReaches.
    const { rows: armed } = await client.query(
      `SELECT * FROM ships WHERE id = $1`,
      [shipId],
    );
    if (armed[0]) await scheduleAutoTradeCheck(client, armed[0], nowMs);
  }
};

/**
 * ship_fuel_out { shipId } — le réservoir d'une coque en loitering touche
 * zéro : échouage (GB §13). Idempotent et tolérant au rejeu : si un
 * ravitaillement a rebasé le réservoir entre-temps, l'événement est
 * périmé (no-op) — rebaseShipDrain purge d'ailleurs les bords obsolètes.
 */
export const shipFuelOut: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const nowMs = event.dueAt.getTime();
  const { rows } = await client.query(
    `SELECT id, hull_category, hull_size, status, fuel,
            fuel_rate_u_per_day, fuel_as_of
     FROM ships WHERE id = $1 AND status IN ('hovering', 'idle') FOR UPDATE`,
    [shipId],
  );
  const ship = rows[0];
  if (!ship) return;
  const { type, units } = evalShipFuel(ship, nowMs);
  if (units > 1e-9) return; // périmé : un refuel a replanifié le bord
  // W1 multi-fuel : le slot ACTIF est à sec mais un AUTRE type reste ?
  // → bascule (rebase re-choisit le slot actif et replanifie le bord).
  const slots = (ship.fuel ?? {}) as Record<string, number>;
  const hasOther = Object.entries(slots).some(
    ([t, u]) => t !== type && (u ?? 0) > 1e-9,
  );
  if (hasOther) {
    await client.query(
      `UPDATE ships SET fuel = $2 WHERE id = $1`,
      [shipId, JSON.stringify({ ...slots, [type]: 0 })],
    );
    const { rows: fresh } = await client.query(
      `SELECT * FROM ships WHERE id = $1`,
      [shipId],
    );
    if (fresh[0]) await rebaseShipDrain(client, fresh[0], nowMs, 'tank');
    return;
  }
  if (ship.hull_category === 'probe') {
    // Sondes v3 (2026-07-20) : à sec, la sonde est PERDUE — « gone »,
    // pas d'échouage récupérable (annoncé).
    await client.query(`DELETE FROM ships WHERE id = $1`, [shipId]);
    return;
  }
  await client.query(
    `UPDATE ships SET status = 'stranded', fuel = $2,
        fuel_rate_u_per_day = 0, fuel_as_of = to_timestamp($3 / 1000.0)
     WHERE id = $1`,
    [shipId, JSON.stringify({ [type]: 0 }), nowMs],
  );
};

/**
 * colony_established { shipId, bodyId, playerId } — fin des 72 h : le
 * monde devient la colonie (GB §19, DG §12.3). La coque est CONSOMMÉE :
 * depot L1 + spaceport L1 actifs (tuiles 0/1), settlers → population,
 * cargo + reliquat fuel déchargés (1 u = 1 T), équipage re-lié à la
 * planète comme gouverneur [TUNE interp], vaisseau supprimé, grâce 14 j
 * portée par colonized_at.
 */
export const colonyEstablished: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  const bodyId = String(event.payload.bodyId ?? '');
  if (!shipId || !bodyId) return;
  const nowMs = event.dueAt.getTime();

  const { rows: bodies } = await client.query(
    `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
    [bodyId],
  );
  const body = bodies[0];
  const { rows: ships } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND status = 'colonizing' FOR UPDATE`,
    [shipId],
  );
  const ship = ships[0];
  if (!body || !ship) return; // rejeu ou vaisseau disparu : idempotent

  if (body.owner_id) {
    // Course perdue (défensif — la réservation transactionnelle l'empêche
    // normalement) : la coque repasse en survol, rien n'est consommé.
    await client.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL WHERE id = $1`,
      [shipId, bodyId],
    );
    // Survol d'un monde d'autrui : le réservoir paie (GB §7).
    await rebaseShipDrain(
      client,
      { ...ship, status: 'hovering', hover_body_id: bodyId, docked_body_id: null },
      nowMs,
      'tank',
    );
    return;
  }

  // BD : la colonie naît de l'exact manifeste C/A/S livré. L'historique
  // de l'ancien souverain est remis à zéro ; la grâce repart maintenant.
  await client.query(
    `UPDATE bodies SET owner_id = $2, colonized_at = to_timestamp($3 / 1000.0),
       population = $4, pop_children = $5, pop_seniors = $6, illness = 0,
       unemp_over_days = 0, clock_deadlines = '{}'::jsonb,
       demo_counters = '{}'::jsonb, pop_as_of = to_timestamp($3 / 1000.0)
     WHERE id = $1`,
    [
      bodyId,
      ship.owner_id,
      nowMs,
      ship.settlers,
      ship.settlers_children,
      ship.settlers_seniors,
    ],
  );

  // Conversion de coque : depot + spaceport L1 actifs — « the ship is
  // spent » (DG §12.3) ; la spaceport_S du guide = spaceport L1 du
  // catalogue [TUNE interp].
  const converted: [string, number][] = [
    ['depot', 0],
    ['spaceport', 1],
  ];
  for (const [key, tile] of converted) {
    if (tile < body.tiles && BUILDINGS[key as keyof typeof BUILDINGS]) {
      await client.query(
        `INSERT INTO buildings (body_id, key, level, tile_index, status,
            workforce, config)
         VALUES ($1, $2, 1, $3, 'active', 0, $4::jsonb)
         ON CONFLICT DO NOTHING`,
        // Kit de colonisation « offert » (coque dépensée) : investedPaid = {}
        // → non remboursable à la démolition (PATCH 10-4).
        [bodyId, key, tile, JSON.stringify({ investedPaid: {} })],
      );
    }
  }

  // Déchargement intégral : provisions du kit (30 food + 30 water — payées
  // au fitting, [TUNE interp]) + cargo (T) + reliquat de carburant (1 u =
  // 1 T, réservoir ÉVALUÉ — le drain de survol a pu l'entamer avant le
  // colonize).
  const cargo: Record<string, number> = ship.cargo ?? {};
  const tank = evalShipFuel(ship, nowMs);
  const unload: Record<string, number> = { ...cargo };
  for (const [res, qty] of Object.entries(COLONY_SEED_STOCK)) {
    unload[res] = (unload[res] ?? 0) + (qty as number);
  }
  if (tank.units > 0) {
    unload[`fuel_${tank.type}`] = (unload[`fuel_${tank.type}`] ?? 0) + tank.units;
  }
  for (const [resource, tons] of Object.entries(unload)) {
    if (tons <= 0) continue;
    await client.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = planet_stock.amount_t + $3,
                     as_of = to_timestamp($4 / 1000.0)`,
      [bodyId, resource, tons, nowMs],
    );
  }

  // L'équipage partage le sort de la coque… en survivant mieux qu'elle.
  // [TUNE interp amendé, chunk W] : gouverneur de la colonie SEULEMENT si
  // grade gouverneur (rareté ≥ rare) — sinon un pilote common squatterait
  // À JAMAIS le siège unique d'un monde moyen (l'installation est
  // permanente, GB §11). Les autres redeviennent NON hébergés (roster).
  await client.query(
    `UPDATE npcs SET bound_host_type = 'planet', bound_host_id = $2
     WHERE bound_host_type = 'ship' AND bound_host_id = $1
       AND rarity IN ('rare', 'epic', 'legendary')`,
    [shipId, bodyId],
  );
  await client.query(
    `UPDATE npcs SET bound_host_type = NULL, bound_host_id = NULL
     WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [shipId],
  );
  await client.query(`DELETE FROM ships WHERE id = $1`, [shipId]);

  // Rebase : taux, bords de stockage, pop_daily de la nouvelle colonie.
  await recomputePlanetRates(client, bodyId, nowMs);
};

/**
 * ship_built { planetId, playerId, category, size, name } — fin de chantier
 * naval : le vaisseau naît À QUAI, réservoirs et soute vides (GB §14).
 * Exactement-une-fois par la transaction du processeur (handler + marquage
 * processed_at commitent ensemble).
 */
export const shipBuilt: EventHandler = async (client, event) => {
  const p = event.payload;
  const planetId = String(p.planetId ?? '');
  if (!planetId) return;
  const { rows: planet } = await client.query(
    `SELECT x, y, owner_id FROM bodies WHERE id = $1`,
    [planetId],
  );
  if (!planet[0]) return;
  // W2 : le moteur est FIGÉ au build — le payload le porte (chantier
  // outillé) ; les événements d'avant W2 retombent sur l'étoile NATALE
  // (défaut historique, DG §8.3). Le plein de naissance suit le MOTEUR.
  let fuelType = String(p.engine ?? '');
  if (!fuelType) {
    const { rows: star } = await client.query(
      `SELECT star_fuel_type FROM bodies
       WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
       ORDER BY (x - $1)^2 + (y - $2)^2 LIMIT 1`,
      [planet[0].x, planet[0].y],
    );
    fuelType = String(star[0]?.star_fuel_type ?? 'cold');
  }
  // Naissance à 25 % de plein (décision responsable 2026-07-20) — puisé
  // au stock du monde, PARTIEL si le stock est court (annoncé).
  const hull =
    HULLS[`${String(p.category)}_${String(p.size)}` as keyof typeof HULLS];
  const birthTarget = (hull?.tankU ?? 0) * BUILD_FUEL_FRACTION;
  let birthUnits = 0;
  if (birthTarget > 0) {
    const { rows: stockRows } = await client.query(
      `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
       WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
      [planetId, `fuel_${fuelType}`],
    );
    if (stockRows[0]) {
      const nowMs = event.dueAt.getTime();
      const available = evalLazyStock(stockRows[0], nowMs);
      birthUnits = Math.min(birthTarget, available);
      if (birthUnits > 0) {
        await client.query(
          `UPDATE planet_stock SET amount_t = $3,
              as_of = to_timestamp($4 / 1000.0)
           WHERE body_id = $1 AND resource = $2`,
          [planetId, `fuel_${fuelType}`, available - birthUnits, nowMs],
        );
      }
    }
  }
  await client.query(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
                        status, docked_body_id, docked_at, fuel, cargo,
                        engine_type)
     VALUES ($1, $2, $3, $4, $5, $6, 'docked', $7, now(), $8, '{}', $9)`,
    [
      // Le vaisseau appartient au PROPRIÉTAIRE ACTUEL du monde (une
      // conquête pendant le chantier capture la production — GB §9,
      // les chantiers sont le butin).
      planet[0].owner_id ?? String(p.playerId),
      String(p.category),
      String(p.size),
      String(p.name),
      planet[0].x,
      planet[0].y,
      planetId,
      JSON.stringify({ [fuelType]: birthUnits }),
      fuelType,
    ],
  );
};

/** Évalue paresseusement une ligne de stock (helper local naissance). */
function evalLazyStock(
  row: { amount_t: unknown; rate_t_per_day: unknown; as_of: Date | string },
  nowMs: number,
): number {
  return Math.max(
    0,
    Number(row.amount_t) +
      (Number(row.rate_t_per_day) * (nowMs - new Date(row.as_of).getTime())) /
        86_400_000,
  );
}

/**
 * dock_eviction { shipId, bodyId, landedAtMs } — fin de séjour au sol d'un
 * VISITEUR (docks, DG §8.6 anti-DoS) : renvoi au survol, le réservoir paie
 * (GB §7). Garde d'idempotence : n'évince que si le vaisseau est resté à
 * quai sur CE monde depuis CE même atterrissage (docked_at = landedAtMs) —
 * un départ/retour a replanifié SA propre éviction et périme celle-ci.
 * L'extranéité est re-vérifiée au tir : un monde devenu sien n'évince pas.
 */
export const dockEviction: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  const bodyId = String(event.payload.bodyId ?? '');
  const landedAtMs = Number(event.payload.landedAtMs ?? 0);
  if (!shipId || !bodyId || !landedAtMs) return;
  const { rows: ships } = await client.query(
    `SELECT * FROM ships
     WHERE id = $1 AND status = 'docked' AND docked_body_id = $2
       AND docked_at = to_timestamp($3 / 1000.0)
     FOR UPDATE`,
    [shipId, bodyId, landedAtMs],
  );
  const ship = ships[0];
  if (!ship) return; // reparti, revenu (nouvel horodatage) ou détruit
  const { rows: bodies } = await client.query(
    `SELECT owner_id FROM bodies WHERE id = $1`,
    [bodyId],
  );
  if (!bodies[0] || bodies[0].owner_id === ship.owner_id) return;
  await client.query(
    `UPDATE ships SET status = 'hovering', hover_body_id = $2,
       docked_body_id = NULL, docked_at = NULL
     WHERE id = $1`,
    [shipId, bodyId],
  );
  const nowMs = event.dueAt.getTime();
  await rebaseShipDrain(
    client,
    { ...ship, status: 'hovering', hover_body_id: bodyId, docked_body_id: null },
    nowMs,
    'tank',
  );
};

/**
 * census_run {} — census global de l'offre (GB §13, DG §11.5), FACTORY :
 * l'intervalle vient de la config (4×/jour [TUNE], divisé par TIME_SCALE),
 * injecté par le worker. Un census mesure l'état COURANT : nowMs =
 * Date.now(), PAS event.dueAt — après une panne du worker on ne
 * « rattrape » pas des snapshots du passé, on en prend UN immédiat puis
 * la cadence reprend. Exactement-une-fois structurel : INSERT du snapshot
 * et processed_at commitent dans la même transaction.
 */
export function censusRun(intervalMs: number): EventHandler {
  return async (client, event) => {
    const nowMs = Date.now();
    const { rows: stockRows } = await client.query(
      `SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock`,
    );
    const { rows: shipRows } = await client.query(`SELECT cargo FROM ships`);
    const { rows: bodyCount } = await client.query(
      `SELECT count(DISTINCT body_id)::int AS n FROM planet_stock`,
    );
    // Réserves AMM des marchés ACTIFS : « aggregation over planet stocks +
    // cargo + pools + escrow » (DG §11.5) — agrégées comme des paniers plats.
    const { rows: poolRows } = await client.query(
      `SELECT config FROM buildings WHERE key = 'market' AND status = 'active'`,
    );
    const poolBundles: Record<string, number>[] = [];
    for (const r of poolRows) {
      const slots = Array.isArray(r.config?.slots) ? r.config.slots : [];
      for (const slot of slots) {
        if (!isAmmSlot(slot)) continue;
        poolBundles.push({
          [slot.pool.x]: slot.pool.rx,
          [slot.pool.y]: slot.pool.ry,
        });
      }
    }
    const totals = aggregateCensus(
      stockRows.map((r) => ({
        resource: r.resource,
        amountT: Number(r.amount_t),
        ratePerDayT: Number(r.rate_t_per_day),
        asOfMs: new Date(r.as_of).getTime(),
      })),
      shipRows.map((r) => r.cargo ?? {}),
      nowMs,
      poolBundles,
    );
    await client.query(
      `INSERT INTO census_snapshots (taken_at, totals, meta)
       VALUES (to_timestamp($1 / 1000.0), $2, $3)`,
      [
        nowMs,
        JSON.stringify(totals),
        JSON.stringify({
          sources: ['planet_stock', 'ship_cargo', 'amm_pools'],
          bodyCount: bodyCount[0].n,
          shipCount: shipRows.length,
        }),
      ],
    );
    // Dédoublonnage + replanification (patron pop_daily).
    await client.query(
      `DELETE FROM events WHERE processed_at IS NULL AND kind = 'census_run'
         AND id <> $1`,
      [event.id],
    );
    await client.query(
      `INSERT INTO events (due_at, kind, payload)
       VALUES (to_timestamp($1 / 1000.0), 'census_run', '{}')`,
      [nowMs + intervalMs],
    );
  };
}

/**
 * survival_out { shipId } — l'horloge de survie expire (GB §6) : l'équipage
 * MEURT avec son hôte (host-fate canon), la coque devient DERELICT et la
 * propriété est DÉPOUILLÉE (owner_id NULL — épave salvageable ; les claims
 * arrivent avec les items P4). Idempotent : garde sur l'état réel.
 */
export const survivalOut: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const { rows: ships } = await client.query(
    `SELECT * FROM ships WHERE id = $1
       AND status NOT IN ('derelict', 'docked', 'warehoused', 'colonizing')
     FOR UPDATE`,
    [shipId],
  );
  const ship = ships[0];
  if (!ship) return;
  const nowMs = event.dueAt.getTime();
  const sv = evalShipSurvival(ship, nowMs);
  if (Math.min(sv.food, sv.water) > 1e-9) return; // rebasé entre-temps
  // Host-fate : l'équipage meurt avec la coque.
  await client.query(
    `DELETE FROM npcs WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [shipId],
  );
  await client.query(
    `UPDATE ships SET status = 'derelict', owner_id = NULL,
        fuel_rate_u_per_day = 0, survival_rate_t_per_day = 0,
        survival_as_of = to_timestamp($2 / 1000.0),
        hover_body_id = hover_body_id, docked_body_id = NULL
     WHERE id = $1`,
    [shipId, nowMs],
  );
  await client.query(
    `DELETE FROM events WHERE processed_at IS NULL
       AND kind IN ('survival_low', 'ship_fuel_out')
       AND payload->>'shipId' = $1`,
    [shipId],
  );
};

/**
 * survival_low { shipId } — alarme des 25 % (DG §3.5, anti-extorsion) :
 * si la politique auto-flee-home est ARMÉE et la coque libre de voler
 * (hovering/idle, du carburant, un monde possédé), elle prend la route du
 * monde possédé le plus proche À PORTÉE du réservoir. FACTORY : timeScale
 * du worker (les durées de vol sont des événements).
 */
export function survivalLow(timeScale: number): EventHandler {
  return async (client, event) => {
    const shipId = String(event.payload.shipId ?? '');
    if (!shipId) return;
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 AND flee_armed
         AND status IN ('hovering', 'idle') FOR UPDATE`,
      [shipId],
    );
    const ship = ships[0];
    if (!ship) return;
    const nowMs = event.dueAt.getTime();
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as keyof typeof HULLS];
    if (!hull || hull.speedPcPerDay <= 0) return;
    const stats = { speed: hull.speedPcPerDay, burnPerPc: hull.burnUPerPc };
    const tank = evalShipFuel(ship, nowMs);
    const range = stats.burnPerPc > 0 ? tank.units / stats.burnPerPc : Infinity;
    const { rows: homes } = await client.query(
      `SELECT id, x, y FROM bodies
       WHERE owner_id = $1 AND body_type = 'planet'
       ORDER BY (x - $2)^2 + (y - $3)^2 LIMIT 1`,
      [ship.owner_id, ship.x, ship.y],
    );
    const home = homes[0];
    if (!home) return;
    const distance = Math.hypot(home.x - ship.x, home.y - ship.y);
    if (distance < 0.5 || distance > range + 1e-9) return; // hors de portée : l'horloge court
    const needed = distance * stats.burnPerPc;
    const travelDays = distance / stats.speed;
    const arrivesAt = new Date(nowMs + (travelDays * 86_400_000) / timeScale);
    await client.query(
      `UPDATE ships SET status = 'transit', docked_body_id = NULL,
          hover_body_id = NULL, docked_at = NULL,
          origin_x = $2, origin_y = $3, dest_x = $4, dest_y = $5,
          dest_body_id = $6, departed_at = to_timestamp($7 / 1000.0),
          arrives_at = $8,
          fuel = $9, fuel_rate_u_per_day = 0,
          fuel_as_of = to_timestamp($7 / 1000.0)
       WHERE id = $1`,
      [
        shipId,
        ship.x,
        ship.y,
        home.x,
        home.y,
        home.id,
        nowMs,
        arrivesAt,
        JSON.stringify({ [tank.type]: tank.units - needed }),
      ],
    );
    await enqueue(client, 'ship_arrival', arrivesAt, { shipId });
    // La survie continue de courir en transit : rebase sur le nouvel état.
    await rebaseShipSurvival(client, { ...ship, status: 'transit' }, nowMs);
  };
}

/**
 * ship_retrieved { shipId } — fin du redéploiement warehouse→espace
 * (DG §6) : la coque repasse À QUAI. Le dock libre a été vérifié au
 * LANCEMENT ; un dock repris entre-temps tolère l'overfill [annoncé,
 * même esprit que ship_built]. Idempotent (garde d'état).
 */
export const shipRetrieved: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const { rows } = await client.query(
    `UPDATE ships SET status = 'docked', docked_at = to_timestamp($2 / 1000.0)
     WHERE id = $1 AND status = 'warehoused'
     RETURNING id`,
    [shipId, event.dueAt.getTime()],
  );
  if (!rows[0]) return;
  // Drains & usure cohérents au re-quai (un monde chaud use dès le sol).
  const { rows: full } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [shipId],
  );
  if (full[0]) {
    await rebaseShipDrain(client, full[0], event.dueAt.getTime(), 'none');
  }
};

/**
 * harvest_full { shipId } — le réservoir touche sa capacité : la récolte
 * S'ARRÊTE (annoncé — le gréement n'a nulle part où pomper), la coque
 * repasse au drain idle et l'étoile récupère ce rendement. Idempotent :
 * un arrêt/départ entre-temps a déjà détaché la coque (no-op).
 */
export const harvestFull: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const { rows } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND harvesting_star_id IS NOT NULL
     FOR UPDATE`,
    [shipId],
  );
  if (!rows[0]) return;
  await releaseHarvest(client, rows[0], event.dueAt.getTime());
};

/**
 * star_supernova { bodyId } — le stock caché touche zéro : Starfall
 * (GB §22). Annihilation dans R_nova : coques (équipages host-fate,
 * épaves supprimées — le junk arrive avec le chunk salvage, annoncé),
 * mondes (annihilated : possession/population/bâtiments/stocks effacés,
 * le corps reste visible comme cendre). Classe L → trou noir ; S/M → plus
 * rien. Les starters sont HORS rayon par génération (canon garanti).
 * Idempotence : ne tire que si le stock évalué est bien ≤ 0.
 */
export const starSupernova: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  if (!bodyId) return;
  const nowMs = event.dueAt.getTime();
  const { rows: stars } = await client.query(
    `SELECT * FROM bodies WHERE id = $1 AND body_type = 'star' FOR UPDATE`,
    [bodyId],
  );
  const star = stars[0];
  if (!star) return;
  const remaining = evalStarFuel(star, nowMs);
  if (remaining > 1e-9) {
    // Pas encore à sec (course replanifiée, ou résidu d'arrondi du due_at
    // — un bord à quelques ms près laisse ~1e-8 u) : REPLANIFIER, jamais
    // périmer en silence — une supernova n'est pas annulable par un
    // arrondi. Taux nul (récolte arrêtée entre-temps) ⇒ plus de bord.
    const rate = Number(star.star_fuel_rate_u_per_day ?? 0);
    if (rate < 0) {
      const at = whenReaches(
        { amount: remaining, ratePerDay: rate, asOfMs: nowMs },
        0,
      );
      if (at !== null) {
        await enqueue(client, 'star_supernova', new Date(Math.ceil(at) + 2), {
          bodyId,
        });
      }
    }
    return;
  }
  const rNova = Number(star.r_nova ?? 0);

  // 1. Coques dans le rayon — position INTERPOLÉE pour les transits.
  const { rows: ships } = await client.query(
    `SELECT * FROM ships
     WHERE status <> 'warehoused'
       AND (sqrt(power(x - $1, 2) + power(y - $2, 2)) < $3
        OR (status = 'transit' AND (
          sqrt(power(origin_x - $1, 2) + power(origin_y - $2, 2)) < $3 OR
          sqrt(power(dest_x - $1, 2) + power(dest_y - $2, 2)) < $3)))
     FOR UPDATE`,
    [star.x, star.y, rNova],
  );
  for (const ship of ships) {
    const pos = shipPosition(ship, nowMs);
    if (Math.hypot(pos.x - star.x, pos.y - star.y) >= rNova - 1e-9) continue;
    if (ship.status === 'warehoused') continue; // à l'abri sous terre [interp]
    await client.query(
      `DELETE FROM npcs WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
      [ship.id],
    );
    await client.query(
      `DELETE FROM events WHERE processed_at IS NULL
         AND payload->>'shipId' = $1`,
      [ship.id],
    );
    await client.query(`DELETE FROM ships WHERE id = $1`, [ship.id]);
    // « Destroyed ships become space junk » (GB §22) : carcasse [TUNE-v1]
    // + fret répandu, fusionnés dans la cellule de la position réelle.
    const cargoT = Object.values(
      (ship.cargo ?? {}) as Record<string, number>,
    ).reduce((t, v) => t + Number(v ?? 0), 0);
    await depositJunkAt(
      client,
      pos.x,
      pos.y,
      (JUNK_CARCASS_T[ship.hull_size as string] ?? 10) + cargoT,
      nowMs,
      ship.owner_id ?? null,
    );
  }

  // 2. Mondes dans le rayon : annihilés (cendre — jamais recolonisable).
  const { rows: worlds } = await client.query(
    `SELECT id FROM bodies
     WHERE body_type = 'planet'
       AND sqrt(power(x - $1, 2) + power(y - $2, 2)) < $3 - 1e-9
     FOR UPDATE`,
    [star.x, star.y, rNova],
  );
  for (const w of worlds) {
    await client.query(`DELETE FROM buildings WHERE body_id = $1`, [w.id]);
    await client.query(`DELETE FROM planet_stock WHERE body_id = $1`, [w.id]);
    await client.query(`DELETE FROM deposits WHERE body_id = $1`, [w.id]);
    await client.query(
      `DELETE FROM npcs WHERE bound_host_type = 'planet' AND bound_host_id = $1`,
      [w.id],
    );
    await client.query(
      `DELETE FROM events WHERE processed_at IS NULL AND payload->>'bodyId' = $1`,
      [w.id],
    );
    await client.query(
      `UPDATE bodies
          SET owner_id = NULL,
              is_starter = false,
              account_bound_until = NULL,
              colonized_at = NULL,
              population = 0,
              pop_children = 0,
              pop_seniors = 0,
              illness = 0,
              unemp_over_days = 0,
              clock_deadlines = '{}'::jsonb,
              pop_as_of = to_timestamp($2 / 1000.0),
              tiles = 0,
              config = (coalesce(config, '{}'::jsonb) - 'innateOffers')
                       || '{"annihilated": true}'::jsonb
        WHERE id = $1`,
      [w.id, nowMs],
    );
  }

  // Les gates meurent avec l'un ou l'autre endpoint (canon GB §6) — les
  // mondes ANNIHILÉS restent en base (cendre) : purge explicite.
  if (worlds.length > 0) {
    const wiped = worlds.map((w) => w.id);
    const { rows: deadGates } = await client.query(
      `DELETE FROM stargates
       WHERE a_body_id = ANY($1) OR b_body_id = ANY($1)
       RETURNING id`,
      [wiped],
    );
    for (const g of deadGates) {
      await client.query(
        `DELETE FROM events WHERE processed_at IS NULL
           AND kind = 'stargate_built' AND payload->>'gateId' = $1`,
        [g.id],
      );
    }
  }

  // 3. L'étoile elle-même : L → trou noir ; S/M → plus rien (canon).
  await client.query(
    `UPDATE ships SET harvesting_star_id = NULL WHERE harvesting_star_id = $1`,
    [bodyId],
  );
  if (star.star_class === 'l') {
    await client.query(
      `UPDATE bodies SET body_type = 'black_hole', star_fuel_stock = 0,
          star_fuel_rate_u_per_day = 0
       WHERE id = $1`,
      [bodyId],
    );
  } else {
    await client.query(`DELETE FROM bodies WHERE id = $1`, [bodyId]);
  }
};

/**
 * hull_repaired { shipId } — la coque atteint ses HP max : l'atelier
 * cesse de facturer l'acier. Rebase pessimiste de la coque (plein ⇒
 * taux 0) puis recompute du monde (le besoin d'acier tombe). Idempotent.
 */
export const hullRepaired: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const { rows } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND status = 'docked' FOR UPDATE`,
    [shipId],
  );
  const ship = rows[0];
  if (!ship) return;
  const nowMs = event.dueAt.getTime();
  await rebaseShipDrain(client, ship, nowMs, 'none');
  if (ship.docked_body_id) {
    await recomputePlanetRates(client, ship.docked_body_id, nowMs);
  }
};

/**
 * salvage_claimed { shipId, targetId } — échéance des 2 h de proximité
 * (GB §6) : RE-VÉRIFIE tout — réclamant vivant, stationnaire, toujours
 * lié à CETTE cible, à portée ; cible toujours épave sans propriétaire —
 * puis transfère : l'épave devient une coque IDLE possédée (sans
 * équipage — la re-crewer exige un quai, annoncé). Idempotent.
 */
export const salvageClaimed: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  const targetId = String(event.payload.targetId ?? '');
  if (!shipId || !targetId) return;
  const { rows: claimers } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND claiming_target_id = $2
       AND status IN ('hovering', 'idle') FOR UPDATE`,
    [shipId, targetId],
  );
  const claimer = claimers[0];
  if (!claimer) return; // parti, détourné ou détruit : réclamation morte
  const { rows: targets } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND owner_id IS NULL
       AND status = 'derelict' FOR UPDATE`,
    [targetId],
  );
  const target = targets[0];
  await client.query(
    `UPDATE ships SET claiming_target_id = NULL WHERE id = $1`,
    [shipId],
  );
  if (!target) return; // réclamée par un autre entre-temps
  if (
    Math.hypot(claimer.x - target.x, claimer.y - target.y) > CLAIM_RADIUS_PC
  ) {
    return; // dérivé hors de portée : la proximité n'a pas tenu
  }
  const nowMs = event.dueAt.getTime();
  await client.query(
    `UPDATE ships SET owner_id = $2, status = 'idle' WHERE id = $1`,
    [targetId, claimer.owner_id],
  );
  // Coque récupérée : drains cohérents (réservoir/survie/usure à l'idle).
  const { rows: full } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [targetId],
  );
  if (full[0]) {
    await rebaseShipDrain(client, full[0], nowMs, 'tank');
  }
};

/** stargate_built { gateId } — fin du chantier : le gate s'active. */
export const stargateBuilt: EventHandler = async (client, event) => {
  const gateId = String(event.payload.gateId ?? '');
  if (!gateId) return;
  await client.query(
    `UPDATE stargates SET status = 'active', completes_at = NULL
     WHERE id = $1 AND status = 'building' AND completes_at <= $2`,
    [gateId, event.dueAt],
  );
};

/**
 * auto_trade_check { shipId } — un réservoir d'une coque en survol
 * ÉTRANGER franchit un seuil d'auto-trade (GB §7) : exécuter les achats
 * best-effort puis REPLANIFIER (le drain continue). Idempotent — la
 * coque partie/posée/échouée ne fait rien.
 */
export const autoTradeCheck: EventHandler = async (client, event) => {
  const shipId = String(event.payload.shipId ?? '');
  if (!shipId) return;
  const { rows } = await client.query(
    `SELECT * FROM ships WHERE id = $1 AND status = 'hovering' FOR UPDATE`,
    [shipId],
  );
  const ship = rows[0];
  if (!ship) return;
  const nowMs = event.dueAt.getTime();
  await runAutoTrade(client, ship, nowMs);
  const { rows: fresh } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [shipId],
  );
  if (fresh[0]) await scheduleAutoTradeCheck(client, fresh[0], nowMs);
};

export function baseHandlers(): Record<string, EventHandler> {
  return {
    construction_complete: constructionComplete,
    demolition_complete: demolitionComplete,
    stock_edge: stockEdge,
    pop_clock: popClock,
    deposit_dry: depositDry,
    pop_daily: popDaily,
    ship_arrival: shipArrival,
    ship_built: shipBuilt,
    ship_fuel_out: shipFuelOut,
    colony_established: colonyEstablished,
    dock_eviction: dockEviction,
    retool_complete: retoolComplete,
    fuel_transfer_complete: fuelTransferComplete,
    shield_morph_complete: shieldMorphComplete,
    item_fabricated: itemFabricated,
    item_installed: itemInstalled,
    work_step: workStep,
    ship_retrieved: shipRetrieved,
    survival_out: survivalOut,
    // survival_low exige timeScale : injecté par le worker (survivalLow) ;
    // par défaut (tests d'intégration sans flee) un timeScale de 1.
    survival_low: survivalLow(1),
    harvest_full: harvestFull,
    star_supernova: starSupernova,
    hull_repaired: hullRepaired,
    salvage_claimed: salvageClaimed,
    stargate_built: stargateBuilt,
    auto_trade_check: autoTradeCheck,
    noop: async (_client: pg.PoolClient) => undefined,
  };
}
