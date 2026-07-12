import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type pg from 'pg';
import { z } from 'zod';
import { ARCHETYPES, ALL_BUILDING_KEYS, ALL_TECH_KEYS } from '@atg/shared';
import type { Archetype, BuildingKey, TechNodeKey } from '@atg/shared';
import type { Config } from '../config.js';
import {
  registerPlayer,
  RegistrationError,
} from '../services/players.js';
import {
  createSession,
  destroySession,
  resolveSession,
  type SessionPlayer,
} from '../services/sessions.js';
import { verifyPassword } from '../services/passwords.js';
import { visibleBodies } from '../services/world.js';
import {
  buildShip,
  fleet,
  landShip,
  launchProbe,
  moveShip,
  pendingShipBuilds,
  transferCargo,
  undockShip,
} from '../services/ships.js';
import {
  executeInnateTrade,
  executeTrade,
  listInnateOffers,
  listMarkets,
  setInnateOffers,
  setMarketSlot,
} from '../services/market.js';
import {
  listComms,
  listMessages,
  pingBack,
  postMessage,
  sendPing,
} from '../services/comms.js';
import {
  CommandError,
  demolishBuilding,
  levelUpBuilding,
  placeBuilding,
  planetDetail,
  setBuildingSettings,
  unlockNode,
} from '../services/planets.js';

export interface ServerDeps {
  pool: pg.Pool;
  config: Config;
}

const SESSION_COOKIE = 'atg_session';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(2).max(40),
  politics: z.enum(ARCHETYPES as [Archetype, ...Archetype[]]),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
const unlockSchema = z.object({
  node: z.enum(ALL_TECH_KEYS as [TechNodeKey, ...TechNodeKey[]]),
});
const buildSchema = z.object({
  building: z.enum(ALL_BUILDING_KEYS as [BuildingKey, ...BuildingKey[]]),
  tileIndex: z.number().int().nullable(),
  recipe: z.string().max(64).nullable().optional(),
});
const moveSchema = z.union([
  z.object({ bodyId: z.string().uuid() }),
  z.object({ x: z.number(), y: z.number() }),
]);
const probeSchema = z.object({ x: z.number(), y: z.number() });
const pingSchema = z.object({ bodyId: z.string().uuid() });
const messageSchema = z.object({ body: z.string().min(1).max(2000) });
const settingsSchema = z.object({
  workforce: z.number().int().min(0).optional(),
  runPct: z.number().int().min(0).max(100).optional(),
  landing: z.enum(['self', 'everyone']).optional(),
});
const cargoSchema = z.object({
  resource: z.string().min(1),
  tons: z.number().positive(),
  direction: z.enum(['load', 'unload']),
});
const marketSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(2),
  give: z.string().min(1),
  get: z.string().min(1),
  rate: z.number().positive(),
  dailyLimitT: z.number().min(0).default(0),
  absoluteLimitT: z.number().min(0).default(0),
  whitelist: z.array(z.string().uuid()).max(64).default([]),
});
const tradeSchema = z.object({
  slotIndex: z.number().int().min(0).max(2),
  shipId: z.string().uuid(),
  giveT: z.number().positive(),
});
const innateOffersSchema = z.object({
  offers: z
    .array(
      z.object({
        sell: z.string().min(1),
        want: z.string().min(1),
        price: z.number().positive(),
        keepFloorT: z.number().min(0),
      }),
    )
    .max(8),
});
const innateTradeSchema = z.object({
  offerIndex: z.number().int().min(0).max(7),
  shipId: z.string().uuid(),
  buyT: z.number().positive(),
});
const buildShipSchema = z.object({
  category: z.enum(['combat', 'cargo', 'civil']),
  size: z.enum(['s', 'm', 'l']),
  name: z.string().min(2).max(40),
});

const COMMAND_HTTP: Record<CommandError['code'], number> = {
  not_found: 404,
  forbidden: 403,
  not_available: 409,
  not_unlocked: 409,
  already_unlocked: 409,
  prereq_missing: 409,
  mask_denied: 403,
  tile_invalid: 400,
  tile_taken: 409,
  max_instances: 409,
  insufficient_resources: 409,
  unbuildable: 409,
  recipe_invalid: 400,
  deposit_taken: 409,
  workforce_invalid: 400,
  max_level: 409,
};

