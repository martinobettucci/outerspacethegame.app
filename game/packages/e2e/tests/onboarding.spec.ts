/**
 * Onboarding anti-softlock (GB §19 « starter knowledge », chunk AN) :
 * un Souverain NEUF doit pouvoir poser sa mine SANS unlock (savoir de
 * départ), guidé par le bandeau « First steps » qui disparaît une fois
 * la mine posée ; le programme colonial est expliqué (objectif de
 * milieu de partie). Preuves par l'UI ET par l'état de l'API.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, registerSovereign, shot } from './lib.ts';

test('premiers pas : mine posable sans unlock, bandeau guidant puis dissous', async ({
  page,
}) => {
  const email = `onboarding-an-${Date.now()}@test.local`;
  const planetId = await registerSovereign(page, email, 'FirstSteps');

  // Entrer sur le monde starter (rail de navigation principal).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  // Un balayage E2E complet peut laisser le worker finir plusieurs rebases
  // avant de servir le détail du starter. Attendre l'écran métier, sans
  // confondre le délai de chargement avec une régression d'onboarding.
  await expect(page.getByTestId('planet-canvas')).toBeVisible({
    timeout: 30_000,
  });

  // 1. Le bandeau « premiers pas » guide l'ouverture.
  const hint = page.getByTestId('first-steps-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('place a Mine on a deposit first');
  await shot(page, 'onb-01-first-steps-hint');

  // 2. Savoir de départ : la carte mine n'offre PAS « Unlock » — la pose
  //    est directe (l'API confirme le savoir pré-acquis).
  const detail = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { tech: { unlocked: string[] } };
  for (const key of ['telescope', 'probe_pad', 'depot', 'mine']) {
    expect(detail.tech.unlocked, key).toContain(key);
  }
  expect(detail.tech.unlocked).not.toContain('colony_program');

  const board = await boardHelpers(page, planetId);
  const mineCard = board.hand
    .getByRole('article')
    .filter({ hasText: /^mine/ })
    .first();
  await expect(mineCard.getByRole('button', { name: 'Place' })).toBeVisible();
  await expect(mineCard.getByRole('button', { name: 'Unlock' })).toHaveCount(0);

  // 3. Poser la mine (recette ore) — le flux réel : Place ouvre le
  //    sélecteur de recette (canon : une industrie, une chose).
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract ore/ }).click();
  const [tileX, tileY] = board.tilePx(0);
  await expect(async () => {
    await page.mouse.click(tileX, tileY);
    expect(await board.hasBuilding('mine')).toBe(true);
  }).toPass({ timeout: 40_000 });
  await shot(page, 'onb-02-mine-placed');

  // 4. Le bandeau s'efface : l'ouverture est lancée (polling UI 4 s).
  await expect(hint).toHaveCount(0, { timeout: 10_000 });

  // 5. Le programme colonial est expliqué (plus de carte muette) — la
  //    capture doit MONTRER la preuve (§16) : scroller la section au cadre.
  const colonyDesc = page.getByText('A mid-game goal, not a building', {
    exact: false,
  });
  await expect(colonyDesc).toBeVisible();
  await colonyDesc.scrollIntoViewIfNeeded();
  await shot(page, 'onb-03-colony-program-explained');
});
