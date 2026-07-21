/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Vehicle warehouse” and §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §3.3b/§6. */
/**
 * E2E — entrepôt de véhicules (GB §9, DG §6 round 6) : warehouse construit
 * puis, depuis le panneau vaisseau de la carte galactique, la coque À QUAI
 * s'entrepose (équipage LIBÉRÉ — notice canon), le pilote REMBARQUE au
 * warehouse (seul point de re-crew hors quai), les balances S/M/L
 * s'affichent sur le bâtiment, et le redéploiement (dock libre exigé,
 * 1 h taille S ÷ 7200) repose la coque à quai. Effets backend vérifiés
 * à chaque pas (fleet + planetDetail).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('entrepôt : warehouse → crew libéré → re-crew → balances → redéploiement', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-wh-${runId}`,
    (av) => av.available.has('warehouse'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Quartermaster');
  for (const [resource, tons] of [
    ['ore', 200],
    ['steel_l', 100],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Warehouse L1 actif (vraie commande : carte débloquée puis posée).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  await board.unlockCard('depot'); // prérequis tech du warehouse
  await board.unlockCard('warehouse');
  await board.placeCard('warehouse', board.tilePx(0));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'warehouse')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // 2. Pilote à bord puis ENTREPOSAGE : équipage libéré (notice canon),
  //    statut warehoused, balances backend S=1.
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

  await haulerPanel.getByRole('button', { name: 'Warehouse' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Hull warehoused — crew released to your hand.',
  );
  await expect(haulerPanel.getByText('warehoused', { exact: true })).toBeVisible();
  // L'équipage est LIBÉRÉ : le pilote libre réapparaît comme assignable.
  await expect(
    haulerPanel.getByRole('button', { name: /Assign pilot/ }),
  ).toBeVisible();
  await shot(page, 'wh-01-warehoused-crew-released');
  const afterStore = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    vehicles: {
      capacity: { s: number; m: number; l: number };
      stored: { s: number; m: number; l: number };
    };
  };
  expect(afterStore.vehicles.capacity).toEqual({ s: 8, m: 6, l: 2 });
  expect(afterStore.vehicles.stored).toEqual({ s: 1, m: 0, l: 0 });

  // 3. RE-CREW au warehouse (canon GB §12) — vraie commande UI.
  await haulerPanel.getByRole('button', { name: /Assign pilot/ }).click();
  await expect(page.getByRole('status')).toContainText('Pilot bound');

  // 4. Balances S/M/L affichées sur le bâtiment warehouse.
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await board.openPanel(board.tilePx(0), /warehouse · L1/);
  await expect(page.getByTestId('vehicles-usage')).toContainText(
    'Vehicles S 1/8 · M 0/6 · L 0/2',
  );
  await shot(page, 'wh-02-vehicle-balances');

  // 5. Redéploiement : notice, puis la coque REVIENT à quai (S = 1 h ÷
  //    7200 ≈ 0,5 s réel + tick worker) et la balance S se vide.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(haulerPanel.getByText(/Zero upkeep in the vehicle warehouse/)).toBeVisible();
  await haulerPanel.getByRole('button', { name: 'Retrieve' }).click();
  await expect(page.getByRole('status')).toContainText('Redeployment under way.');
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('docked');
  const emptied = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    vehicles: { stored: { s: number } };
  };
  expect(emptied.vehicles.stored.s).toBe(0);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText('docked', { exact: true })).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 20_000 });
  await shot(page, 'wh-03-redeployed-docked');
});
