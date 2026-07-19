/**
 * Canal manuel (GB §9 « Markets & manual trade », DG §6 round 7).
 *
 * Toutes les règles d'accès sont appliquées ICI (CLAUDE.md §10) :
 * - browse : réservé au propriétaire OU à un acheteur dont un vaisseau est
 *   À QUAI (commerce dock — le survol ne suffit PAS, contrairement à
 *   l'hospitalité innée) sur un monde ayant ≥ 1 warehouse ACTIF PUBLIC ;
 * - offres : mêmes préconditions + limites round 7 (1 ouverte par
 *   (acheteur, monde, ressource), 20 créations/24 h, TTL 48 h réelles
 *   [TUNE]) — l'offre épingle le vaisseau à quai ;
 * - résolution : propriétaire du monde uniquement (accepter/décliner) ;
 *   l'acceptation règle PHYSIQUEMENT (stock planète ↔ soute du vaisseau
 *   épinglé, encore à quai) ; l'acheteur peut retirer son offre ouverte.
 *
 * v1 annoncé (JOURNAL) : l'« item » = ressource fongible du pool planétaire
 * (les inventaires PAR entrepôt, véhicules et objets arrivent avec leurs
 * systèmes — enchères P4) ; alliés en orbite (share grant) = factions P4 ;
 * la contre-offre = décliner puis nouvelle offre.
 */
