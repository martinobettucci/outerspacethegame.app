/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Markets” and “Merchant-planet innate trading”; GAME_BOOK.md §9/§13; DESIGN_GUIDE.md §11.1–§11.2. */
/**
 * Intégration : commerce inné du monde marchand (GB §9) — gouvernance
 * TOUTE mercantile exigée, périmètre survie+carburant, plancher
 * keep-for-self, hospitalité en survol (pas de droit d'atterrissage),
 * refus d'autorisation par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { InnateOffer } from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import {
  executeInnateTrade,
  listInnateOffers,
  setInnateOffers,
} from '../../src/services/market.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let merchant = '';
let merchantStarter = '';
let visitor = '';
let visitorCargo = '';

const OFFER: InnateOffer = {
  sell: 'water',
  want: 'ore',
  price: 2,
  keepFloorT: 20,
};

beforeAll(async () => {
  pool = await createTestPool();
  const m = await registerPlayer(pool, {
    email: `inn-merchant-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Innkeeper',
    politics: 'mercantile',
    universeSeed: `inn-universe-${run}`,
  });
  const v = await registerPlayer(pool, {
    email: `inn-visitor-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Thirsty',
    politics: 'militarist',
    universeSeed: `inn-universe-${run}`,
  });
  merchant = m.playerId;
  merchantStarter = m.spawn.starterPlanetId;
  visitor = v.playerId;
  visitorCargo = v.spawn.cargoShipId;
  // Eau du marchand : 40 T (plancher 20 ⇒ 20 négociables).
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, 'water', 40, now())
     ON CONFLICT (body_id, resource) DO UPDATE SET amount_t = 40, as_of = now()`,
    [merchantStarter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('publication des offres innées (GB §9)', () => {
  it('un monde mercantile publie ; un non-mercantile est refusé (mask_denied)', async () => {
    await setInnateOffers(pool, merchant, merchantStarter, [OFFER]);
    const { rows: v } = await pool.query(
      `SELECT b.id FROM bodies b WHERE b.owner_id = $1 AND b.is_starter`,
      [visitor],
    );
    await expect(
      setInnateOffers(pool, visitor, v[0].id, [OFFER]),
    ).rejects.toMatchObject({ code: 'mask_denied' });
  });

  it('périmètre : vendre de l\'ore innément est refusé ; doublon refusé ; étranger refusé', async () => {
    await expect(
      setInnateOffers(pool, merchant, merchantStarter, [
        { ...OFFER, sell: 'ore', want: 'water' },
      ]),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      setInnateOffers(pool, merchant, merchantStarter, [OFFER, { ...OFFER, price: 3 }]),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      setInnateOffers(pool, visitor, merchantStarter, [OFFER]),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('hospitalité : consultation et achat en survol', () => {
  it('hors site : refus ; en survol : offres visibles avec surplus au-dessus du plancher', async () => {
    await expect(
      listInnateOffers(pool, visitor, merchantStarter),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Le vol réel est couvert (ships.test.ts) : on POSE le cargo en survol.
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, cargo = '{"ore": 3}'::jsonb
       WHERE id = $1`,
      [visitorCargo, merchantStarter],
    );
    const offers = await listInnateOffers(pool, visitor, merchantStarter);
    expect(offers).toHaveLength(1);
    expect(offers[0]!.sell).toBe('water');
    expect(offers[0]!.availableT).toBeCloseTo(20, 0);
  });

  it('achat : 1 T d\'eau contre 2 T d\'ore — sans droit d\'atterrissage', async () => {
    const r = await executeInnateTrade(
      pool,
      visitor,
      merchantStarter,
      0,
      visitorCargo,
      1,
    );
    expect(r.paidT).toBe(2);
    expect(r.paidResource).toBe('ore');
    const { rows } = await pool.query(`SELECT cargo FROM ships WHERE id = $1`, [
      visitorCargo,
    ]);
    expect(rows[0].cargo).toEqual({ ore: 1, water: 1 });
  });

  it('le plancher keep-for-self ne s\'entame JAMAIS', async () => {
    // Il reste 19 T négociables (39 − 20) : en demander 20 échoue.
    await pool.query(`UPDATE ships SET cargo = '{"ore": 45}'::jsonb WHERE id = $1`, [
      visitorCargo,
    ]);
    await expect(
      executeInnateTrade(pool, visitor, merchantStarter, 0, visitorCargo, 20),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
  });

  it('si la gouvernance cesse d\'être mercantile, l\'inné se tait', async () => {
    // Un gouverneur soldat (militarist) casse l'intersection.
    await pool.query(
      `INSERT INTO npcs (owner_id, people, role, rarity, bound_host_type, bound_host_id)
       VALUES ($1, 'human', 'soldier', 'common', 'planet', $2)`,
      [merchant, merchantStarter],
    );
    expect(await listInnateOffers(pool, visitor, merchantStarter)).toEqual([]);
    await expect(
      executeInnateTrade(pool, visitor, merchantStarter, 0, visitorCargo, 1),
    ).rejects.toMatchObject({ code: 'mask_denied' });
    await pool.query(
      `DELETE FROM npcs WHERE bound_host_id = $1 AND role = 'soldier'`,
      [merchantStarter],
    );
  });

  it('le vaisseau d\'un autre n\'achète pas pour moi (requête directe)', async () => {
    await expect(
      executeInnateTrade(pool, merchant, merchantStarter, 0, visitorCargo, 1),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
