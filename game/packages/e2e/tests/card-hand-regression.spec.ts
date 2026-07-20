/**
 * E2E — régression « carte déverrouillée invisible » (bug probe, 2026-07-20,
 * CLAUDE.md §16/§18).
 *
 * Contrat : une carte DÉJÀ DÉVERROUILLÉE mais momentanément impossible à
 * poser (ici `telescope` au plafond `maxInstances: 3`) doit RESTER dans la
 * main, désactivée AVEC sa raison visible — jamais disparaître. Avant le
 * correctif, elle basculait en `blocked` et le filtre de la main la jetait,
 * la rendant introuvable et inconstructible.
 *
 * `telescope` est un savoir de départ SANS tuile : « Place » construit
 * immédiatement (pas de sélection de tuile), et il plafonne à 3 instances —
 * scénario le plus court et le plus déterministe pour prouver le blocage
 * POST-unlock sans dépendre du stock exact du starter.
 */
import { expect, test, type Page } from '@playwright/test';
import { registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);
const email = `e2e-cardreg-${runId}@test.local`;

async function openStarter(page: Page): Promise<void> {
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
}

test('telescope au plafond maxInstances reste visible dans la main, avec sa raison', async ({
  page,
}) => {
  await registerSovereign(page, email, 'CardReg');
  await openStarter(page);

  const hand = page.getByRole('region', { name: 'Construction cards' });
  const teleCard = hand
    .getByRole('article')
    .filter({ hasText: /^telescope/i })
    .first();

  // Départ : déverrouillé et posable (savoir de départ, GB §19).
  await expect(teleCard).toBeVisible();
  const placeBtn = teleCard.getByRole('button', { name: 'Place' });
  await expect(placeBtn).toBeVisible();

  // Pose des 3 instances autorisées (sans tuile → build immédiat).
  for (let i = 0; i < 3; i++) {
    await teleCard.getByRole('button', { name: 'Place' }).click();
    await expect(page.getByRole('status')).toContainText('Construction started.');
    await page.waitForTimeout(400); // laisse le refresh recalculer la main
  }

  // CŒUR DE LA RÉGRESSION : la carte n'a PAS disparu de la main. Elle est
  // toujours là, désaturée, avec sa raison affichée et SANS bouton d'action.
  await expect(teleCard).toBeVisible();
  await expect(teleCard).toHaveAttribute('data-blocked', 'true');
  await expect(teleCard.locator('.ls-card-blocked')).toContainText('max 3');
  await expect(teleCard.getByRole('button', { name: 'Place' })).toHaveCount(0);

  await shot(page, 'cardreg-telescope-maxed-visible');

  // Preuve backend : le serveur a bien 3 telescopes (l'UI n'a pas menti).
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string }[];
  };
  const detail = (await page.request
    .get(`/api/planets/${me.planets[0]!.id}`)
    .then((r) => r.json())) as { buildings: { key: string }[] };
  expect(detail.buildings.filter((b) => b.key === 'telescope').length).toBe(3);
});
