/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Recruitment pods”; GAME_BOOK.md §12/§13/§19; DESIGN_GUIDE.md §11.4. */
/**
 * E2E — pods de recrutement (GB §12/§13, DG §11.4) : barème dérivé du
 * census dans l'onglet Recruitment, refus « compte trop jeune » (45 j,
 * règle canon — VISIBLE), vieillissement par instrumentation §15, pod
 * ouvert (carte de révélation : rôle/rareté/peuple/stat), roster mis à
 * jour avec la liaison de compte 60 j, refus anonymes directs.
 */
import { expect, test } from '@playwright/test';
import { registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('pods : le puits de ressources produit un personnage', async ({ page }) => {
  test.setTimeout(120_000);

  const planetId = await registerSovereign(
    page,
    `e2e-pods-${runId}@test.local`,
    'Recruteur',
  );
  const g = await page.request.post('/api/test/grant', {
    data: { planetId, resource: 'ore', tons: 500 },
  });
  expect(g.ok()).toBe(true);

  // 1. Market → Recruitment : le barème (dérivé du census) apparaît dès
  // que le worker a produit un snapshot (≤ ~4 s à l'échelle E2E).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail.getByRole('button', { name: 'Market', exact: true }).click();
  await page.getByRole('button', { name: 'Recruitment' }).click();
  await expect(async () => {
    if (await page.getByLabel(/Pay with/).isVisible().catch(() => false)) return;
    await page.getByRole('button', { name: 'Census' }).click();
    await page.getByRole('button', { name: 'Recruitment' }).click();
    await expect(page.getByLabel(/Pay with/)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // 2. Compte neuf : le verrou est EXPLIQUÉ avant toute interaction.
  await page.getByLabel(/Pay with/).selectOption('ore');
  const ageLock = page.getByTestId('recruit-age-lock');
  await expect(ageLock).toContainText('at least 45 days old');
  await expect(ageLock).toContainText('Recruitment unlocks on');
  await expect(page.getByRole('button', { name: /Open pod/ })).toBeDisabled();
  await shot(page, 'pod-01-too-young');

  // Refus direct (§10) : désactiver le bouton ne remplace jamais la règle
  // serveur autoritative.
  const refused = await page.request.post('/api/pods/open', {
    data: { planetId, resource: 'ore' },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).message).toContain('Compte trop jeune');

  // 3. Instrumentation §15 : vieillir LE compte courant, puis ouvrir.
  const aged = await page.request.post('/api/test/age-account', {
    data: { days: 46 },
  });
  expect(aged.ok()).toBe(true);
  await page.getByRole('button', { name: 'Census' }).click();
  await page.getByRole('button', { name: 'Recruitment' }).click();
  await expect(ageLock).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open pod/ })).toBeEnabled();
  await page.getByRole('button', { name: /Open pod/ }).click();
  await expect(page.getByRole('status')).toContainText(
    'Pod opened — a recruit steps out.',
    { timeout: 10_000 },
  );
  // Carte de révélation : rareté + stat visibles ; roster à 2 personnages
  // (le pilote du spawn + la recrue), la recrue liée au compte 60 j.
  await expect(page.getByText(/account-bound until/).first()).toBeVisible();
  const npcs = (await page.request.get('/api/npcs').then((r) => r.json())) as {
    npcs: { accountBoundUntil: string | null }[];
  };
  expect(npcs.npcs.length).toBe(2);
  expect(npcs.npcs.filter((n) => n.accountBoundUntil !== null).length).toBe(1);
  await shot(page, 'pod-02-opened');

  // 4. Refus directs (§10) : le barème et l'ouverture exigent la session.
  const anonCtx = await page.context().browser()!.newContext();
  const anonPrices = await anonCtx.request.get(
    'http://localhost:5173/api/pods/prices',
  );
  expect(anonPrices.status()).toBe(401);
  const anonOpen = await anonCtx.request.post(
    'http://localhost:5173/api/pods/open',
    { data: { planetId, resource: 'ore' } },
  );
  expect(anonOpen.status()).toBe(401);
  await anonCtx.close();
});
