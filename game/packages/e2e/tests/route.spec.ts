/**
 * E2E — routage cells-étoile & nudge triade (GB §13, DG §11.2) : deux
 * pools ore/cells + cells/water SANS pool direct ore/water ; le nudge
 * triade (aucune paire FOOD au télescope) est VISIBLE sur le panneau
 * marché ; le formulaire « Route swap » exécute ore→water via cells
 * (double frais annoncé en notice) ; seeder une paire food/cells éteint
 * le nudge. État vérifié par l'API (soute, notice avec « via »).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('route ore→water via cells (double frais) + nudge triade', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-route-${runId}`,
    (av) => av.available.has('market') && (av.maxLevel.get('market') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Routara', 'Mercantile');
  for (const [resource, tons] of [
    ['ore', 300],
    ['carbon', 60],
    ['fuel_cells', 130],
    ['water', 55],
    ['food_1', 25],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  for (const key of ['depot', 'market']) {
    await board.unlockCard(key);
  }
  await board.placeCard('market', board.tilePx(0));
  // Depot posé : +200 T de cap — le roll de TAILLE du starter varie et un
  // S (800 T de franchise) sur-doté refuserait les swaps à entrée nette.
  await board.placeCard('depot', board.tilePx(1));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'market')?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  await board.openPanel(board.tilePx(0), /market · L1/);
  await board.panel.getByRole('button', { name: 'Level up → L2' }).click();
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string; level: number }[];
        };
        const mkt = d.buildings.find((b) => b.key === 'market');
        return `${mkt?.level}:${mkt?.status}`;
      },
      { timeout: 60_000 },
    )
    .toBe('2:active');

  // Étoile-cellules : ore/cells puis cells/water — jamais d'ore/water.
  await board.openPanel(board.tilePx(0), /market · L2/);
  const amm = board.panel.getByRole('region', { name: 'AMM pool (L2+)' });
  await expect(amm.getByTestId('triad-nudge')).toBeVisible();
  for (const [x, y, dx, dy] of [
    ['ore', 'fuel_cells', '60', '40'],
    ['fuel_cells', 'water', '40', '40'],
  ] as const) {
    await amm.getByLabel('Leg X').selectOption(x);
    await amm.getByLabel('Leg Y').selectOption(y);
    await amm.getByLabel('Deposit X (T)').fill(dx);
    await amm.getByLabel('Deposit Y (T)').fill(dy);
    await amm.getByRole('button', { name: 'Seed pool' }).click();
    await expect(page.getByRole('status')).toContainText('Pool seeded');
    await expect(
      amm.getByTestId('amm-pool-line').filter({
        hasText: `${x.replace('_', ' ')} ⇄ ${y.replace('_', ' ')}`,
      }),
    ).toBeVisible();
  }
  // Le nudge reste : cells n'est pas de la nourriture.
  await expect(amm.getByTestId('triad-nudge')).toBeVisible();
  await shot(page, 'route-01-pools-nudge');

  // Route ore→water à quai : via cells, DEUX prises de frais.
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
  const hold = page.getByRole('region', { name: 'Cargo hold' });
  await hold.getByLabel('Resource').selectOption('ore');
  await hold.getByLabel('Tons').fill('3');
  await hold.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(hold.getByText(/ore · 3\.0 T/)).toBeVisible();

  const offers = page.getByRole('region', { name: 'Market offers' });
  const routeBox = offers.getByText('Route swap (best execution)');
  await expect(routeBox).toBeVisible({ timeout: 10_000 });
  await offers.getByLabel('Give leg', { exact: true }).selectOption('ore');
  await offers.getByLabel('Route to', { exact: true }).selectOption('water');
  await offers.getByLabel('Route T', { exact: true }).fill('3');
  await offers.getByRole('button', { name: 'Route', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('via fuel cells');
  await expect(page.getByRole('status')).toContainText('2× frais');
  await expect(hold.getByText(/water · /)).toBeVisible();
  await shot(page, 'route-02-routed');
  // Vérité backend : l'intermédiaire n'est jamais monté à bord.
  const fleetNow = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; cargo: Record<string, number> }[];
  };
  const cargo = fleetNow.ships.find((s) => s.id === haulerId)!.cargo;
  expect(cargo.fuel_cells).toBeUndefined();
  expect(cargo.ore).toBeUndefined();
  expect(cargo.water).toBeGreaterThan(0);

  // Triade : retirer cells/water, seeder food/cells — le nudge s'éteint.
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await board.openPanel(board.tilePx(0), /market · L2/);
  const cellsWater = amm
    .locator('.ls-queue-item')
    .filter({ hasText: 'fuel cells ⇄ water' });
  await cellsWater.getByLabel('Withdraw (%)').fill('100');
  await cellsWater.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByRole('status')).toContainText('liquidity updated');
  await amm.getByLabel('Leg X').selectOption('food_1');
  await amm.getByLabel('Leg Y').selectOption('fuel_cells');
  await amm.getByLabel('Deposit X (T)').fill('20');
  await amm.getByLabel('Deposit Y (T)').fill('20');
  await amm.getByRole('button', { name: 'Seed pool' }).click();
  await expect(page.getByRole('status')).toContainText('Pool seeded');
  await expect(amm.getByTestId('triad-nudge')).not.toBeVisible();
  await shot(page, 'route-03-triad-satisfied');
});
