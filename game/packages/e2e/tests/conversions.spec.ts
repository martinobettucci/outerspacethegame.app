/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22. */
/**
 * E2E — W9b actifs de conversion : électrolyseur granté (§15) et
 * installé par les vraies commandes, 4 T d'eau chargées en soute,
 * réglage UI (pas de 5 %, batch sacrifié) — au bord, 4 O2 + 4 H
 * apparaissent en soute et le batch se clôt.
 */
import { expect, test } from '@playwright/test';
import { installRigViaPipeline, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('électrolyse : batch réglé dans l\'UI, sorties au bord', async ({ page }) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-cv-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Alchemist', 'Scientific');
  for (const [resource, tons] of [
    ['water', 40],
    ['fuel_cold', 60],
    ['fuel_hot', 60],
    ['fuel_gas', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;

  // 1. Électrolyseur granté + installé (vraies commandes d'entrepôt).
  await installRigViaPipeline(page, planetId, haulerId, 'electrolyzer');

  // 2. Ravitaillement + 2 T d'eau en soute (cargo_s : 3 conteneurs —
  //    2 eau → 2 O2 + 2 H = 4 conteneurs ? Non : l'eau consommée libère.
  //    Pire cas final = 4 conteneurs > 3 → on charge 1 T (sorties 2 T).
  const rf = await page.request.post(`/api/ships/${haulerId}/refuel`, { data: {} });
  expect(rf.ok()).toBe(true);
  const load = await page.request.post(`/api/ships/${haulerId}/cargo`, {
    data: { resource: 'water', tons: 1, direction: 'load' },
  });
  expect(load.ok()).toBe(true);

  // 3. Réglage UI : throttle 50 %, batch 1 T.
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  const section = haulerPanel.getByRole('region', {
    name: /Active gear — electrolyzer/,
  });
  await expect(section).toBeVisible();
  await shot(page, 'cv-01-active-gear');
  await section.getByLabel(/Throttle/).selectOption('50');
  await section.getByLabel(/Batch/).fill('1');
  await section.getByRole('button', { name: 'Engage' }).click();
  await expect(page.getByRole('status')).toContainText('Active gear engaged');

  // 4. Au bord : 1 O2 + 1 H en soute, batch clos.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: {
            id: string;
            cargo: Record<string, number>;
            conversions: Record<string, unknown>;
          }[];
        };
        const s = f.ships.find((x) => x.id === haulerId)!;
        return (s.cargo.oxygen ?? 0) > 0.9 &&
          (s.cargo.hydrogen ?? 0) > 0.9 &&
          !s.conversions.electrolyzer
          ? 'done'
          : 'flowing';
      },
      { timeout: 60_000 },
    )
    .toBe('done');
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'cv-02-outputs-in-hold');
});
