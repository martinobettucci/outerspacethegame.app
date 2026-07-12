import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import type pg from 'pg';
import type { Config } from '../config.js';

export interface ServerDeps {
  pool: pg.Pool;
  config: Config;
}

/**
 * Construit l'instance Fastify (injectable pour les tests). Toute règle
 * d'autorisation du jeu est appliquée ici ou en base — jamais seulement
 * dans l'interface (CLAUDE.md §10).
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

  return app;
}
