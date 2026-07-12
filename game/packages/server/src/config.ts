/**
 * Configuration centralisée du serveur (CLAUDE.md §3 : configuration
 * centralisée, variables documentées dans game/.env.example).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Charge game/.env s'il existe (développement) ; les environnements
// staging/production injectent leurs variables directement.
const envFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.env',
);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://atg:atg@localhost:55432/atg'),
  API_PORT: z.coerce.number().int().positive().default(8080),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default('dev-only-secret-change-me-0123456789abcdef'),
  UNIVERSE_SEED: z.string().min(1).default('atg-dev-universe-0001'),
  TICK_MS: z.coerce.number().int().positive().default(60_000),
  /**
   * Accélérateur de temps DEV/TEST uniquement (instrumentation §15 :
   * observer en E2E des durées de plusieurs heures). 1 en production.
   * Divise les durées (construction, démolition…) au moment de la commande.
   */
  TIME_SCALE: z.coerce.number().positive().default(1),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Configuration invalide : ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join(' ; ')}`,
    );
  }
  return parsed.data;
}

export const config = loadConfig();