/**
 * Construit l'instance Fastify (injectable pour les tests). Toute règle
 * d'autorisation du jeu est appliquée ici ou dans les services (CLAUDE.md
 * §10) — l'interface n'est jamais une barrière suffisante.
 */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  await app.register(cors, {
    origin: deps.config.CLIENT_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, { secret: deps.config.SESSION_SECRET });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, reply) => {
    try {
      await deps.pool.query('SELECT 1');
      return { status: 'ready', db: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'not-ready', db: 'down' });
    }
  });

  const sessionToken = (req: FastifyRequest): string | undefined =>
    req.cookies[SESSION_COOKIE];

  const requirePlayer = async (req: FastifyRequest): Promise<SessionPlayer> => {
    const player = await resolveSession(deps.pool, sessionToken(req));
    if (!player) {
      throw Object.assign(new Error('Non authentifié'), { statusCode: 401 });
    }
    return player;
  };

  const setSessionCookie = (
    reply: { setCookie: (name: string, value: string, opts: object) => unknown },
    token: string,
    expiresAt: Date,
  ) =>
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: expiresAt,
    });

  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      const result = await registerPlayer(deps.pool, {
        ...parsed.data,
        universeSeed: deps.config.UNIVERSE_SEED,
      });
      const session = await createSession(deps.pool, result.playerId);
      setSessionCookie(reply, session.token, session.expiresAt);
      return reply.status(201).send({
        playerId: result.playerId,
        starterPlanetId: result.spawn.starterPlanetId,
      });
    } catch (err) {
      if (err instanceof RegistrationError) {
        return reply
          .status(err.code === 'email_taken' ? 409 : 400)
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    const { rows } = await deps.pool.query(
      'SELECT id, password_hash FROM players WHERE email = $1',
      [parsed.data.email.toLowerCase()],
    );
    // Réponse identique e-mail inconnu / mauvais mot de passe (pas d'oracle).
    if (
      !rows[0] ||
      !(await verifyPassword(parsed.data.password, rows[0].password_hash))
    ) {
      return reply.status(401).send({ error: 'bad_credentials' });
    }
    const session = await createSession(deps.pool, rows[0].id);
    setSessionCookie(reply, session.token, session.expiresAt);
    return { playerId: rows[0].id };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(deps.pool, sessionToken(req));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const player = await requirePlayer(req);
    const { rows } = await deps.pool.query(
      `SELECT id, name FROM bodies WHERE owner_id = $1 ORDER BY created_at`,
      [player.id],
    );
    return {
      player: {
        id: player.id,
        displayName: player.displayName,
        politics: player.politics,
      },
      planets: rows,
    };
  });

  app.get('/galaxy', async (req) => {
    const player = await requirePlayer(req);
    return { bodies: await visibleBodies(deps.pool, player.id) };
  });

  app.get('/planets/:id', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    try {
      return await planetDetail(deps.pool, player.id, id);
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/unlock', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      await unlockNode(deps.pool, player.id, id, parsed.data.node);
      return { ok: true };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/build', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = buildSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      const result = await placeBuilding(
        deps.pool,
        player.id,
        id,
        parsed.data.building,
        parsed.data.tileIndex,
        { timeScale: deps.config.TIME_SCALE, recipe: parsed.data.recipe ?? null },
      );
      return {
        buildingId: result.buildingId,
        completesAt: result.completesAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/buildings/:buildingId/levelup', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, buildingId } = req.params as { id: string; buildingId: string };
    try {
      const r = await levelUpBuilding(deps.pool, player.id, id, buildingId, {
        timeScale: deps.config.TIME_SCALE,
      });
      return { newLevel: r.newLevel, completesAt: r.completesAt.toISOString() };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/buildings/:buildingId/demolish', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, buildingId } = req.params as { id: string; buildingId: string };
    try {
      const r = await demolishBuilding(deps.pool, player.id, id, buildingId, {
        timeScale: deps.config.TIME_SCALE,
      });
      return { refunded: r.refunded, completesAt: r.completesAt.toISOString() };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.get('/fleet', async (req) => {
    const player = await requirePlayer(req);
    return { ships: await fleet(deps.pool, player.id) };
  });

  app.post('/ships/:id/move', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      const r = await moveShip(deps.pool, player.id, id, parsed.data, {
        timeScale: deps.config.TIME_SCALE,
      });
      return {
        arrivesAt: r.arrivesAt.toISOString(),
        fuelBurned: Math.round(r.fuelBurned * 100) / 100,
        distancePc: Math.round(r.distancePc * 10) / 10,
      };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/probes', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = probeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      const r = await launchProbe(deps.pool, player.id, id, parsed.data, {
        timeScale: deps.config.TIME_SCALE,
      });
      return { probeId: r.probeId, arrivesAt: r.arrivesAt.toISOString() };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  const wrap = async (
    reply: { status: (code: number) => { send: (b: unknown) => unknown } },
    fn: () => Promise<unknown>,
  ) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  };

  app.get('/comms', async (req) => {
    const player = await requirePlayer(req);
    return listComms(deps.pool, player.id);
  });

  app.post('/ships/:id/land', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => landShip(deps.pool, player.id, id));
  });

  app.post('/ships/:id/undock', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => undockShip(deps.pool, player.id, id));
  });

  app.post('/ships/:id/cargo', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = cargoSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () => transferCargo(deps.pool, player.id, id, parsed.data));
  });

  app.post('/planets/:id/buildings/:bid/market-slot', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, bid } = req.params as { id: string; bid: string };
    const parsed = marketSlotSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    const { slotIndex, ...slot } = parsed.data;
    return wrap(reply, () =>
      setMarketSlot(deps.pool, player.id, id, bid, slotIndex, {
        ...slot,
        give: slot.give as never,
        get: slot.get as never,
      }),
    );
  });

  app.get('/bodies/:id/markets', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      markets: await listMarkets(deps.pool, player.id, id),
    }));
  });

  // Instrumentation de TEST (§15) — grants de ressources, propriétaire
  // seulement, et UNIQUEMENT si ATG_TEST_ENDPOINTS=1 (jamais en prod).
  if (deps.config.ATG_TEST_ENDPOINTS) {
    app.post('/test/grant', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          planetId: z.string().uuid(),
          resource: z.string().min(1),
          tons: z.number().positive().max(100_000),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      const { planetId, resource, tons } = parsed.data;
      const { rows } = await deps.pool.query(
        `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
        [planetId, player.id],
      );
      if (!rows[0]) return reply.status(403).send({ error: 'forbidden' });
      await deps.pool.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = planet_stock.amount_t + $3, as_of = now()`,
        [planetId, resource, tons],
      );
      return { ok: true };
    });
  }

  app.post('/planets/:id/ships', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = buildShipSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, async () => {
      const r = await buildShip(deps.pool, player.id, id, parsed.data, {
        timeScale: deps.config.TIME_SCALE,
      });
      return { completesAt: r.completesAt.toISOString(), cost: r.cost };
    });
  });

  app.get('/planets/:id/ship-builds', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      builds: await pendingShipBuilds(deps.pool, player.id, id),
    }));
  });

  app.post('/planets/:id/innate-offers', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = innateOffersSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      setInnateOffers(
        deps.pool,
        player.id,
        id,
        parsed.data.offers as never,
      ),
    );
  });

  app.get('/bodies/:id/innate-offers', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      offers: await listInnateOffers(deps.pool, player.id, id),
    }));
  });

  app.post('/bodies/:id/innate-trade', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = innateTradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      executeInnateTrade(
        deps.pool,
        player.id,
        id,
        parsed.data.offerIndex,
        parsed.data.shipId,
        parsed.data.buyT,
      ),
    );
  });

  app.post('/markets/:bid/trade', async (req, reply) => {
    const player = await requirePlayer(req);
    const { bid } = req.params as { bid: string };
    const parsed = tradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      executeTrade(
        deps.pool,
        player.id,
        bid,
        parsed.data.slotIndex,
        parsed.data.shipId,
        parsed.data.giveT,
      ),
    );
  });

  app.post('/pings', async (req, reply) => {
    const player = await requirePlayer(req);
    const parsed = pingSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () => sendPing(deps.pool, player.id, parsed.data.bodyId));
  });

  app.post('/pings/:id/pingback', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => pingBack(deps.pool, player.id, id));
  });

  app.get('/channels/:id/messages', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      messages: await listMessages(deps.pool, player.id, id),
    }));
  });

  app.post('/channels/:id/messages', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, async () => {
      await postMessage(deps.pool, player.id, id, parsed.data.body);
      return { ok: true };
    });
  });

  app.patch('/planets/:id/buildings/:buildingId', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, buildingId } = req.params as { id: string; buildingId: string };
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      await setBuildingSettings(deps.pool, player.id, id, buildingId, parsed.data);
      return { ok: true };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  return app;
}
