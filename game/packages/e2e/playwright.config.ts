/** @spec All declarations and algorithms in this file implement: CLAUDE.md §15/§16; docs/DAT.md §6. */
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
  // Un seul navigateur : l'API + le tick worker avancent les récurrences de
  // TOUT l'univers dev accumulé à ×7200. Deux workers suffisaient avant la
  // suite population/Codex, mais provoquent désormais une contention mesurée
  // sur les échéances longues ; le DoD doit rester reproductible par défaut.
  workers: 1,
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
      // API_PORT/ATG_API_PORT 8081 : 8080 peut être squatté par un
      // service étranger de la machine hôte (WSL réseau miroir).
      command:
        'TIME_SCALE=7200 ATG_TEST_ENDPOINTS=1 API_PORT=8081 pnpm --filter @atg/server dev:api',
      cwd: '../..',
      url: 'http://localhost:8081/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'ATG_API_PORT=8081 pnpm --filter @atg/client dev',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
