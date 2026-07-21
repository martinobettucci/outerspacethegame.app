/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Markets” and “Cells-star routing”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.2. */
/**
 * E2E — pools AMM du marché L2 (GB §13, DG §11.2) : un Souverain
 * Mercantile monte son marché au L2 (gate de gouvernance réel), seed un
 * pool ore/water dont le RATIO est le prix initial (aperçu à l'écran),
 * échange à quai au produit constant (le spot dérive, notice), puis
 * retire 100 % de la liquidité (slot libéré, réserves au stock). L'état
 * est vérifié par l'API à chaque étape (réserves exactes via marketSlots).
 * L'auto-échange est canon (« self-wash pointless, not dangerous »).
 */
import { expect, test } from '@playwright/test';
import { ammQuote, AMM_FEE_LP_BP, AMM_FEE_HOUSE_BP } from '@atg/shared';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

interface RawAmmSlot {
  mode: 'amm';
  pool: { x: string; y: string; rx: number; ry: number };
}

test('AMM L2 : seed = prix initial, swap à quai, retrait libère', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Souverain MERCANTILE (gate market L2) — ADN : market niveau ≥ 2.
  const email = pickEmailByDna(
    `e2e-amm-${runId}`,
    (av) => av.available.has('market') && (av.maxLevel.get('market') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Ammelia', 'Mercantile');
  for (const [resource, tons] of [
    ['ore', 300],
    ['carbon', 60],
    ['fuel_cells', 35],
    ['water', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 2. Depot + market, puis L2 (le compte Mercantile gouverne seul).
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
  await expect(page.getByRole('status')).toContainText('Level-up');
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

  // 3. Seed 60 ore / 30 water : l'aperçu affiche le prix induit 0,5.
  await board.openPanel(board.tilePx(0), /market · L2/);
  const amm = board.panel.getByRole('region', { name: 'AMM pool (L2+)' });
  await expect(amm).toBeVisible();
  await amm.getByLabel('Leg X').selectOption('ore');
  await amm.getByLabel('Leg Y').selectOption('water');
  await amm.getByLabel('Deposit X (T)').fill('60');
  await amm.getByLabel('Deposit Y (T)').fill('30');
  await expect(amm.getByTestId('amm-implied-price')).toContainText(
    'Initial price: 0.5 water/ore',
  );
  await shot(page, 'amm-01-seed-form');
  await amm.getByRole('button', { name: 'Seed pool' }).click();
  await expect(page.getByRole('status')).toContainText('Pool seeded');
  await expect(amm.getByTestId('amm-pool-line')).toContainText(
    'ore ⇄ water · 60/30 T · spot 0.5 · 25+25 bp',
  );
  await shot(page, 'amm-02-pool-live');

  // 4. Swap à quai : 3 T d'ore (= 3 conteneurs, la soute S est pleine)
  // contre ~1,4 T d'eau au produit constant.
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
  await expect(offers.getByText(/AMM ore ⇄ water/)).toBeVisible({
    timeout: 10_000,
  });
  const expected = ammQuote(60, 30, 3, AMM_FEE_LP_BP, AMM_FEE_HOUSE_BP);
  await offers.getByLabel('Give leg ore water').selectOption('ore');
  await offers.getByLabel('Swap ore water').fill('3');
  await offers.getByRole('button', { name: 'Swap' }).click();
  await expect(page.getByRole('status')).toContainText('spot');
  await expect(
    hold.getByText(new RegExp(`water · ${expected.outT.toFixed(1)} T`)),
  ).toBeVisible();
  await shot(page, 'amm-03-swap-done');

  // Vérité backend : réserves EXACTES après l'échange (config brute).
  const detail = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    buildings: { key: string; marketSlots: (RawAmmSlot | null)[] | null }[];
  };
  const slot = detail.buildings.find((b) => b.key === 'market')!
    .marketSlots![0] as RawAmmSlot;
  expect(slot.pool.rx).toBeCloseTo(expected.newRIn, 6);
  expect(slot.pool.ry).toBeCloseTo(expected.newROut, 6);

  // 5. Retrait 100 % : slot libéré, réserves de retour au stock.
  const stockBefore = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    stock: Record<string, { amount: number }>;
  };
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await board.openPanel(board.tilePx(0), /market · L2/);
  await amm.getByLabel('Withdraw (%)').fill('100');
  await amm.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByRole('status')).toContainText('liquidity updated');
  await expect(amm.getByTestId('amm-pool-line')).not.toBeVisible();
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${planetId}`)
        .then((r) => r.json())) as {
        stock: Record<string, { amount: number }>;
      };
      return d.stock.ore.amount - stockBefore.stock.ore.amount;
    })
    .toBeGreaterThan(expected.newRIn - 1);
  await shot(page, 'amm-04-withdrawn');
});
