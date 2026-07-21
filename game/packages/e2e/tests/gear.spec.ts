/**
 * E2E — W6 pipeline accessoires & upgrades-items (MASTER_PLAN W6,
 * 2026-07-21) : workshop + warehouse posés (vraies commandes), le
 * « advanced refueling system » est FABRIQUÉ depuis le panneau du
 * workshop (48 h-jeu ÷ 7200 = 24 s), atterrit dans la balance d'items du
 * warehouse ; le hauler est ENTREPOSÉ puis l'item INSTALLÉ depuis le
 * panneau galaxie (12 h-jeu = 6 s) — l'accessoire apparaît sur la coque.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('items : fabriqué au workshop, entreposé, installé sur coque entreposée', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-gr-${runId}`,
    (av) =>
      av.available.has('mine') &&
      av.available.has('workshop') &&
      av.available.has('warehouse'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Outfitter', 'Scientific');
  for (const [resource, tons] of [
    ['ore', 400],
    ['silicon', 120],
    ['steel_l', 200],
    ['gold', 40],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop + warehouse actifs (vraies commandes).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  for (const key of ['depot', 'mine', 'workshop', 'warehouse']) {
    await board.unlockCard(key);
  }
  await board.placeCard('workshop', board.tilePx(0));
  await board.placeCard('warehouse', board.tilePx(1));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return ['workshop', 'warehouse']
          .map((k) => d.buildings.find((b) => b.key === k)?.status ?? '?')
          .join(',');
      },
      { timeout: 90_000 },
    )
    .toBe('active,active');

  // 2. Fabrication depuis le panneau du workshop (§16).
  await board.openPanel(board.tilePx(0), /workshop · L1/);
  const gearSection = board.panel.getByRole('region', {
    name: 'Gear fabrication',
  });
  await expect(gearSection).toBeVisible();
  await shot(page, 'gr-01-fabrication');
  await gearSection
    .locator('div', { hasText: /^advanced refueling system/ })
    .getByRole('button', { name: 'Fabricate' })
    .click();
  await expect(page.getByRole('status')).toContainText('Fabrication started');
  await expect
    .poll(
      async () => {
        const inv = (await page.request
          .get(`/api/planets/${planetId}/items`)
          .then((r) => r.json())) as { items: { itemKey: string; count: number }[] };
        return inv.items.find((i) => i.itemKey === 'advanced_refueling_system')?.count ?? 0;
      },
      { timeout: 90_000 },
    )
    .toBe(1);

  // 3. Le hauler entreposé, l'item installé depuis le panneau galaxie.
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;
  const wh = await page.request.post(`/api/ships/${haulerId}/warehouse`);
  expect(wh.ok()).toBe(true);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel
    .getByLabel('Install item')
    .selectOption('advanced_refueling_system');
  await shot(page, 'gr-02-install-menu');
  await haulerPanel.getByRole('button', { name: 'Install item' }).click();
  await expect(page.getByRole('status')).toContainText('Installation started');

  // 4. Fin d'installation : accessoire monté, item consommé.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; accessories: string[]; installingItem: string | null }[];
        };
        const s = f.ships.find((x) => x.id === haulerId)!;
        return s.installingItem === null && s.accessories.length > 0
          ? s.accessories[0]
          : 'pending';
      },
      { timeout: 60_000 },
    )
    .toBe('advanced_refueling_system');
  const inv = (await page.request
    .get(`/api/planets/${planetId}/items`)
    .then((r) => r.json())) as { items: unknown[] };
  expect(inv.items).toEqual([]);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(
      haulerPanel.getByText(/Accessories : advanced refueling system/),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'gr-03-accessory-mounted');
});