import {
  ALL_RESOURCE_IDS,
  canOpenOffer,
  containersUsed,
  HULLS,
  offerExpiresAtMs,
  validateManualOffer,
  type HullCategory,
  type HullSize,
  type ManualOfferBundle,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { evalLazy } from '../sim/lazy.js';
import { loadProductionSnapshot, recomputePlanetRates } from '../sim/rebase.js';
import { CommandError } from './planets.js';

const toMs = (d: Date | string) => new Date(d).getTime();
const isResource = (r: string) =>
  (ALL_RESOURCE_IDS as readonly string[]).includes(r);

export interface ManualOfferView {
  id: string;
  bodyId: string;
  bodyName?: string;
  buyerId: string;
  buyerName?: string;
  shipId: string;
  getResource: string;
  getTons: number;
  giveResource: string;
  giveTons: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

function offerView(row: Record<string, unknown>): ManualOfferView {
  return {
    id: String(row.id),
    bodyId: String(row.body_id),
    bodyName: row.body_name ? String(row.body_name) : undefined,
    buyerId: String(row.buyer_id),
    buyerName: row.buyer_name ? String(row.buyer_name) : undefined,
    shipId: String(row.ship_id),
    getResource: String(row.get_resource),
    getTons: Number(row.get_t),
    giveResource: String(row.give_resource),
    giveTons: Number(row.give_t),
    status: String(row.status),
    createdAt: new Date(row.created_at as string).toISOString(),
    expiresAt: new Date(row.expires_at as string).toISOString(),
  };
}

/** Balayage paresseux des offres échues (aucun effet de bord au-delà du
 * statut — pas d'événement nécessaire). */
async function sweepExpired(
  client: pg.Pool | pg.PoolClient,
  nowMs: number,
): Promise<void> {
  await client.query(
    `UPDATE manual_offers SET status = 'expired', resolved_at = now()
     WHERE status = 'open' AND expires_at <= to_timestamp($1 / 1000.0)`,
    [nowMs],
  );
}

/** Le monde a-t-il un warehouse ACTIF PUBLIC ? */
async function hasPublicWarehouse(
  client: pg.Pool | pg.PoolClient,
  bodyId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM buildings
     WHERE body_id = $1 AND key = 'warehouse' AND status = 'active'
       AND config->>'visibility' = 'public'
     LIMIT 1`,
    [bodyId],
  );
  return rows.length > 0;
}

/** Vaisseau du joueur À QUAI sur ce monde (le browse exige le dock). */
async function dockedShipOf(
  client: pg.Pool | pg.PoolClient,
  playerId: string,
  bodyId: string,
): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT id FROM ships
     WHERE owner_id = $1 AND status = 'docked' AND docked_body_id = $2
     ORDER BY created_at, id LIMIT 1`,
    [playerId, bodyId],
  );
  return rows[0] ? String(rows[0].id) : null;
}

/**
 * Browse du stock browsable d'un monde : montants SEULS (les taux sont de
 * l'intel opérationnel — jamais publiés ici). Propriétaire : toujours ;
 * visiteur : à quai ET ≥ 1 warehouse public actif.
 */
export async function browseWarehouse(
  pool: pg.Pool,
  viewerId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<{ public: boolean; stock: { resource: string; amountT: number }[] }> {
  const { rows: bodies } = await pool.query(
    `SELECT id, owner_id FROM bodies WHERE id = $1 AND body_type = 'planet'`,
    [bodyId],
  );
  if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
  if (!bodies[0].owner_id) {
    throw new CommandError('not_available', 'Monde sauvage : aucun entrepôt');
  }
  const owner = bodies[0].owner_id === viewerId;
  if (!owner) {
    const docked = await dockedShipOf(pool, viewerId, bodyId);
    if (!docked) {
      throw new CommandError(
        'forbidden',
        'Le browse se fait à quai (commerce dock)',
      );
    }
  }
  const isPublic = await hasPublicWarehouse(pool, bodyId);
  if (!owner && !isPublic) {
    throw new CommandError(
      'not_available',
      'Aucun warehouse public ici : réserves privées',
    );
  }
  const { rows: stockRows } = await pool.query(
    `SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock
     WHERE body_id = $1`,
    [bodyId],
  );
  const stock = stockRows
    .map((r) => ({
      resource: String(r.resource),
      amountT:
        Math.floor(
          evalLazy(
            {
              amount: Number(r.amount_t),
              ratePerDay: Number(r.rate_t_per_day),
              asOfMs: toMs(r.as_of),
            },
            nowMs,
            { min: 0 },
          ) * 10,
        ) / 10,
    }))
    .filter((s) => s.amountT > 0)
    .sort((a, b) => a.resource.localeCompare(b.resource));
  return { public: isPublic, stock };
}

/**
 * Créer une offre manuelle : acheteur à quai, warehouse public, bundle
 * valide, limites round 7. L'offre épingle le vaisseau à quai.
 */
export async function createManualOffer(
  pool: pg.Pool,
  buyerId: string,
  bodyId: string,
  bundle: ManualOfferBundle,
  nowMs = Date.now(),
): Promise<ManualOfferView> {
  const invalid = validateManualOffer(bundle, isResource);
  if (invalid) throw new CommandError('not_available', invalid);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id FROM bodies
       WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [bodyId],
    );
    if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
    if (!bodies[0].owner_id) {
      throw new CommandError('not_available', 'Monde sauvage : aucun entrepôt');
    }
    if (bodies[0].owner_id === buyerId) {
      throw new CommandError(
        'not_available',
        'Ce monde est à vous : servez-vous dans le stock',
      );
    }
    const shipId = await dockedShipOf(client, buyerId, bodyId);
    if (!shipId) {
      throw new CommandError(
        'forbidden',
        'Une offre manuelle s\'envoie à quai (commerce dock)',
      );
    }
    if (!(await hasPublicWarehouse(client, bodyId))) {
      throw new CommandError(
        'not_available',
        'Aucun warehouse public ici : réserves privées',
      );
    }
    await sweepExpired(client, nowMs);
    // Limites round 7 : la fenêtre 24 h compte les CRÉATIONS (tous mondes).
    const { rows: counts } = await client.query(
      `SELECT
         count(*) FILTER (WHERE status = 'open' AND body_id = $2
                            AND get_resource = $3)::int AS open_for_item,
         count(*) FILTER (WHERE created_at > to_timestamp($4 / 1000.0)
                            - interval '24 hours')::int AS created_24h
       FROM manual_offers WHERE buyer_id = $1`,
      [buyerId, bodyId, bundle.getResource, nowMs],
    );
    const refused = canOpenOffer({
      openForItem: counts[0].open_for_item,
      createdLast24h: counts[0].created_24h,
    });
    if (refused) throw new CommandError('not_available', refused);
    const { rows: created } = await client.query(
      `INSERT INTO manual_offers
         (body_id, buyer_id, ship_id, get_resource, get_t, give_resource,
          give_t, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               to_timestamp($8 / 1000.0), to_timestamp($9 / 1000.0))
       RETURNING *`,
      [
        bodyId,
        buyerId,
        shipId,
        bundle.getResource,
        bundle.getTons,
        bundle.giveResource,
        bundle.giveTons,
        nowMs,
        offerExpiresAtMs(nowMs),
      ],
    );
    await client.query('COMMIT');
    return offerView(created[0]!);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Boîte de réception du VENDEUR : offres ouvertes d'un monde possédé. */
export async function listPlanetOffers(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<ManualOfferView[]> {
  const { rows: bodies } = await pool.query(
    `SELECT owner_id FROM bodies WHERE id = $1 AND body_type = 'planet'`,
    [bodyId],
  );
  if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
  if (bodies[0].owner_id !== playerId) {
    throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
  }
  await sweepExpired(pool, nowMs);
  const { rows } = await pool.query(
    `SELECT o.*, p.display_name AS buyer_name FROM manual_offers o
     JOIN players p ON p.id = o.buyer_id
     WHERE o.body_id = $1 AND o.status = 'open'
     ORDER BY o.created_at`,
    [bodyId],
  );
  return rows.map(offerView);
}

/** Les offres de l'ACHETEUR (tous statuts, récentes d'abord). */
export async function listMyOffers(
  pool: pg.Pool,
  buyerId: string,
  nowMs = Date.now(),
): Promise<ManualOfferView[]> {
  await sweepExpired(pool, nowMs);
  const { rows } = await pool.query(
    `SELECT o.*, b.name AS body_name FROM manual_offers o
     JOIN bodies b ON b.id = o.body_id
     WHERE o.buyer_id = $1
     ORDER BY o.created_at DESC LIMIT 50`,
    [buyerId],
  );
  return rows.map(offerView);
}

/** Retrait par l'acheteur de SA propre offre ouverte. */
export async function cancelManualOffer(
  pool: pg.Pool,
  buyerId: string,
  offerId: string,
): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE manual_offers SET status = 'cancelled', resolved_at = now()
     WHERE id = $1 AND buyer_id = $2 AND status = 'open'
     RETURNING id`,
    [offerId, buyerId],
  );
  if (!rows[0]) {
    // Pas d'oracle : inconnue, close ou pas à vous → même refus.
    throw new CommandError('not_found', 'Offre inconnue ou déjà close');
  }
}

/**
 * Résolution par le VENDEUR : décliner, ou accepter avec règlement
 * PHYSIQUE — le vaisseau épinglé doit être ENCORE à quai, porter le
 * paiement en soute et avoir la place du fret ; le stock du monde doit
 * couvrir la demande et le stockage absorber le paiement. Verrous :
 * offre → corps → vaisseau (corps avant vaisseau, DAT §8).
 */
export async function respondManualOffer(
  pool: pg.Pool,
  ownerId: string,
  offerId: string,
  action: 'accept' | 'decline',
  nowMs = Date.now(),
): Promise<{ status: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: offers } = await client.query(
      `SELECT * FROM manual_offers WHERE id = $1 FOR UPDATE`,
      [offerId],
    );
    const offer = offers[0];
    if (!offer) throw new CommandError('not_found', 'Offre inconnue');
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id, climate FROM bodies WHERE id = $1 FOR UPDATE`,
      [offer.body_id],
    );
    if (!bodies[0] || bodies[0].owner_id !== ownerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    if (offer.status !== 'open') {
      throw new CommandError('not_available', `Offre déjà ${offer.status}`);
    }
    if (toMs(offer.expires_at) <= nowMs) {
      await client.query(
        `UPDATE manual_offers SET status = 'expired', resolved_at = now()
         WHERE id = $1`,
        [offerId],
      );
      await client.query('COMMIT');
      throw new CommandError('not_available', 'Offre expirée');
    }

    if (action === 'decline') {
      await client.query(
        `UPDATE manual_offers SET status = 'declined', resolved_at = now()
         WHERE id = $1`,
        [offerId],
      );
      await client.query('COMMIT');
      return { status: 'declined' };
    }

    // Acceptation : règlement physique via le vaisseau épinglé.
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [offer.ship_id],
    );
    const ship = ships[0];
    if (
      !ship ||
      ship.owner_id !== offer.buyer_id ||
      ship.status !== 'docked' ||
      ship.docked_body_id !== offer.body_id
    ) {
      throw new CommandError(
        'not_available',
        'Le vaisseau de l\'acheteur n\'est plus à quai',
      );
    }
    const getT = Number(offer.get_t);
    const giveT = Number(offer.give_t);
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    if ((cargo[offer.give_resource] ?? 0) + 1e-9 < giveT) {
      throw new CommandError(
        'insufficient_resources',
        `La soute de l'acheteur manque de ${offer.give_resource}`,
      );
    }

    const snap = await loadProductionSnapshot(client, offer.body_id, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');
    const available = snap.stocks[offer.get_resource as ResourceId] ?? 0;
    if (available + 1e-9 < getT) {
      throw new CommandError(
        'insufficient_resources',
        `Stock insuffisant : ${offer.get_resource} (${available.toFixed(1)} T)`,
      );
    }
    // Canon §3.3b : « swaps/deliveries may overfill (physics) » — la
    // lecture complète du canon (chunk Y) a levé le contrôle net-delta
    // du chunk T : seule la PRODUCTION s'arrête au cap.

    const left = (cargo[offer.give_resource] ?? 0) - giveT;
    if (left <= 1e-9) delete cargo[offer.give_resource];
    else cargo[offer.give_resource] = left;
    cargo[offer.get_resource] = (cargo[offer.get_resource] ?? 0) + getT;
    const hull =
      HULLS[
        `${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`
      ];
    if (containersUsed(cargo) > (hull?.containers ?? 0)) {
      throw new CommandError(
        'not_available',
        `Conteneurs de l'acheteur insuffisants (${containersUsed(cargo)}/${hull?.containers ?? 0})`,
      );
    }

    for (const [res, amount] of [
      [offer.get_resource, available - getT],
      [
        offer.give_resource,
        (snap.stocks[offer.give_resource as ResourceId] ?? 0) + giveT,
      ],
    ] as [string, number][]) {
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
        [offer.body_id, res, amount, nowMs],
      );
    }
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      ship.id,
      JSON.stringify(cargo),
    ]);
    // Journal des échanges : canal manuel = slot −2 (inné = −1).
    await client.query(
      `INSERT INTO trades (market_building_id, body_id, trader, slot_index,
                           gave_resource, gave_t, got_resource, got_t)
       VALUES (NULL, $1, $2, -2, $3, $4, $5, $6)`,
      [
        offer.body_id,
        offer.buyer_id,
        offer.give_resource,
        giveT,
        offer.get_resource,
        getT,
      ],
    );
    await client.query(
      `UPDATE manual_offers SET status = 'accepted', resolved_at = now()
       WHERE id = $1`,
      [offerId],
    );
    await recomputePlanetRates(client, offer.body_id, nowMs);
    await client.query('COMMIT');
    return { status: 'accepted' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
