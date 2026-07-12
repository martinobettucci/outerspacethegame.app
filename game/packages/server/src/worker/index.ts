/**
 * Tick worker — avance la simulation en traitant la file d'événements
 * (DG §1). Cadence de réveil = TICK_MS (60 s canon ; abaissable en dev/E2E).
 * Plusieurs workers peuvent tourner : FOR UPDATE SKIP LOCKED partitionne.
 */
import { config } from '../config.js';
import { createPool } from '../db/pool.js';
import { processDueEvents } from '../sim/events.js';
import { baseHandlers } from '../sim/handlers.js';

const pool = createPool();
const handlers = baseHandlers();
let running = true;

const log = (level: 'info' | 'error', msg: string, extra: object = {}) =>
  console.log(
    JSON.stringify({ level, service: 'tick-worker', msg, ...extra }),
  );

log('info', 'démarrage', { tickMs: config.TICK_MS });

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
