/** @spec All declarations and algorithms in this file implement: docs/DAT.md §2/§4/§5; docs/BACKLOG.md §P1–§P4. */
import { config } from '../config.js';
import { createPool } from '../db/pool.js';
import { buildServer } from './server.js';

const pool = createPool();
const app = await buildServer({ pool, config });

try {
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
