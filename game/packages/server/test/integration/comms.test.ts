/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Ping/ping-back”; GAME_BOOK.md §4/§5; DESIGN_GUIDE.md §15. */
/**
 * Intégration : la Silence et son protocole (GB §5) — portée obligatoire,
 * quota, ping-back qui ouvre LE canal, messages, refus d'autorisation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  listComms,
  listMessages,
  pingBack,
  PINGS_PER_DAY,
  postMessage,
  sendPing,
} from '../../src/services/comms.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let alice = '';
let bob = '';
let aliceStarter = '';
let bobStarter = '';

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `alice-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Alice',
    politics: 'diplomatic',
    universeSeed: `comms-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `bob-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Bob',
    politics: 'mercantile',
    universeSeed: `comms-universe-${run}`,
  });
  alice = a.playerId;
  bob = b.playerId;
  aliceStarter = a.spawn.starterPlanetId;
  bobStarter = b.spawn.starterPlanetId;
});

afterAll(async () => {
  await pool.end();
});

describe('pings (GB §5)', () => {
  it('hors de portée : refus — la Silence tient tant que le scope ne suffit pas', async () => {
    await expect(sendPing(pool, alice, bobStarter)).rejects.toMatchObject({
      code: 'not_available',
    });
  });

  it('avec un télescope L1 (+200 pc), le voisin devient hélable ; le ping-back ouvre le canal', async () => {
    // Télescope L1 unique, sur tuile (l'unlock/build est couvert ailleurs).
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status)
       VALUES ($1, 'telescope', 1, 0, 'active')`,
      [aliceStarter],
    );
    const ping = await sendPing(pool, alice, bobStarter);
    expect(ping.toPlayer).toBe(bob);

    // Un seul hail en attente par couple.
    await expect(sendPing(pool, alice, bobStarter)).rejects.toMatchObject({
      code: 'not_available',
    });

    // Bob voit le hail entrant ; personne d'autre ne peut y répondre.
    const bobComms = await listComms(pool, bob);
    expect(bobComms.incoming).toHaveLength(1);
    expect(bobComms.incoming[0]!.fromName).toBe('Alice');
    await expect(pingBack(pool, alice, ping.pingId)).rejects.toMatchObject({
      code: 'forbidden',
    });

    const { channelId } = await pingBack(pool, bob, ping.pingId);
    expect(channelId).toBeTruthy();
    // Rejouer le ping-back : hail déjà traité.
    await expect(pingBack(pool, bob, ping.pingId)).rejects.toMatchObject({
      code: 'not_available',
    });

    // Le canal apparaît des deux côtés — événement historique (GAME_BIBLE §1).
    const aliceComms = await listComms(pool, alice);
    expect(aliceComms.channels[0]!.withName).toBe('Bob');
    expect((await listComms(pool, bob)).channels[0]!.withName).toBe('Alice');

    // Messages : échange réel, ordre stable, propriété `mine`.
    await postMessage(pool, alice, channelId, 'We see your world, Bob.');
    await postMessage(pool, bob, channelId, 'The Silence breaks. Welcome.');
    const forBob = await listMessages(pool, bob, channelId);
    expect(forBob.map((m) => m.body)).toEqual([
      'We see your world, Bob.',
      'The Silence breaks. Welcome.',
    ]);
    expect(forBob[0]!.mine).toBe(false);
    expect(forBob[1]!.mine).toBe(true);
  });

  it('un tiers ne lit ni ne poste dans un canal étranger (requête directe)', async () => {
    const eve = await registerPlayer(pool, {
      email: `eve-${run}@test.local`,
      password: 'motdepasse-solide-3',
      displayName: 'Eve',
      politics: 'militarist',
      universeSeed: `comms-universe-${run}`,
    });
    const { channels } = await listComms(pool, alice);
    await expect(
      listMessages(pool, eve.playerId, channels[0]!.id),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      postMessage(pool, eve.playerId, channels[0]!.id, 'spy'),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('quota : 20 pings/jour', async () => {
    // Épuise le quota par insertion directe (l'émission réelle est couverte).
    await pool.query(
      `INSERT INTO pings (from_player, to_player, body_id, status)
       SELECT $1, $2, $3, 'ignored' FROM generate_series(1, $4)`,
      [alice, bob, bobStarter, PINGS_PER_DAY],
    );
    await expect(sendPing(pool, alice, bobStarter)).rejects.toMatchObject({
      code: 'not_available',
    });
  });

  it('un monde sauvage ou à soi ne se hèle pas', async () => {
    const { rows: wild } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id IS NULL AND body_type = 'planet' LIMIT 1`,
    );
    await expect(sendPing(pool, alice, wild[0].id)).rejects.toMatchObject({
      code: 'not_available',
    });
    await expect(sendPing(pool, alice, aliceStarter)).rejects.toMatchObject({
      code: 'not_available',
    });
  });
});
