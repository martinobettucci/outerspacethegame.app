/**
 * Handlers d'événements de simulation. Chaque handler est idempotent
 * (at-least-once) et ne manipule que l'état passé par sa transaction.
 */
import {
  BUILDINGS,
  COLONY_SEED_STOCK,
  habitability,
  HULLS,
  illnessDelta,
  isAmmSlot,
  JUNK_CARCASS_T,
  popCap,
  populationDelta,
  settlerLosses,
  settlerTripRisk,
} from '@atg/shared';
import type pg from 'pg';
import { aggregateCensus } from './census.js';
import { enqueue, type EventHandler } from './events.js';
import { whenReaches } from './lazy.js';
import { recomputePlanetRates } from './rebase.js';
import { evalStarFuel, releaseHarvest } from '../services/harvest.js';
import { depositJunkAt } from '../services/junk.js';
import { shipPosition } from '../services/ships.js';
import { evalShipFuel, evalShipSurvival, rebaseShipDrain, rebaseShipSurvival } from './shipDrain.js';

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
     WHERE id = $1 AND status = 'constructing' AND completes_at <= now()
     RETURNING body_id`,
    [buildingId],
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
     WHERE id = $1 AND status = 'retooling' AND completes_at <= now()
     RETURNING body_id`,
    [buildingId],
  );
  if (rows[0]) {
    await recomputePlanetRates(client, rows[0].body_id, event.dueAt.getTime());
  }
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
  await recomputePlanetRates(client, bodyId, event.dueAt.getTime());
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

/**
 * pop_daily { bodyId } — matérialisation quotidienne de la population
 * (DG §3.2) : H depuis les saturations du jour, maladie, ΔP ; puis rebase
 * (la consommation de survie suit la nouvelle population) et replanifie.
 */
export const popDaily: EventHandler = async (client, event) => {
  const bodyId = String(event.payload.bodyId ?? '');
  if (!bodyId) return;
  const nowMs = event.dueAt.getTime();
  const snap = await recomputePlanetRates(client, bodyId, nowMs);
  if (!snap || !snap.ownerId) return;

  const sat = (served: number, need: number) => (need > 1e-9 ? served / need : 1);
  const foodSat = sat(snap.rates.popConsumption.food, snap.rates.popNeeds.food);
  const waterSat = sat(snap.rates.popConsumption.water, snap.rates.popNeeds.water);
  const medSat = sat(
    snap.rates.popConsumption.medicine,
    snap.rates.popNeeds.medicine,
  );
  const h = habitability(foodSat, waterSat, medSat);
  const cap = popCap(snap.size, snap.quality);
  const u = snap.population / cap;
  const newIllness = Math.min(
    1,
    Math.max(0, snap.illness + illnessDelta(u, snap.illness, medSat < 1)),
  );
  const delta = populationDelta(snap.population, cap, h, newIllness);
  const newPop = Math.max(0, Math.round(snap.population + delta));

  await client.query(
    `UPDATE bodies SET population = $2, illness = $3,
            pop_as_of = to_timestamp($4 / 1000.0)
     WHERE id = $1`,
    [bodyId, newPop, newIllness, nowMs],
  );
  // La population a changé ⇒ E_planet et la consommation aussi : rebase.
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
       AND arrives_at <= now() FOR UPDATE`,
    [shipId],
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
        await client.query(`UPDATE ships SET settlers = settlers - $2 WHERE id = $1`, [
          shipId,
          deaths,
        ]);
      }
      await client.query(
        `UPDATE settler_routes SET loss_carry = $3, updated_at = now()
         WHERE origin_body_id = $1 AND dest_body_id = $2`,
        [ship.settlers_origin_body_id, ship.dest_body_id, carryOut],
      );
    }
  }

  await client.query(
    `UPDATE ships
       SET x = dest_x, y = dest_y,
           status = CASE WHEN dest_body_id IS NULL THEN 'idle' ELSE 'hovering' END,
           hover_body_id = dest_body_id,
           origin_x = NULL, origin_y = NULL, dest_x = NULL, dest_y = NULL,
           departed_at = NULL, arrives_at = NULL, dest_body_id = NULL
     WHERE id = $1 AND status = 'transit' AND arrives_at <= now()`,
    [shipId],
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

  await client.query(
    `UPDATE bodies SET owner_id = $2, colonized_at = to_timestamp($3 / 1000.0),
       population = $4, illness = 0, pop_as_of = to_timestamp($3 / 1000.0)
     WHERE id = $1`,
    [bodyId, ship.owner_id, nowMs, ship.settlers],
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
        `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
         VALUES ($1, $2, 1, $3, 'active', 0)
         ON CONFLICT DO NOTHING`,
        [bodyId, key, tile],
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
  // Le moteur est accordé au carburant de l'étoile NATALE (esprit GB §14 /
  // DG §8.3) : réservoir vide mais TYPÉ, sinon l'auto-chargement au départ
  // ne saurait pas quoi pomper.
  const { rows: star } = await client.query(
    `SELECT star_fuel_type FROM bodies
     WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
     ORDER BY (x - $1)^2 + (y - $2)^2 LIMIT 1`,
    [planet[0].x, planet[0].y],
  );
  const fuelType = star[0]?.star_fuel_type ?? 'cold';
  await client.query(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
                        status, docked_body_id, docked_at, fuel, cargo)
     VALUES ($1, $2, $3, $4, $5, $6, 'docked', $7, now(), $8, '{}')`,
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
      JSON.stringify({ [fuelType]: 0 }),
    ],
  );
};

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
      `UPDATE bodies SET owner_id = NULL, population = 0, tiles = 0,
          is_starter = false,
          config = coalesce(config, '{}'::jsonb) || '{"annihilated": true}'::jsonb
       WHERE id = $1`,
      [w.id],
    );
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

export function baseHandlers(): Record<string, EventHandler> {
  return {
    construction_complete: constructionComplete,
    demolition_complete: demolitionComplete,
    stock_edge: stockEdge,
    deposit_dry: depositDry,
    pop_daily: popDaily,
    ship_arrival: shipArrival,
    ship_built: shipBuilt,
    ship_fuel_out: shipFuelOut,
    colony_established: colonyEstablished,
    dock_eviction: dockEviction,
    retool_complete: retoolComplete,
    ship_retrieved: shipRetrieved,
    survival_out: survivalOut,
    // survival_low exige timeScale : injecté par le worker (survivalLow) ;
    // par défaut (tests d'intégration sans flee) un timeScale de 1.
    survival_low: survivalLow(1),
    harvest_full: harvestFull,
    star_supernova: starSupernova,
    hull_repaired: hullRepaired,
    noop: async (_client: pg.PoolClient) => undefined,
  };
}
