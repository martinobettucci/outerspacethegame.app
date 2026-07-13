/**
 * Setup global E2E : démarre le tick worker (Playwright ne gère en
 * webServer que des processus à URL). TICK_MS court pour observer la
 * simulation ; instrumentation de test (CLAUDE.md §15), jamais utilisée
 * en production.
 */
import { spawn, type ChildProcess } from 'node:child_process';

let worker: ChildProcess | null = null;

export default async function globalSetup() {
  // detached : le worker devient chef de son groupe de processus — le
  // teardown tue le GROUPE (pnpm + tsx), pas seulement le wrapper pnpm.
  // Sans cela, des workers zombies (env figé au spawn) survivent aux runs
  // et réclament des événements avec de VIEUX intervalles.
  worker = spawn('pnpm', ['--filter', '@atg/server', 'dev:worker'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, TICK_MS: '500', TIME_SCALE: '7200' },
    stdio: 'ignore',
    detached: true,
  });
  return async () => {
    if (worker?.pid) {
      try {
        process.kill(-worker.pid, 'SIGTERM');
      } catch {
        /* déjà mort */
      }
    }
  };
}
