import { STABLE_PYRAMID } from '@atg/shared';
import { setAutoTrade } from '../services/hoverTrade.js';
import {
  buildStargate,
  cancelStargateProposal,
  listStargateProposals,
  proposeStargate,
  respondStargateProposal,
  setStargateToll,
  traverseStargate,
  visibleStargates,
} from '../services/stargates.js';
import {
  collectJunk,
  dumpCargo,
  fitClaimRig,
  fitJunkCollector,
  startClaim,
  visibleDerelicts,
  visibleJunkFields,
} from '../services/junk.js';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type pg from 'pg';
import { z } from 'zod';
import { ARCHETYPES, ALL_BUILDING_KEYS, ALL_TECH_KEYS } from '@atg/shared';
import type { Archetype, BuildingKey, TechNodeKey } from '@atg/shared';
import type { Config } from '../config.js';
import { extinguishPlanet } from '../sim/extinction.js';
import { recomputePlanetRates } from '../sim/rebase.js';
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
import {
  BASE_SKY_PC,
  bodyIntel,
  PROBE_SCAN_PC,
  SHIP_SCAN_PC,
  TELESCOPE_SCOPE_PC_PER_LEVEL,
  visibleBodies,
} from '../services/world.js';
import {
  fitHarvestRig,
  fitShield,
  setStarStockForTest,
  startHarvest,
  stopHarvest,
} from '../services/harvest.js';
import {
  assignCrew,
  buildShip,
  fleet,
  landShip,
  buildProbe,
  scoopProbeFuel,
  sendProbe,
  listNpcs,
  moveShip,
  pendingShipBuilds,
  provisionShip,
  refuelShip,
  relocateShipForTest,
  retrieveShip,
  setFleePolicy,
  setShipFuelForTest,
  setShipHullForTest,
  setShipSurvivalForTest,
  transferCargo,
  transferFuel,
  undockShip,
  warehouseShip,
} from '../services/ships.js';
import {
  colonizeShip,
  fitColonyKit,
  transferSettlers,
} from '../services/colonization.js';
import { latestCensus } from '../services/census.js';
import { openPod, podPricing } from '../services/pods.js';
import {
  ammLiquidity,
  executeAmmRoute,
  executeAmmTrade,
  executeInnateTrade,
  executeTrade,
  seedAmmPool,
  listInnateOffers,
  listMarkets,
  setInnateOffers,
  setMarketSlot,
} from '../services/market.js';
import {
  browseWarehouse,
  cancelManualOffer,
  createManualOffer,
  listMyOffers,
  listPlanetOffers,
  respondManualOffer,
} from '../services/manual.js';
import {
  installGovernor,
  previewGovernance,
} from '../services/governance.js';
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
  retoolBuilding,
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
  // Bornes métier re-vérifiées dans le service (source : @atg/shared).
  dwellHours: z.number().int().optional(),
  reservedForSelf: z.number().int().optional(),
  visibility: z.enum(['public', 'private']).optional(),
});
const manualOfferSchema = z.object({
  getResource: z.string().min(1),
  getTons: z.number().positive(),
  giveResource: z.string().min(1),
  giveTons: z.number().positive(),
});
const manualRespondSchema = z.object({
  action: z.enum(['accept', 'decline']),
});
const governorSchema = z.object({ npcId: z.string().uuid() });
const retoolSchema = z.object({ recipe: z.string().min(1).max(64) });
const governorPreviewSchema = z.object({
  npcIds: z.array(z.string().uuid()).min(1).max(3),
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
const ammSeedSchema = z.object({
  slotIndex: z.number().int().min(0).max(2),
  x: z.string().min(1),
  y: z.string().min(1),
  depositX: z.number().positive(),
  depositY: z.number().positive(),
  dailyLimitT: z.number().min(0).default(0),
  absoluteLimitT: z.number().min(0).default(0),
  whitelist: z.array(z.string().uuid()).max(64).default([]),
});
const ammLiquiditySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    slotIndex: z.number().int().min(0).max(2),
    tonsX: z.number().positive(),
  }),
  z.object({
    action: z.literal('remove'),
    slotIndex: z.number().int().min(0).max(2),
    pct: z.number().positive().max(100),
  }),
]);
const ammTradeSchema = z.object({
  slotIndex: z.number().int().min(0).max(2),
  shipId: z.string().uuid(),
  give: z.string().min(1),
  giveT: z.number().positive(),
});
const ammRouteSchema = z.object({
  shipId: z.string().uuid(),
  give: z.string().min(1),
  get: z.string().min(1),
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
const settlersSchema = z
  .object({
    children: z.number().int().min(0),
    actives: z.number().int().min(0),
    seniors: z.number().int().min(0),
    direction: z.enum(['embark', 'disembark']),
  })
  .refine((value) => value.children + value.actives + value.seniors > 0);
const crewSchema = z.object({ npcId: z.string().uuid() });
const refuelSchema = z.object({ units: z.number().positive().optional() });
const podOpenSchema = z.object({
  planetId: z.string().uuid(),
  resource: z.string().min(1),
});
const transferFuelSchema = z.object({
  toShipId: z.string().uuid(),
  units: z.number().positive(),
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
    return {
      bodies: await visibleBodies(deps.pool, player.id),
      junkFields: await visibleJunkFields(deps.pool, player.id, {
        baseSkyPc: BASE_SKY_PC,
        telescopePcPerLevel: TELESCOPE_SCOPE_PC_PER_LEVEL,
        probePc: PROBE_SCAN_PC,
        shipPc: SHIP_SCAN_PC,
      }),
      derelicts: await visibleDerelicts(deps.pool, player.id, {
        baseSkyPc: BASE_SKY_PC,
        telescopePcPerLevel: TELESCOPE_SCOPE_PC_PER_LEVEL,
        probePc: PROBE_SCAN_PC,
        shipPc: SHIP_SCAN_PC,
      }),
      stargates: await visibleStargates(deps.pool, player.id, {
        baseSkyPc: BASE_SKY_PC,
        telescopePcPerLevel: TELESCOPE_SCOPE_PC_PER_LEVEL,
        probePc: PROBE_SCAN_PC,
        shipPc: SHIP_SCAN_PC,
      }),
    };
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

  // Refonte sondes (2026-07-20) : build et envoi DÉCOUPLÉS.
  // POST /planets/:id/probes (sans corps) = construire, la sonde survole
  // son monde ; POST /planets/:id/probes/send {x,y} = expédier la
  // PREMIÈRE sonde disponible.
  app.post('/planets/:id/probes', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    try {
      const r = await buildProbe(deps.pool, player.id, id);
      return { probeId: r.probeId };
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // Scoop stellaire d'une sonde (2026-07-20) : plein direct à l'étoile,
  // au prix de la coque — à 0 HP la sonde est détruite.
  app.post('/ships/:id/scoop', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    try {
      return await scoopProbeFuel(deps.pool, player.id, id);
    } catch (err) {
      if (err instanceof CommandError) {
        return reply
          .status(COMMAND_HTTP[err.code])
          .send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post('/planets/:id/probes/send', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = probeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input' });
    }
    try {
      const r = await sendProbe(deps.pool, player.id, id, parsed.data, {
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
    return wrap(reply, () =>
      landShip(deps.pool, player.id, id, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
  });

  app.post('/ships/:id/undock', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => undockShip(deps.pool, player.id, id));
  });

  app.post('/ships/:id/warehouse', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => warehouseShip(deps.pool, player.id, id));
  });

  app.post('/ships/:id/retrieve', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () =>
      retrieveShip(deps.pool, player.id, id, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
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

  // ——— AMM L2+ (GB §13, DG §11.2) : seed, liquidité, échange.
  app.post('/planets/:id/buildings/:bid/amm', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, bid } = req.params as { id: string; bid: string };
    const parsed = ammSeedSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    const { slotIndex, ...seed } = parsed.data;
    return wrap(reply, () =>
      seedAmmPool(deps.pool, player.id, id, bid, slotIndex, seed),
    );
  });

  app.post('/planets/:id/buildings/:bid/amm-liquidity', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, bid } = req.params as { id: string; bid: string };
    const parsed = ammLiquiditySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    const { slotIndex, ...rest } = parsed.data;
    return wrap(reply, () =>
      ammLiquidity(deps.pool, player.id, id, bid, slotIndex, rest),
    );
  });

  app.post('/markets/:bid/amm-trade', async (req, reply) => {
    const player = await requirePlayer(req);
    const { bid } = req.params as { bid: string };
    const parsed = ammTradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      executeAmmTrade(
        deps.pool,
        player.id,
        bid,
        parsed.data.slotIndex,
        parsed.data.shipId,
        parsed.data.give,
        parsed.data.giveT,
      ),
    );
  });

  app.post('/planets/:id/amm-route', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = ammRouteSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      executeAmmRoute(
        deps.pool,
        player.id,
        id,
        parsed.data.shipId,
        parsed.data.give,
        parsed.data.get,
        parsed.data.giveT,
      ),
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
    // §15 v2 : mûrir la population d'un monde possédé (la natalité réelle
    // prendrait ~J+40 — chemin déterministe de test, jamais en prod).
    app.post('/test/grant-population', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          planetId: z.string().uuid(),
          total: z.number().min(0).max(100_000),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      const { planetId, total } = parsed.data;
      return wrap(reply, async () => {
        const client = await deps.pool.connect();
        try {
          await client.query('BEGIN');
          const nowMs = Date.now();
          const { rows: owned } = await client.query(
            `SELECT owner_id FROM bodies
             WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
            [planetId],
          );
          if (!owned[0] || owned[0].owner_id !== player.id) {
            throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
          }
          const snap = await recomputePlanetRates(client, planetId, nowMs);
          if (!snap) throw new CommandError('not_found', 'Planète inconnue');
          if (total === 0) {
            await extinguishPlanet(client, snap, nowMs);
          } else {
            const children = Math.round(total * STABLE_PYRAMID.children);
            const seniors = Math.round(total * STABLE_PYRAMID.seniors);
            await client.query(
              `UPDATE bodies SET population = $2, pop_children = $3,
                  pop_seniors = $4, pop_as_of = now() WHERE id = $1`,
              [planetId, total, children, seniors],
            );
            await recomputePlanetRates(client, planetId, nowMs);
          }
          await client.query('COMMIT');
          return { ok: true };
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      });
    });

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

    // Vieillit le COMPTE COURANT (jamais celui d'autrui) — la règle
    // canon « < 45 jours : pas de pods » se teste sans attendre 45 jours.
    app.post('/test/age-account', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({ days: z.number().int().min(1).max(3650) })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      await deps.pool.query(
        `UPDATE players SET created_at = created_at - make_interval(days => $2)
         WHERE id = $1`,
        [player.id, parsed.data.days],
      );
      return { ok: true };
    });

    // Fixe le réservoir d'une coque au u près (propriétaire seulement) —
    // rend l'échouage E2E déterministe sans attendre des jours réels.
    app.post('/test/ship-fuel', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          shipId: z.string().uuid(),
          units: z.number().min(0).max(10_000),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        await setShipFuelForTest(deps.pool, player.id, parsed.data.shipId, {
          units: parsed.data.units,
        });
        return { ok: true };
      });
    });

    app.post('/test/grant-npc', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          role: z.enum([
            'pilot',
            'engineer',
            'merchant',
            'diplomat',
            'soldier',
            'scientist',
          ]),
          rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        // Instrumentation §15 : un PNJ non hébergé pour le compte COURANT
        // (les rolls de pods sont seedés par playerId — non précomputables
        // dans un spec E2E). Champs identiques au vrai flux d'ouverture.
        const { rows } = await deps.pool.query<{ id: string }>(
          `INSERT INTO npcs (owner_id, people, role, rarity, stat_rolls)
           VALUES ($1, 'human', $2, $3, '{}') RETURNING id`,
          [player.id, parsed.data.role, parsed.data.rarity],
        );
        return { npcId: rows[0]!.id };
      });
    });

    app.post('/test/ship-hull', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          shipId: z.string().uuid(),
          hp: z.number().min(0).max(100_000),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        await setShipHullForTest(
          deps.pool,
          player.id,
          parsed.data.shipId,
          parsed.data.hp,
        );
        return { ok: true };
      });
    });

    app.post('/test/star-stock', async (req, reply) => {
      await requirePlayer(req);
      const parsed = z
        .object({
          starId: z.string().uuid(),
          stockU: z.number().min(0).max(1e9),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        await setStarStockForTest(deps.pool, parsed.data.starId, parsed.data.stockU);
        return { ok: true };
      });
    });

    app.post('/test/ship-survival', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({
          shipId: z.string().uuid(),
          foodT: z.number().min(0).max(10_000),
          waterT: z.number().min(0).max(10_000),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        await setShipSurvivalForTest(deps.pool, player.id, parsed.data.shipId, {
          foodT: parsed.data.foodT,
          waterT: parsed.data.waterT,
        });
        return { ok: true };
      });
    });

    app.post('/test/relocate-ship', async (req, reply) => {
      const player = await requirePlayer(req);
      const parsed = z
        .object({ shipId: z.string().uuid(), bodyId: z.string().uuid() })
        .safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
      return wrap(reply, async () => {
        await relocateShipForTest(
          deps.pool,
          player.id,
          parsed.data.shipId,
          parsed.data.bodyId,
        );
        return { ok: true };
      });
    });
  }

  app.post('/ships/:id/flee-policy', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z.object({ armed: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, async () => {
      await setFleePolicy(deps.pool, player.id, id, parsed.data.armed);
      return { ok: true };
    });
  });

  app.post('/ships/:id/auto-trade', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        rules: z
          .array(
            z.object({
              resource: z.string().min(1).max(64),
              belowT: z.number().min(0),
              buyT: z.number().positive(),
            }),
          )
          .max(3),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      setAutoTrade(
        deps.pool,
        player.id,
        id,
        parsed.data.rules as Parameters<typeof setAutoTrade>[3],
      ).then(() => ({ ok: true })),
    );
  });

  app.post('/ships/:id/dump', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ resource: z.string().min(1).max(64), tons: z.number().positive() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () => dumpCargo(deps.pool, player.id, id, parsed.data));
  });

  app.post('/ships/:id/junk-collector', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => fitJunkCollector(deps.pool, player.id, id));
  });

  app.post('/stargates', async (req, reply) => {
    const player = await requirePlayer(req);
    const parsed = z
      .object({ fromBodyId: z.string().uuid(), toBodyId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      buildStargate(deps.pool, player.id, parsed.data.fromBodyId, parsed.data.toBodyId, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
  });

  app.get('/stargate-proposals', async (req) => {
    const player = await requirePlayer(req);
    return listStargateProposals(deps.pool, player.id);
  });

  app.post('/stargate-proposals', async (req, reply) => {
    const player = await requirePlayer(req);
    const parsed = z
      .object({ fromBodyId: z.string().uuid(), toBodyId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      proposeStargate(deps.pool, player.id, parsed.data.fromBodyId, parsed.data.toBodyId),
    );
  });

  app.post('/stargate-proposals/:id/respond', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z.object({ accept: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      respondStargateProposal(deps.pool, player.id, id, parsed.data.accept, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
  });

  app.post('/stargate-proposals/:id/cancel', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () =>
      cancelStargateProposal(deps.pool, player.id, id).then(() => ({ ok: true })),
    );
  });

  app.post('/stargates/:id/toll', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        resource: z.string().min(1).max(64).nullable(),
        amount: z.number().min(0),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      setStargateToll(deps.pool, player.id, id, parsed.data).then(() => ({
        ok: true,
      })),
    );
  });

  app.post('/ships/:id/traverse', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ gateId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      traverseStargate(deps.pool, player.id, id, parsed.data.gateId, {
        tickMs: deps.config.TICK_MS,
      }),
    );
  });

  app.post('/ships/:id/claim-rig', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => fitClaimRig(deps.pool, player.id, id));
  });

  app.post('/ships/:id/claim', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ targetId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      startClaim(deps.pool, player.id, id, parsed.data.targetId, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
  });

  app.post('/ships/:id/collect-junk', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () =>
      collectJunk(deps.pool, player.id, id, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
  });

  app.post('/ships/:id/shield', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ kind: z.enum(['hot', 'cold', 'radio']) })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      fitShield(deps.pool, player.id, id, parsed.data.kind),
    );
  });

  app.post('/ships/:id/harvest-rig', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => fitHarvestRig(deps.pool, player.id, id));
  });

  app.post('/ships/:id/harvest', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ starId: z.string().uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      startHarvest(deps.pool, player.id, id, parsed.data.starId),
    );
  });

  app.post('/ships/:id/harvest/stop', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () =>
      stopHarvest(deps.pool, player.id, id).then(() => ({ ok: true })),
    );
  });

  app.post('/ships/:id/provision', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => provisionShip(deps.pool, player.id, id));
  });

  app.post('/ships/:id/refuel', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = refuelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      refuelShip(deps.pool, player.id, id, { units: parsed.data.units }),
    );
  });

  app.post('/ships/:id/transfer-fuel', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = transferFuelSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () => transferFuel(deps.pool, player.id, id, parsed.data));
  });

  app.get('/npcs', async (req) => {
    const player = await requirePlayer(req);
    return { npcs: await listNpcs(deps.pool, player.id) };
  });

  // Intel planétaire par paliers (GB §20) : palier 0 = 404, jamais 403
  // (pas d'oracle d'existence) ; la projection par liste blanche vit
  // côté partagé, le calcul du palier côté serveur.
  app.get('/bodies/:id/intel', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      intel: await bodyIntel(deps.pool, player.id, id, Date.now()),
    }));
  });

  // Pods de recrutement (GB §12/§13, DG §11.4) : barème dérivé du
  // census (impact immédiat des achats), ouverture payée depuis un
  // monde possédé — règles d'âge et de cap côté serveur.
  app.get('/pods/prices', async (req, reply) => {
    await requirePlayer(req);
    return wrap(reply, () => podPricing(deps.pool));
  });

  app.post('/pods/open', async (req, reply) => {
    const player = await requirePlayer(req);
    const parsed = podOpenSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      openPod(deps.pool, player.id, parsed.data, {
        universeSeed: deps.config.UNIVERSE_SEED,
      }),
    );
  });

  // Census global (GB §13, DG §11.5) : totaux GLOBAUX par ressource
  // uniquement — jamais de ventilation par planète/entrepôt/source.
  app.get('/census/latest', async (req) => {
    await requirePlayer(req);
    return {
      census: await latestCensus(deps.pool),
      perDay: deps.config.CENSUS_PER_DAY,
    };
  });

  app.post('/ships/:id/crew', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = crewSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, async () => {
      await assignCrew(deps.pool, player.id, id, parsed.data.npcId);
      return { ok: true };
    });
  });

  app.post('/ships/:id/colony-kit', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => fitColonyKit(deps.pool, player.id, id));
  });

  app.post('/ships/:id/settlers', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = settlersSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      transferSettlers(deps.pool, player.id, id, parsed.data),
    );
  });

  app.post('/ships/:id/colonize', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => {
      const r = await colonizeShip(deps.pool, player.id, id, {
        timeScale: deps.config.TIME_SCALE,
      });
      return { completesAt: r.completesAt.toISOString(), bodyId: r.bodyId };
    });
  });

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

  // ——— Gouvernance (GB §11, DG §4.1) : installation permanente + préview.
  app.post('/planets/:id/governors', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = governorSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      installGovernor(deps.pool, player.id, id, parsed.data.npcId),
    );
  });

  app.post('/planets/:id/governors/preview', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = governorPreviewSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      previewGovernance(deps.pool, player.id, id, parsed.data.npcIds),
    );
  });

  // ——— Canal manuel (GB §9, DG §6) : browse à quai, offres, résolution.
  app.get('/planets/:id/warehouse', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, () => browseWarehouse(deps.pool, player.id, id));
  });

  app.post('/planets/:id/manual-offers', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = manualOfferSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      createManualOffer(deps.pool, player.id, id, parsed.data),
    );
  });

  app.get('/planets/:id/manual-offers', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => ({
      offers: await listPlanetOffers(deps.pool, player.id, id),
    }));
  });

  app.get('/manual-offers', async (req, reply) => {
    const player = await requirePlayer(req);
    return wrap(reply, async () => ({
      offers: await listMyOffers(deps.pool, player.id),
    }));
  });

  app.post('/manual-offers/:id/respond', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    const parsed = manualRespondSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      respondManualOffer(deps.pool, player.id, id, parsed.data.action),
    );
  });

  app.post('/manual-offers/:id/cancel', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id } = req.params as { id: string };
    return wrap(reply, async () => {
      await cancelManualOffer(deps.pool, player.id, id);
      return { ok: true };
    });
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

  app.post('/planets/:id/buildings/:bid/retool', async (req, reply) => {
    const player = await requirePlayer(req);
    const { id, bid } = req.params as { id: string; bid: string };
    const parsed = retoolSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_input' });
    return wrap(reply, () =>
      retoolBuilding(deps.pool, player.id, id, bid, parsed.data.recipe, {
        timeScale: deps.config.TIME_SCALE,
      }),
    );
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
