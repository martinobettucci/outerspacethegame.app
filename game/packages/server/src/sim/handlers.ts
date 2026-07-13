/**
 * Handlers d'événements de simulation. Chaque handler est idempotent
 * (at-least-once) et ne manipule que l'état passé par sa transaction.
 */
import {
  BUILDINGS,
  COLONY_SEED_STOCK,
  habitability,
  illnessDelta,
  popCap,
  populationDelta,
  settlerLosses,
  settlerTripRisk,
} from '@atg/shared';
import type pg from 'pg';
import type { EventHandler } from './events.js';
import { recomputePlanetRates } from './rebase.js';
import { evalShipFuel, rebaseShipDrain } from './shipDrain.js';

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
  const { rows: landedRows } = await client.query(
    `SELECT id, owner_id, hull_category, hull_size, status, hover_body_id,
            fuel, fuel_rate_u_per_day, fuel_as_of
     FROM ships WHERE id = $1`,
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
    await rebaseShipDrain(client, { ...ship, status: 'hovering' }, nowMs, 'tank');
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

  // L'équipage partage le sort de la coque… en survivant mieux qu'elle :
  // re-liaison comme gouverneur de la colonie (GB §12, [TUNE interp]).
  await client.query(
    `UPDATE npcs SET bound_host_type = 'planet', bound_host_id = $2
     WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
    [shipId, bodyId],
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
                        status, docked_body_id, fuel, cargo)
     VALUES ($1, $2, $3, $4, $5, $6, 'docked', $7, $8, '{}')`,
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
    noop: async (_client: pg.PoolClient) => undefined,
  };
}
