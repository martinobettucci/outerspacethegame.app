import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const CAPTURES = new URL('../captures/', import.meta.url).pathname;
mkdirSync(CAPTURES, { recursive: true });

test('la coquille applicative se charge et établit la liaison serveur', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ATG — Across The Galaxies/);
  await expect(
    page.getByRole('heading', { name: 'ATG — Across The Galaxies' }),
  ).toBeVisible();
  // État de liaison : réussite attendue quand l'API tourne.
  await expect(page.getByText('Server link established.')).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({
    path: `${CAPTURES}/shell-ready.jpeg`,
    type: 'jpeg',
    quality: 90,
  });
});

test("l'état d'erreur est explicite quand l'API est injoignable", async ({
  page,
}) => {
  // Coupe la route API pour observer l'état d'erreur (CLAUDE.md §16 :
  // vérifier les états d'erreur).
  await page.route('**/api/ready', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByText('The game server is unreachable', { exact: false }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.screenshot({
    path: `${CAPTURES}/shell-error.jpeg`,
    type: 'jpeg',
    quality: 90,
  });
});
