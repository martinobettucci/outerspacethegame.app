/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §6. */
/**
 * Intégration canal manuel (GB §9, DG §6 round 7) sur vraie base :
 * visibilité du warehouse (commande réelle, §10 direct), browse à quai
 * uniquement, offres avec limites round 7 (1/(acheteur, monde, ressource),
 * 20/24 h), résolution accepter/décliner avec règlement PHYSIQUE
 * (stock ↔ soute du vaisseau épinglé), retrait, expiration 48 h.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail, setBuildingSettings } from '../../src/services/planets.js';
import {
  browseWarehouse,
  cancelManualOffer,
  createManualOffer,
  listMyOffers,
  listPlanetOffers,
  respondManualOffer,
} from '../../src/services/manual.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let seller = '';
let sellerStarter = '';
let buyer = '';
let buyerCargo = '';
let warehouseId = '';

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

async function dockAt(shipId: string, bodyId: string) {
  await pool.query(
    `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
       hover_body_id = NULL,
       x = (SELECT x FROM bodies WHERE id = $2),
       y = (SELECT y FROM bodies WHERE id = $2)
     WHERE id = $1`,
    [shipId, bodyId],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `man-seller-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Seller',
    politics: 'mercantile',
    universeSeed: `man-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `man-buyer-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Buyer',
    politics: 'industrialist',
    universeSeed: `man-universe-${run}`,
  });
  seller = a.playerId;
  sellerStarter = a.spawn.starterPlanetId;
  buyer = b.playerId;
  buyerCargo = b.spawn.cargoShipId;

  const { rows: wh } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'warehouse', 1, 0, 'active', 0) RETURNING id`,
    [sellerStarter],
  );
  warehouseId = wh[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('visibilité du warehouse (§10 par requêtes directes)', () => {
  it('défaut privé ; le propriétaire passe en public via la vraie commande', async () => {
    let detail = await planetDetail(pool, seller, sellerStarter);
    expect(
      detail.buildings.find((b) => b.id === warehouseId)!.visibility,
    ).toBe('private');
    await setBuildingSettings(pool, seller, sellerStarter, warehouseId, {
      visibility: 'public',
    });
    detail = await planetDetail(pool, seller, sellerStarter);
    expect(
      detail.buildings.find((b) => b.id === warehouseId)!.visibility,
    ).toBe('public');
  });

  it('refusé : un étranger, une valeur inconnue, un bâtiment non-warehouse', async () => {
    await expect(
      setBuildingSettings(pool, buyer, sellerStarter, warehouseId, {
        visibility: 'private',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      setBuildingSettings(pool, seller, sellerStarter, warehouseId, {
        visibility: 'open-bar',
      }),
    ).rejects.toMatchObject({ code: 'workforce_invalid' });
    const { rows: mine } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'mine', 1, 1, 'active', 'extract:ore', 0) RETURNING id`,
      [sellerStarter],
    );
    await expect(
      setBuildingSettings(pool, seller, sellerStarter, mine[0]!.id, {
        visibility: 'public',
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('browse (canon : à quai, warehouse public)', () => {
  it('refusé sans vaisseau à quai (le survol ne suffit pas)', async () => {
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, docked_at = NULL
       WHERE id = $1`,
      [buyerCargo, sellerStarter],
    );
    await expect(
      browseWarehouse(pool, buyer, sellerStarter),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('à quai : montants seuls, triés, sans taux ; le propriétaire voit toujours', async () => {
    await dockAt(buyerCargo, sellerStarter);
    const view = await browseWarehouse(pool, buyer, sellerStarter);
    expect(view.public).toBe(true);
    expect(view.stock.length).toBeGreaterThan(0);
    const ore = view.stock.find((s) => s.resource === 'ore');
    expect(ore).toBeTruthy();
    expect(ore).not.toHaveProperty('ratePerDay');
    const sorted = [...view.stock].sort((x, y) =>
      x.resource.localeCompare(y.resource),
    );
    expect(view.stock).toEqual(sorted);
    await expect(browseWarehouse(pool, seller, sellerStarter)).resolves.toBeTruthy();
  });

  it('repassé privé : le visiteur à quai est refusé, le propriétaire non', async () => {
    await setBuildingSettings(pool, seller, sellerStarter, warehouseId, {
      visibility: 'private',
    });
    await expect(
      browseWarehouse(pool, buyer, sellerStarter),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(browseWarehouse(pool, seller, sellerStarter)).resolves.toBeTruthy();
    await setBuildingSettings(pool, seller, sellerStarter, warehouseId, {
      visibility: 'public',
    });
  });
});

describe('offres : création, limites round 7, retrait', () => {
  it('bundle valide créé (épingle le vaisseau à quai) ; invalides refusés', async () => {
    // 2 T : le règlement doit tenir dans les 3 conteneurs du Cargo S.
    const offer = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'ore',
      getTons: 2,
      giveResource: 'water',
      giveTons: 2,
    });
    expect(offer.status).toBe('open');
    expect(offer.shipId).toBeTruthy();
    for (const bad of [
      { getResource: 'unobtainium', getTons: 1, giveResource: 'water', giveTons: 1 },
      { getResource: 'ore', getTons: 0, giveResource: 'water', giveTons: 1 },
      { getResource: 'ore', getTons: 1, giveResource: 'ore', giveTons: 1 },
    ]) {
      await expect(
        createManualOffer(pool, buyer, sellerStarter, bad),
      ).rejects.toMatchObject({ code: 'not_available' });
    }
  });

  it('1 seule offre OUVERTE par (acheteur, monde, ressource)', async () => {
    await expect(
      createManualOffer(pool, buyer, sellerStarter, {
        getResource: 'ore',
        getTons: 1,
        giveResource: 'silicon',
        giveTons: 1,
      }),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('seule offre'),
    });
    // Une AUTRE ressource passe.
    const other = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'carbon',
      getTons: 1,
      giveResource: 'water',
      giveTons: 0.5,
    });
    await cancelManualOffer(pool, buyer, other.id);
  });

  it('plafond de 20 créations par 24 h (toutes planètes confondues)', async () => {
    // 2 déjà créées dans cette fenêtre : 18 de bourrage par SQL.
    await pool.query(
      `INSERT INTO manual_offers (body_id, buyer_id, ship_id, get_resource,
         get_t, give_resource, give_t, status, created_at, expires_at)
       SELECT $1, $2, $3, 'ore', 1, 'water', 1, 'cancelled',
              now() - interval '1 hour', now() + interval '47 hours'
       FROM generate_series(1, 18)`,
      [sellerStarter, buyer, buyerCargo],
    );
    await expect(
      createManualOffer(pool, buyer, sellerStarter, {
        getResource: 'silicon',
        getTons: 1,
        giveResource: 'water',
        giveTons: 1,
      }),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('Plafond'),
    });
    // Hors fenêtre (créées il y a 25 h) : ne comptent plus.
    await pool.query(
      `UPDATE manual_offers SET created_at = now() - interval '25 hours'
       WHERE buyer_id = $1 AND status = 'cancelled'`,
      [buyer],
    );
    const ok = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'silicon',
      getTons: 1,
      giveResource: 'water',
      giveTons: 1,
    });
    await cancelManualOffer(pool, buyer, ok.id);
  });

  it('refus : propriétaire chez lui, monde sans warehouse public, pas à quai', async () => {
    await expect(
      createManualOffer(pool, seller, sellerStarter, {
        getResource: 'ore',
        getTons: 1,
        giveResource: 'water',
        giveTons: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // L'acheteur n'a de vaisseau à quai QUE chez le vendeur.
    const { rows: buyerHome } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id = $1 AND body_type = 'planet' LIMIT 1`,
      [buyer],
    );
    await expect(
      createManualOffer(pool, seller, buyerHome[0].id, {
        getResource: 'ore',
        getTons: 1,
        giveResource: 'water',
        giveTons: 1,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('le retrait ne touche que SES offres ouvertes (§10)', async () => {
    const mine = await listMyOffers(pool, buyer);
    const open = mine.find((o) => o.status === 'open')!;
    await expect(cancelManualOffer(pool, seller, open.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('résolution par le vendeur (règlement physique)', () => {
  it('décliner ; un étranger ne résout pas ; l\'acheteur non plus', async () => {
    const toDecline = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'carbon',
      getTons: 1,
      giveResource: 'water',
      giveTons: 0.5,
    });
    await expect(
      respondManualOffer(pool, buyer, toDecline.id, 'accept'),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const r = await respondManualOffer(pool, seller, toDecline.id, 'decline');
    expect(r.status).toBe('declined');
    await expect(
      respondManualOffer(pool, seller, toDecline.id, 'accept'),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('accepter : stock et soute bougent EXACTEMENT, échange journalisé', async () => {
    // Soute de l'acheteur : 2 T d'eau (cap Cargo S = 3 conteneurs).
    await pool.query(`UPDATE ships SET cargo = '{"water": 2}' WHERE id = $1`, [
      buyerCargo,
    ]);
    const offers = await listPlanetOffers(pool, seller, sellerStarter);
    const open = offers.find((o) => o.getResource === 'ore')!;
    expect(open.buyerName).toBe('Buyer');
    const stockOreBefore = await stockOf(sellerStarter, 'ore');
    const stockWaterBefore = await stockOf(sellerStarter, 'water');

    const r = await respondManualOffer(pool, seller, open.id, 'accept');
    expect(r.status).toBe('accepted');

    expect(await stockOf(sellerStarter, 'ore')).toBeCloseTo(stockOreBefore - 2, 2);
    // Tolérance 2 décimales : la population BOIT (dérive paresseuse en
    // heures réelles entre la lecture témoin et l'acceptation).
    expect(await stockOf(sellerStarter, 'water')).toBeCloseTo(
      stockWaterBefore + 2,
      2,
    );
    const { rows: ship } = await pool.query(
      `SELECT cargo FROM ships WHERE id = $1`,
      [buyerCargo],
    );
    expect(ship[0].cargo).toEqual({ ore: 2 });
    const { rows: journal } = await pool.query(
      `SELECT * FROM trades WHERE body_id = $1 AND slot_index = -2`,
      [sellerStarter],
    );
    expect(journal).toHaveLength(1);
    expect(Number(journal[0].got_t)).toBe(2);
  });

  it('accepter échoue proprement : vaisseau parti, soute vide, stock trop court', async () => {
    // Vaisseau parti.
    const gone = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'ore',
      getTons: 1,
      giveResource: 'water',
      giveTons: 1,
    });
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, docked_at = NULL WHERE id = $1`,
      [buyerCargo, sellerStarter],
    );
    await expect(
      respondManualOffer(pool, seller, gone.id, 'accept'),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('plus à quai'),
    });
    await dockAt(buyerCargo, sellerStarter);
    // Soute sans le paiement.
    await pool.query(`UPDATE ships SET cargo = '{}' WHERE id = $1`, [buyerCargo]);
    await expect(
      respondManualOffer(pool, seller, gone.id, 'accept'),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    // Stock du monde trop court.
    await pool.query(`UPDATE ships SET cargo = '{"water": 1}' WHERE id = $1`, [
      buyerCargo,
    ]);
    await cancelManualOffer(pool, buyer, gone.id);
    const greedy = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'ore',
      getTons: 1_000,
      giveResource: 'water',
      giveTons: 1,
    });
    await expect(
      respondManualOffer(pool, seller, greedy.id, 'accept'),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await cancelManualOffer(pool, buyer, greedy.id);
  });

  it('monde SUR-CAP : troc net-neutre ET entrée nette passent (§3.3b, overfill de livraison)', async () => {
    // Sature le stock au-delà du cap (l'overfill existe physiquement).
    const detail = await planetDetail(pool, seller, sellerStarter);
    await pool.query(
      `UPDATE planet_stock SET amount_t = $2, rate_t_per_day = 0, as_of = now()
       WHERE body_id = $1 AND resource = 'ore'`,
      [sellerStarter, detail.storageCapT + 500],
    );
    await pool.query(`UPDATE ships SET cargo = '{"water": 2}' WHERE id = $1`, [
      buyerCargo,
    ]);
    // Net-neutre (2 ← 2) : accepté malgré le dépassement.
    const neutral = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'ore',
      getTons: 2,
      giveResource: 'water',
      giveTons: 2,
    });
    const ok = await respondManualOffer(pool, seller, neutral.id, 'accept');
    expect(ok.status).toBe('accepted');
    // Entrée NETTE (+1.5) sur monde toujours plein : la livraison
    // SUR-REMPLIT (canon §3.3b, aligné chunk Y) — seule la production
    // s'arrête au cap.
    await pool.query(`UPDATE ships SET cargo = '{"water": 2}' WHERE id = $1`, [
      buyerCargo,
    ]);
    const net = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'ore',
      getTons: 0.5,
      giveResource: 'water',
      giveTons: 2,
    });
    const accepted = await respondManualOffer(pool, seller, net.id, 'accept');
    expect(accepted.status).toBe('accepted');
    const overfilled = await planetDetail(pool, seller, sellerStarter);
    expect(overfilled.storageUsedT).toBeGreaterThan(overfilled.storageCapT);
  });

  it('expiration 48 h : balayée à la lecture, réponse refusée', async () => {
    const stale = await createManualOffer(pool, buyer, sellerStarter, {
      getResource: 'carbon',
      getTons: 1,
      giveResource: 'water',
      giveTons: 0.5,
    });
    await pool.query(
      `UPDATE manual_offers SET expires_at = now() - interval '1 minute'
       WHERE id = $1`,
      [stale.id],
    );
    const inbox = await listPlanetOffers(pool, seller, sellerStarter);
    expect(inbox.find((o) => o.id === stale.id)).toBeUndefined();
    const mine = await listMyOffers(pool, buyer);
    expect(mine.find((o) => o.id === stale.id)?.status).toBe('expired');
    await expect(
      respondManualOffer(pool, seller, stale.id, 'accept'),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});
