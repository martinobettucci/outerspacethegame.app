/** @verifies This test file verifies: docs/MASTER_PLAN.md §R4 (E2E visuel du spawn); DESIGN_GUIDE.md §2.2/§3.2-v2; GAME_BOOK.md §12. */
/**
 * E2E — R4, le SPAWN vu par le joueur (contrat visuel, §16) : un compte
 * neuf arrive sur un monde natal vivant — population 350 sur la
 * pyramide STATIONNAIRE, grâce de colonie affichée, ADN de départ,
 * tuiles libres, main de cartes des premiers pas, flotte de naissance
 * (vaisseau personnel + First hauler) visible sur la carte. Captures
 * planète + galaxie observées.
 */
import { expect, test } from '@playwright/test';
import { STARTER_POP } from '@atg/shared';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('spawn : monde natal vivant, pyramide 350, grâce, ADN, flotte de naissance', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const email = pickEmailByDna(`e2e-sp-${runId}`, () => true, 0);
  await registerSovereign(page, email, 'Newborn', 'Scientific');

  // --- Galaxie : la flotte de naissance existe et est visible -------------
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { name: string; hullCategory: string; status: string }[];
  };
  expect(fleet.ships.some((s) => s.hullCategory === 'personal')).toBe(true);
  expect(fleet.ships.some((s) => s.name === 'First hauler')).toBe(true);
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await shot(page, 'sp-01-spawn-galaxy');

  // --- Planète : population, grâce, ADN, premiers pas ---------------------
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions|Codex/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  // Population de départ EXACTE (constante partagée — anti-dérive) ; la
  // CAP affichée varie par monde (popCap(size, quality)) — non assertée.
  await expect(
    page.getByText(new RegExp(`^${STARTER_POP}\\s*/`)).first(),
  ).toBeVisible();
  // Grâce de colonie affichée avec une échéance.
  await expect(page.getByText(/Colony grace until/)).toBeVisible();
  // ADN de départ (chip Technology DNA avec compteur).
  await expect(page.getByText(/Technology\s*DNA/i)).toBeVisible();
  // Main des premiers pas : les cartes de départ sont là.
  const dock = page.getByRole('region', { name: 'Construction cards' });
  await expect(dock).toBeVisible();
  await expect(dock.locator('.ls-construction-card')).not.toHaveCount(0);
  // Le guide des premiers pas est affiché (mine d'abord).
  await expect(page.getByText(/First steps — place a Mine/)).toBeVisible();
  await shot(page, 'sp-02-spawn-planet');
});
