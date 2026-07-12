/**
 * Setup global E2E : démarre le tick worker (Playwright ne gère en
 * webServer que des processus à URL). TICK_MS court pour observer la
 * simulation ; instrumentation de test (CLAUDE.md §15), jamais utilisée
 * en production.
 */
import { spawn, type ChildProcess } from 'node:child_process';

let worker: ChildProcess | null = null;

export default async function globalSetup() {
  worker = spawn('pnpm', ['--filter', '@atg/server', 'dev:worker'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, TICK_MS: '500' },
    stdio: 'ignore',
    detached: false,
  });
  return async () => {
    worker?.kill('SIGTERM');
  };
}
