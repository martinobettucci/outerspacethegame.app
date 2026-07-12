/**
 * Tick worker — squelette (chunk A). La boucle réelle de traitement de la
 * file d'événements arrive avec le noyau de simulation (chunk B) ; ce
 * processus vérifie déjà la connexion et bat au rythme configuré, pour que
 * `runDev` lance la topologie complète dès maintenant.
 */
import { config } from '../config.js';
import { createPool } from '../db/pool.js';

const pool = createPool();
let running = true;

console.log(
  JSON.stringify({
    level: 'info',
    service: 'tick-worker',
    msg: 'démarrage',
    tickMs: config.TICK_MS,
  }),
);

async function heartbeat(): Promise<void> {
  await pool.query('SELECT 1');
}

while (running) {
  const started = Date.now();
  try {
    await heartbeat();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'tick-worker',
        msg: 'base injoignable',
        err: String(err),
      }),
    );
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
