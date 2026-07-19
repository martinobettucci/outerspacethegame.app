import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * E2E ATG. Prérequis : base Postgres de dev démarrée (pnpm runDev:db),
 * migrations appliquées. Playwright démarre lui-même l'API et le client.
 *
 * Viewport 1440×900 : desktop, dans la cible ≥1280×800 (DESIGN_SYSTEM §7).
 */
const chromiumPath = ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find(
  (p) => existsSync(p),
);

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  // 2 navigateurs max : au-delà, l'API + le tick worker (qui avance les
  // récurrences de TOUT l'univers dev accumulé à ×7200) et les scènes
  // three.js se disputent le CPU — les hit-tests de sprites et la cadence
  // census deviennent flaky (observé après la refonte UI, session 36).
  workers: 2,
  retries: 0,
  reporter: [['list']],
  // 120 s : la scène planète au sol organique (chunk X) est plus lourde —
  // à 2 workers sous WSL2, « boucle colonie » (16,8 s en solo) dépassait
  // les 60 s par contention CPU (diagnostiqué session 38, flake pur).
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    video: 'on',
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath } }
      : {}),
  },
  webServer: [
    {
      // TIME_SCALE + endpoints de test : instrumentation §15 (6 h → 3 s ;
      // grants déterministes pour les parcours coûteux type chantier naval).
      command: 'TIME_SCALE=7200 ATG_TEST_ENDPOINTS=1 pnpm --filter @atg/server dev:api',
      cwd: '../..',
      url: 'http://localhost:8080/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @atg/client dev',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
