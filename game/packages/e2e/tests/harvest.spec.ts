/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Star harvest & Starfall”; GAME_BOOK.md §22; DESIGN_GUIDE.md §8.8. */
/**
 * E2E — récolte stellaire & Starfall (GB §22, DG §8.8) : rig monté à
 * l'atelier (vraie commande, coût payé), vol RÉEL jusqu'à ~1 pc de
 * l'étoile de la poche (transit ×7200), récolte : taux POSITIF affiché
 * (« harvesting starlight », le drain court en jours réels), arrêt ;
 * flare ≤ 5 % (chip danger sous scope — la seule jauge de l'univers,
 * §15 star-stock) ; puis l'étoile s'éteint EN RÉCOLTANT : supernova —
 * l'étoile S disparaît de la galaxie (canon : ne laisse rien), le
 * récolteur est annihilé, le starter À R_nova exactement reste SAUF.
 */
import { expect, test } from '@playwright/test';
import { installRigViaPipeline, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('récolte : rig, gradient, flare, supernova — la tragédie des communs', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-hv-${runId}`,
    (av) => av.available.has('mine') && av.available.has('workshop'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Stardrinker');
  for (const [resource, tons] of [
    ['ore', 200],
    ['silicon', 40],
    ['steel_l', 60],
    ['crystal_temperate', 10],
    ['gold', 10],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop actif (prérequis tech : mine) — vraies commandes.
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpersImport(page, planetId);
  await board.unlockCard('mine');
  await board.unlockCard('workshop');
  await board.placeCard('workshop', board.tilePx(0));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'workshop')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // 2. Pilote + rig montés à quai (notices canon).
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel.getByRole('button', { name: /Assign pilot/ }).click();
  await expect(page.getByRole('status')).toContainText('Pilot bound');
  // Erratum 2026-07-22 : le rig est un ACCESSOIRE — item granté (§15)
  // puis installé par les vraies commandes (entrepôt → install → quai).
  await installRigViaPipeline(page, planetId, haulerId, 'harvest_rig');

  // 3. Vol réel jusqu'à ~1 pc de l'étoile de la poche (×7200 ≈ 20 s).
  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; bodyType: string; x: number; y: number; name: string }[];
  };
  const star = galaxy.bodies.find((b) => b.bodyType === 'star')!;
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 30 },
  });
  expect(sf.ok()).toBe(true);
  const mv = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: star.x + 1, y: star.y },
  });
  expect(mv.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('idle');

  // 4. Récolte : bouton avec préview du rendement, taux POSITIF affiché.
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel
    .getByRole('button', { name: new RegExp(`Harvest ${star.name}`) })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Rig deployed — drinking starlight.',
  );
  await expect(haulerPanel.getByText(/harvesting starlight/)).toBeVisible();
  await expect(haulerPanel.getByText(/\+91\.7 u\/day/)).toBeVisible();
  const harvesting = (await page.request
    .get('/api/fleet')
    .then((r) => r.json())) as {
    ships: { id: string; fuelRatePerDay: number; harvestingStarId: string | null }[];
  };
  const h = harvesting.ships.find((s) => s.id === haulerId)!;
  expect(h.fuelRatePerDay).toBeCloseTo(91.675, 2);
  expect(h.harvestingStarId).toBe(star.id);
  await shot(page, 'hv-01-harvesting-positive-rate');

  // 5. Arrêt : retour au drain idle.
  await haulerPanel.getByRole('button', { name: 'Stop harvest' }).click();
  await expect(page.getByRole('status')).toContainText('Rig retracted.');

  // 6. FLARE ≤ 5 % (instrumentation §15) : chip danger sur le panneau
  //    étoile — la seule jauge que l'univers donne (canon).
  const st = await page.request.post('/api/test/star-stock', {
    data: { starId: star.id, stockU: 100 },
  });
  expect(st.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`body:${star.id}`);
    await expect(
      page.getByText(/FLARING — the star is nearly spent/),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'hv-02-star-flaring');

  // 7. Starfall : l'étoile s'éteint pendant la récolte — supernova. Le
  //    récolteur est annihilé, l'étoile S disparaît, le starter est SAUF.
  const st2 = await page.request.post('/api/test/star-stock', {
    data: { starId: star.id, stockU: 0.0001 },
  });
  expect(st2.ok()).toBe(true);
  const hv = await page.request.post(`/api/ships/${haulerId}/harvest`, {
    data: { starId: star.id },
  });
  expect(hv.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const g = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
          bodies: { id: string }[];
        };
        return g.bodies.some((b) => b.id === star.id);
      },
      { timeout: 30_000 },
    )
    .toBe(false);
  const afterNova = (await page.request
    .get('/api/fleet')
    .then((r) => r.json())) as { ships: { id: string }[] };
  expect(afterNova.ships.some((s) => s.id === haulerId)).toBe(false);
  const g2 = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; owned: boolean }[];
  };
  expect(g2.bodies.find((b) => b.id === planetId)?.owned).toBe(true);
  await page.reload();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, 'hv-03-after-supernova');
});

// L'import est en bas pour garder l'en-tête lisible (helpers communs).
import { boardHelpers as boardHelpersImport } from './lib.js';
