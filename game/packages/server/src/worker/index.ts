/**
 * Tick worker — avance la simulation en traitant la file d'événements
 * (DG §1). Cadence de réveil = TICK_MS (60 s canon ; abaissable en dev/E2E).
 * Plusieurs workers peuvent tourner : FOR UPDATE SKIP LOCKED partitionne.
 */
import { GAME_DAY_SECONDS } from '@atg/shared';
import { config } from '../config.js';
import { createPool } from '../db/pool.js';
import { processDueEvents } from '../sim/events.js';
import { baseHandlers, censusRun, survivalLow } from '../sim/handlers.js';

const pool = createPool();
// Census : CENSUS_PER_DAY snapshots/jour [TUNE], divisé par TIME_SCALE.
const censusIntervalMs =
  (GAME_DAY_SECONDS * 1000) / config.CENSUS_PER_DAY / config.TIME_SCALE;
const handlers = {
  ...baseHandlers(),
  census_run: censusRun(censusIntervalMs),
  survival_low: survivalLow(config.TIME_SCALE),
};
let running = true;

const log = (level: 'info' | 'error', msg: string, extra: object = {}) =>
  console.log(
    JSON.stringify({ level, service: 'tick-worker', msg, ...extra }),
  );

log('info', 'démarrage', { tickMs: config.TICK_MS });

// Auto-réparation de la récurrence : la migration 009 amorce le premier
// census_run, mais un DELETE FROM events (tests d'intégration sur la base
// de dev partagée) tuerait la chaîne — ré-amorçage idempotent au boot.
await pool.query(
  `INSERT INTO events (due_at, kind, payload)
   SELECT now(), 'census_run', '{}'::jsonb
   WHERE NOT EXISTS (
     SELECT 1 FROM events WHERE kind = 'census_run' AND processed_at IS NULL
   )`,
);
// Re-clamp : un worker à AUTRE échelle (runDev à TIME_SCALE=1 vs E2E à
// 7200) peut avoir replanifié le prochain census à des heures — chaque
// worker ramène la chaîne dans SON intervalle au boot (auto-guérison,
// observé après un runDev from-scratch sur la base partagée).
await pool.query(
  `UPDATE events SET due_at = now()
   WHERE kind = 'census_run' AND processed_at IS NULL
     AND due_at > now() + make_interval(secs => $1 / 1000.0)`,
  [censusIntervalMs],
);

while (running) {
  const started = Date.now();
  try {
    const { processed, failed } = await processDueEvents(pool, handlers);
    if (processed > 0 || failed > 0) {
      log('info', 'tick', { processed, failed, ms: Date.now() - started });
    }
  } catch (err) {
    log('error', 'échec du tick', { err: String(err) });
  }
  const elapsed = Date.now() - started;
  await new Promise((r) => setTimeout(r, Math.max(0, config.TICK_MS - elapsed)));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    running = false;
    await pool.end();
    process.exit(0);
  });
}
