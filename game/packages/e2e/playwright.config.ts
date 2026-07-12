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
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
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
