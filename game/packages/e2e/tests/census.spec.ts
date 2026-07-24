/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Global census”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.5. */
/**
 * E2E — census global (GB §13, DG §11.5) : l'écran Market/Census publie
 * des totaux GLOBAUX par ressource, exhaustifs (catalogue entier, zéros
 * inclus), rafraîchis par l'événement récurrent (cadence E2E : 3 s à
 * TIME_SCALE=7200). Rerun-tolérant : les snapshots s'accumulent et le
 * total est GLOBAL (assertions de monotonie, jamais d'égalité stricte).
 */
import { expect, test } from '@playwright/test';
import { ALL_RESOURCE_IDS } from '@atg/shared';
import { registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('census : totaux globaux publiés, rafraîchis, jamais ventilés', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const planetId = await registerSovereign(
    page,
    `e2e-census-${runId}@test.local`,
    'Recenseur',
  );

  // 1. Rail → Market (désormais actif) → onglet Census.
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail.getByRole('button', { name: 'Market', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Market' })).toBeVisible();
  // Onglets Trading/Auctions désactivés AVEC la raison.
  await expect(page.getByRole('button', { name: /Trading —/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Auctions —/ })).toBeDisabled();

  // 2. La table apparaît (le worker produit un snapshot ≤ ~4 s) —
  // catalogue EXHAUSTIF : une ligne par ressource.
  await expect(page.getByText('Snapshot taken')).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText('Global totals only — per-planet breakdowns are never published.'),
  ).toBeVisible();
  // Un instantané ANTÉRIEUR à un élargissement du catalogue peut être
  // encore « latest » au chargement : on attend celui du catalogue
  // COURANT (le worker en produit un toutes les ~3 s en dev).
  await expect
    .poll(async () => page.locator('tbody tr').count(), { timeout: 20_000 })
    .toBe(ALL_RESOURCE_IDS.length);

  // 3. Effet backend déterministe : +500 T de GOLD, puis un PROCHAIN
  // snapshot doit le refléter — l'API publie la vérité. Gold et pas ore :
  // aucune recette CONTINUE ne consomme l'or (seuls des crafts ponctuels
  // d'ITEMS), et les flux census sont conservatifs (fret/marché déplacent
  // sans détruire) — le total ne peut que monter. L'ore, lui, est dévoré
  // par les usines de tout l'univers dev accumulé à ×7200 : un +500
  // disparaissait dans le bruit (flake observé, session 36).
  const before = (await page.request
    .get('/api/census/latest')
    .then((r) => r.json())) as {
    census: { takenAt: string; totals: Record<string, number> };
  };
  const g = await page.request.post('/api/test/grant', {
    data: { planetId, resource: 'gold', tons: 500 },
  });
  expect(g.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const now = (await page.request
          .get('/api/census/latest')
          .then((r) => r.json())) as {
          census: { takenAt: string; totals: Record<string, number> };
        };
        return (
          now.census.takenAt > before.census.takenAt &&
          (now.census.totals.gold ?? 0) >= (before.census.totals.gold ?? 0) + 500
        );
      },
      { timeout: 45_000 },
    )
    .toBe(true);

  // 4. L'UI suit (poll 5 s côté client) : le total d'ore affiché devient
  // ≥ 500 (total GLOBAL — d'autres comptes en produisent aussi).
  const oreCell = page
    .locator('tr', { has: page.getByRole('rowheader', { name: 'Ore', exact: true }) })
    .locator('td')
    .last();
  await expect
    .poll(
      async () =>
        Number(((await oreCell.textContent()) ?? '0').replace(/,/g, '')),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(500);
  await shot(page, 'cen-01-census-table');

  // 5. Autorisation (§10, requête directe hors session) : le contexte
  // anonyme reçoit 401 — la publication est « in-game ».
  const anonCtx = await page.context().browser()!.newContext();
  const anon = await anonCtx.request.get('http://localhost:5173/api/census/latest');
  expect(anon.status()).toBe(401);
  await anonCtx.close();
});
