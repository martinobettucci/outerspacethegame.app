/** @verifies This test file verifies: docs/MASTER_PLAN.md §W6 (reste b — acheminement d'items); JOURNAL 2026-07-22 (plan W6c-b persisté). */
/**
 * E2E — W6c-b1 : le fret d'ITEMS dans l'UI. Item granté (§15) sur le
 * monde natal, hauler À QUAI : chargement depuis le panneau (compteur
 * de conteneurs à jour — l'item occupe UN conteneur), « Item hold »
 * affiché, déchargement vers la balance du monde. Captures observées.
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('fret d\'items : charge à quai, conteneur occupé, décharge', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const email = pickEmailByDna(
    `e2e-ic-${runId}`,
    (av) => (av.maxLevel.get('warehouse') ?? 0) >= 1,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Teamster', 'Mercantile');
  // Warehouse ACTIF requis pour la BALANCE du monde (décharge) — bâti
  // par les VRAIES commandes ; l'item de fret est granté (§15).
  for (const [resource, tons] of [
    ['ore', 400],
    ['silicon', 200],
    ['carbon', 100],
    ['steel_l', 200],
  ] as const) {
    const gr = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(gr.ok()).toBe(true);
  }
  // Chaîne de prérequis : depot (pré-déverrouillé au spawn — 409 toléré)
  // puis warehouse.
  for (const node of ['depot', 'warehouse'] as const) {
    const unlock = await page.request.post(`/api/planets/${planetId}/unlock`, {
      data: { node },
    });
    expect(unlock.ok() || unlock.status() === 409).toBe(true);
  }
  const build = await page.request.post(`/api/planets/${planetId}/build`, {
    data: { building: 'warehouse', tileIndex: 0, recipe: null },
  });
  expect(build.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as { buildings: { key: string; status: string }[] };
        return d.buildings.find((b) => b.key === 'warehouse')?.status ?? 'absent';
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  const g = await page.request.post('/api/test/grant-item', {
    data: { planetId, itemKey: 'cargo_netting' },
  });
  expect(g.ok()).toBe(true);
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;

  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });

  // Charge : le sélecteur de fret propose l'item granté.
  await haulerPanel.getByRole('combobox', { name: 'Load item' }).selectOption('cargo_netting');
  await haulerPanel.getByRole('button', { name: 'Load item' }).click();
  await expect(page.getByRole('status')).toContainText('Item loaded');
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(
      haulerPanel.getByText(/Item hold : cargo netting/),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  // Un item = UN conteneur : 1/3 affiché.
  await expect(haulerPanel.getByText(/Cargo hold — 1\/\s*3/)).toBeVisible();
  await shot(page, 'ic-01-item-in-hold');

  // Décharge vers la balance du monde.
  await haulerPanel.getByRole('button', { name: 'Unload first item' }).click();
  await expect(page.getByRole('status')).toContainText('Item unloaded');
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; itemCargo: string[] }[];
      };
      return f.ships.find((x) => x.id === haulerId)!.itemCargo.length;
    })
    .toBe(0);
  const items = (await page.request
    .get(`/api/planets/${planetId}/items`)
    .then((r) => r.json())) as { items: { itemKey: string; count: number }[] };
  expect(items.items.find((i) => i.itemKey === 'cargo_netting')?.count).toBe(1);
  await shot(page, 'ic-02-item-unloaded');
});
