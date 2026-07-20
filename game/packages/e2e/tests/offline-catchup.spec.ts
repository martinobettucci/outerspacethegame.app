/**
 * E2E — rattrapage hors-ligne (GB §15, DG §1) : le Souverain lance des
 * travaux (mine en chantier, extraction déjà active, quille de chantier
 * naval), SE DÉCONNECTE, et revient plus tard : tout a avancé SANS lui —
 * les ÉVÉNEMENTS (construction, chantier naval) ont été traités par le
 * worker (échelle ×7200), et le stock LAZY a suivi exactement
 * taux × Δt_réel (jours réels — zéro dérive, la matérialisation
 * n'introduit aucun saut). L'exactitude mathématique du rattrapage est
 * prouvée en intégration (colony-loop) ; ici, la preuve UTILISATEUR.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, E2E_PASSWORD, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('hors-ligne : les travaux avancent, le stock lazy suit sans dérive', async ({
  page,
}) => {
  test.setTimeout(480_000);

  const email = pickEmailByDna(
    `e2e-off-${runId}`,
    (av) => av.available.has('shipyard') && av.available.has('spaceport'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Sleeper');
  for (const [resource, tons] of [
    ['ore', 400],
    ['steel_l', 200],
    ['silicon', 40],
    ['fuel_cells', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Mine qui EXTRAIT déjà (taux réel), + chantiers en cours au moment
  // du logout : un spaceport en construction et une quille de Cargo S.
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  for (const key of ['depot', 'mine', 'spaceport', 'shipyard']) {
    await board.unlockCard(key);
  }
  // Mine d'abord (recette ore) — elle doit être ACTIVE avant le départ.
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand.getByRole('article').filter({ hasText: /^mine/ }).first();
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract ore/ }).click();
  const [t0x, t0y] = board.tilePx(0);
  await expect(async () => {
    await page.mouse.click(t0x, t0y);
    await expect(page.getByRole('status')).toContainText('Construction started.', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 40_000 });
  await board.placeCard('shipyard', board.tilePx(1));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return ['mine', 'shipyard']
          .map((k) => d.buildings.find((b) => b.key === k)?.status ?? '?')
          .join(',');
      },
      { timeout: 60_000 },
    )
    .toBe('active,active');
  // La mine emploie du monde (sinon taux nul) — réglage réel via l'UI.
  await board.openPanel(board.tilePx(0), /mine · L1/);
  await board.panel.getByLabel(/Workforce/).fill('35');
  await board.panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toContainText('Settings applied');

  // Quille + spaceport lancés MAINTENANT (ils s'achèveront hors-ligne).
  await board.openPanel(board.tilePx(1), /shipyard · L1/);
  const yard = board.panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await yard.getByLabel('Category').selectOption('cargo');
  await yard.getByLabel('Size').selectOption('s');
  const keelName = `Sleepwalker ${runId}`;
  await yard.getByLabel('Ship name').fill(keelName);
  await expect(async () => {
    await yard.getByRole('button', { name: 'Lay the keel' }).click();
    await expect(page.getByRole('status')).toContainText('Keel laid', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await board.placeCard('spaceport', board.tilePx(2));

  // 2. État témoin PUIS déconnexion.
  const before = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    stock: Record<string, { amount: number; ratePerDay: number }>;
  };
  const oreBefore = before.stock.ore.amount;
  const oreRate = before.stock.ore.ratePerDay;
  expect(oreRate).toBeGreaterThan(0); // la mine extrait réellement
  const tLogout = Date.now();
  await shot(page, 'off-01-works-pending');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByLabel('E-mail')).toBeVisible();

  // 3. Absence RÉELLE. Les événements courent à ×7200 ; le stock lazy,
  // lui, court en jours réels (GB §15). Le débit dépend du gisement et du
  // frein de stockage : calculer une absence qui garantit > 0,01 T évite
  // qu'un débit légitimement < 9,6 T/j reste invisible après l'arrondi API.
  const observableDeltaT = 0.012;
  const offlineMs = Math.max(
    120_000,
    Math.ceil((observableDeltaT / oreRate) * 86_400_000),
  );
  expect(offlineMs).toBeLessThan(300_000);
  await page.waitForTimeout(offlineMs);

  // 4. Retour : tout a avancé sans nous.
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(rail).toBeVisible({ timeout: 10_000 });
  const tReturn = Date.now();

  // Événements rattrapés : spaceport ACTIF, vaisseau NÉ à quai.
  const after = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    buildings: { key: string; status: string }[];
    stock: Record<string, { amount: number; ratePerDay: number }>;
  };
  expect(after.buildings.find((b) => b.key === 'spaceport')?.status).toBe(
    'active',
  );
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { name: string; status: string }[];
  };
  expect(fleet.ships.find((s) => s.name === keelName)?.status).toBe('docked');

  // Stock lazy SANS dérive : amount ≈ témoin + taux × Δt_réel (jours).
  // Tolérance : arrondi API 2 décimales + le rebase d'activation du
  // spaceport a rejoué les bords (jamais la valeur).
  const elapsedDays = (tReturn - tLogout) / 86_400_000;
  const expected = oreBefore + oreRate * elapsedDays;
  // « Ça a coulé » à la précision de l'API (2 décimales) ; le zéro-dérive
  // est la borne |mesuré − projeté| — l'exactitude au 1e-9 près est
  // prouvée en intégration (colony-loop, rattrapage hors-ligne).
  expect(after.stock.ore.amount).toBeGreaterThan(oreBefore + 0.005);
  expect(Math.abs(after.stock.ore.amount - expected)).toBeLessThan(0.05);

  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  await page.waitForTimeout(2_000);
  await shot(page, 'off-02-caught-up');
});
