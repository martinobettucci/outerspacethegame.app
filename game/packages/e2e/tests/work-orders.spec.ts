/**
 * E2E — W7 usinage partiel des usines L3 (MASTER_PLAN W7, 2026-07-21) :
 * une mine montée L3 (vraies commandes) bascule la fabrication d'item en
 * paliers de 5 % — RIEN débité à la commande, l'ordre affiche « (n/20) »
 * dans l'inventaire, l'item finit par naître dans la balance du
 * warehouse (48 h-jeu ÷ 7200 = 24 s au total).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, revealCard, shot } from './lib.js';

const runId = Date.now().toString(36);

test('usinage partiel : rien d\'avance, paliers visibles, l\'item naît', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-wo-${runId}`,
    (av) =>
      av.available.has('mine') &&
      (av.maxLevel.get('mine') ?? 0) >= 3 &&
      av.available.has('workshop') &&
      av.available.has('warehouse'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Foreman', 'Scientific');
  for (const [resource, tons] of [
    ['ore', 900],
    ['silicon', 300],
    ['carbon', 200],
    ['steel_l', 400],
    ['gold', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop + warehouse + mine posés (vraies commandes).
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
  await board.placeCard('workshop', board.tilePx(1));
  await board.placeCard('warehouse', board.tilePx(2));
  // La mine : Place ouvre le sélecteur de recette (industrie).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand.getByRole('article').filter({ hasText: /^mine/ }).first();
  await revealCard(mineCard);
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract ore/ }).click();
  const [tx, ty] = board.tilePx(0);
  await expect(async () => {
    await page.mouse.click(tx, ty);
    expect(await board.hasBuilding('mine')).toBe(true);
  }).toPass({ timeout: 40_000 });
  const buildingState = async (key: string) => {
    const d = (await page.request
      .get(`/api/planets/${planetId}`)
      .then((r) => r.json())) as {
      buildings: { id: string; key: string; status: string; level: number }[];
    };
    const b = d.buildings.find((x) => x.key === key);
    return { id: b?.id ?? '', state: `${b?.status}:L${b?.level}` };
  };
  await expect
    .poll(async () => (await buildingState('mine')).state, { timeout: 90_000 })
    .toBe('active:L1');
  await expect
    .poll(async () => (await buildingState('workshop')).state, { timeout: 90_000 })
    .toBe('active:L1');
  await expect
    .poll(async () => (await buildingState('warehouse')).state, { timeout: 90_000 })
    .toBe('active:L1');

  // 2. Mine → L3 (vraies commandes de montée).
  for (const lvl of [2, 3] as const) {
    const { id } = await buildingState('mine');
    const up = await page.request.post(
      `/api/planets/${planetId}/buildings/${id}/levelup`,
    );
    if (!up.ok()) throw new Error(`levelup L${lvl}: ${await up.text()}`);
    await expect
      .poll(async () => (await buildingState('mine')).state, { timeout: 90_000 })
      .toBe(`active:L${lvl}`);
  }

  // 3. Fabrication : RIEN débité à la commande (usinage partiel).
  const stockOf = async (resource: string) => {
    const d = (await page.request
      .get(`/api/planets/${planetId}`)
      .then((r) => r.json())) as {
      stock: Record<string, { amount: number }>;
    };
    return d.stock[resource]?.amount ?? 0;
  };
  const steelBefore = await stockOf('steel_l');
  const fb = await page.request.post(`/api/planets/${planetId}/items`, {
    data: { itemKey: 'advanced_refueling_system' },
  });
  expect(fb.ok()).toBe(true);
  const steelAtOrder = await stockOf('steel_l');
  expect(steelBefore - steelAtOrder).toBeLessThan(1.6); // ≤ 1 palier, pas 30
  // L'ordre est visible avec ses paliers.
  await expect
    .poll(
      async () => {
        const inv = (await page.request
          .get(`/api/planets/${planetId}/items`)
          .then((r) => r.json())) as {
          fabricating: { itemKey: string }[];
        };
        return inv.fabricating.some((f) => /\(\d+\/20/.test(f.itemKey));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await board.openPanel(board.tilePx(1), /workshop · L1/);
  await shot(page, 'wo-01-staged-order');

  // 4. L'item naît (20 paliers), total débité = 30 steel_l.
  await expect
    .poll(
      async () => {
        const inv = (await page.request
          .get(`/api/planets/${planetId}/items`)
          .then((r) => r.json())) as { items: { itemKey: string; count: number }[] };
        return inv.items.find((i) => i.itemKey === 'advanced_refueling_system')?.count ?? 0;
      },
      { timeout: 120_000 },
    )
    .toBe(1);
  const steelAfter = await stockOf('steel_l');
  expect(steelBefore - steelAfter).toBeGreaterThan(29);
  expect(steelBefore - steelAfter).toBeLessThan(31.5);
  await shot(page, 'wo-02-item-born');
});
