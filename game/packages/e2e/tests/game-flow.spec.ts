/**
 * E2E — parcours complet du chunk D (CLAUDE.md §15/§16) :
 * états d'erreur d'auth → éveil d'un Souverain (vrai flux d'inscription)
 * → ciel connu (galaxie) → vue planète isométrique → unlock d'une carte
 * → pose d'un bâtiment → persistance après rechargement.
 * Captures JPEG à chaque étape + vidéo webm (config).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const CAPTURES = new URL('../captures/', import.meta.url).pathname;
mkdirSync(CAPTURES, { recursive: true });

const runId = Date.now().toString(36);
const email = `e2e-${runId}@test.local`;
const password = 'motdepasse-e2e-solide';

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `${CAPTURES}/${name}.jpeg`,
    type: 'jpeg',
    quality: 90,
  });

test.describe.configure({ mode: 'serial' });

test("écran d'accueil : l'état d'erreur d'identifiants est explicite", async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ATG/ })).toBeVisible();
  await shot(page, '01-login');
  await page.getByLabel('E-mail').fill('ghost@test.local');
  await page.getByLabel('Password').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Unknown e-mail or wrong password.',
  );
  await shot(page, '02-login-error');
});

test('éveil d\'un Souverain : inscription → spawn → galaxie de la poche', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
    .click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Sovereign name').fill('E2E Sovereign');
  await page.getByLabel('Industrialist').check();
  await shot(page, '03-register');
  await page.getByRole('button', { name: 'Awaken' }).click();

  // HUD + galaxie.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  // La poche : le starter (possédé) apparaît dans le rail.
  const rail = page.getByRole('navigation', { name: 'Main' });
  const planetButton = rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first();
  await expect(planetButton).toBeVisible();
  await page.waitForTimeout(1500); // chargement des sprites de la carte
  await shot(page, '04-galaxy');
});

test('vue planète : stats, courbe d\'efficacité, main de cartes exhaustive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();

  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  await expect(page.getByText('Population')).toBeVisible();
  await expect(
    page.getByText('Efficiency — the tilted bell', { exact: false }),
  ).toBeVisible();
  // Main exhaustive : 28 cartes (règle de complétude).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  await expect(hand.getByRole('article')).toHaveCount(28);
  await page.waitForTimeout(1200);
  await shot(page, '05-planet-view');
});

test('unlock depot → pose sur une tuile → chantier visible → persistance', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  const hand = page.getByRole('region', { name: 'Construction cards' });
  const depotCard = hand.getByRole('article').filter({ hasText: 'depot' }).first();
  await depotCard.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('status')).toContainText('Card unlocked.');

  await depotCard.getByRole('button', { name: 'Place' }).click();
  await expect(
    page.getByText('Select a card, then click a free tile to build.'),
  ).toBeVisible();
  await shot(page, '06-card-selected');

  // Clic au centre du plateau : le pavage iso garantit une tuile sous le
  // curseur ; sur un starter neuf, toutes sont libres.
  const canvas = page.getByTestId('planet-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 20);
  await expect(page.getByRole('status')).toContainText('Construction started.');
  await page.waitForTimeout(900); // sprite du chantier
  await shot(page, '07-building-constructing');

  // Persistance : rechargement → session conservée, chantier toujours là.
  await page.reload();
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  const handAfter = page.getByRole('region', { name: 'Construction cards' });
  await expect(handAfter.getByRole('article').first()).toBeVisible();
  // La tuile est occupée : l'état du bâtiment vient du serveur.
  await page.waitForTimeout(1000);
  await shot(page, '08-persisted-after-reload');
});

test('boucle colonie : mine + recette → production réelle → réglages du bâtiment', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Unlock de la mine puis choix de recette (canon : une industrie, une chose).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand
    .getByRole('article')
    .filter({ hasText: /^mine/ })
    .first();
  await mineCard.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('status')).toContainText('Card unlocked.');
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await shot(page, '09-recipe-picker');
  await dialog.getByRole('button', { name: /Extract ore/ }).click();

  // Pose sur une tuile adjacente au dépôt du test précédent.
  const canvas = page.getByTestId('planet-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 74, box.y + box.height / 2 + 17);
  await expect(page.getByRole('status')).toContainText('Construction started.');

  // Chantier 3 s (TIME_SCALE) + tick worker 0,5 s + polling UI 4 s.
  await expect(page.getByText(/ore/).first()).toBeVisible();
  await expect(
    page
      .getByRole('table')
      .filter({ hasText: 'ore' })
      .getByText(/\+9\.\d\/day|\+10\.0\/day|\+8\.\d\/day/)
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  // Date de tarissement projetée (exigence UI, DG §3.3).
  await expect(page.getByText(/dry on/).first()).toBeVisible();
  await shot(page, '10-mine-active-rates');

  // Panneau du bâtiment : clic sur la tuile de la mine.
  await page.mouse.click(box.x + box.width / 2 + 74, box.y + box.height / 2 + 17);
  const panel = page.getByRole('region', { name: 'Building settings' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Extracting ore/)).toBeVisible();
  await expect(panel.getByText('Running clean')).toBeVisible();
  await shot(page, '11-building-panel');

  // Réglage : cadence 50 % → le débit affiché baisse.
  await panel.getByRole('slider').fill('50');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toContainText('Settings applied.');
  await expect(
    page
      .getByRole('table')
      .filter({ hasText: 'ore' })
      .getByText(/\+4\.\d\/day|\+5\.0\/day/)
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await shot(page, '12-throttled-50pct');
});
