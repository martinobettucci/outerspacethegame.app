/**
 * E2E — avitaillement de survie & survol nourri par le monde (GB §6/§7,
 * DG §3.5) : provisions basses (instrumentation §15), le bouton
 * Provision remplit food/water à la CAPACITÉ de coque (Cargo S :
 * 14 crew-days × 0.01 × 1 pilote = 0.14 T) depuis le stock planétaire ;
 * puis, en survol de SON monde, l'horloge est exempte — « host feeds the
 * crew » — le stock d'en bas paie (effets backend vérifiés).
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('avitaillement : Provision remplit la coque, le survol possédé nourrit', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-pv-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Steward');
  for (const [resource, tons] of [
    ['food_1', 60],
    ['water', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  const rail = page.getByRole('navigation', { name: 'Main' });
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

  // Provisions quasi vides (§15) puis AVITAILLEMENT réel par l'UI.
  const sv = await page.request.post('/api/test/ship-survival', {
    data: { shipId: haulerId, foodT: 0.03, waterT: 0.03 },
  });
  expect(sv.ok()).toBe(true);
  const gauge = haulerPanel.getByRole('region', { name: 'Crew survival' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(gauge.getByText(/0\.03 food \/ 0\.03 water/)).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 20_000 });
  await haulerPanel.getByRole('button', { name: 'Provision' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Provisions loaded — crew stores topped up.',
  );
  await expect(gauge.getByText(/0\.14 food \/ 0\.14 water/)).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, 'pv-01-provisioned-to-capacity');
  const afterFill = (await page.request
    .get('/api/fleet')
    .then((r) => r.json())) as {
    ships: { id: string; survival: { food: number; water: number } }[];
  };
  const filled = afterFill.ships.find((s) => s.id === haulerId)!;
  expect(filled.survival.food).toBeCloseTo(0.14, 2);
  expect(filled.survival.water).toBeCloseTo(0.14, 2);

  // Plein : le refus canon remonte en notice (§10 visible).
  await haulerPanel.getByRole('button', { name: 'Provision' }).click();
  await expect(page.getByRole('status')).toContainText('Provisioning refused');

  // Survol de SON monde : le stock d'en bas nourrit — horloge exempte.
  await haulerPanel.getByRole('button', { name: 'Undock' }).click();
  await expect(page.getByRole('status')).toContainText('Airborne');
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText('hovering', { exact: true })).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 20_000 });
  await expect(gauge.getByText('host feeds the crew')).toBeVisible();
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; survival: { ratePerDay: number } }[];
      };
      return f.ships.find((s) => s.id === haulerId)?.survival.ratePerDay;
    })
    .toBe(0);
  await shot(page, 'pv-02-hover-own-world-served');
});
