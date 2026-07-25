/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22. */
/**
 * E2E — W9b actifs de conversion (taxonomie définitive) : électrolyseur
 * CONTINU granté (§15) et installé par les vraies commandes, 1 T d'eau
 * en soute, throttle 50 % dans l'UI — l'eau se convertit au fil de
 * l'eau, O2+H apparaissent, la starvation ramène à 0 %.
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

  // 3. Réglage UI : throttle 50 % (CONTINU — l'eau de soute se
  //    convertit au fil de l'eau, taxonomie 2026-07-22).
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
        const st = s.conversions.electrolyzer as { runPct: number } | undefined;
        return (s.cargo.oxygen ?? 0) > 0.9 &&
          (s.cargo.hydrogen ?? 0) > 0.9 &&
          (!st || st.runPct === 0)
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

test('W9e batch UI : hull_patch_kit — intrants à l\'activation, procédé affiché, clos au terme', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-cw-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Patcher', 'Scientific');
  for (const [resource, tons] of [
    ['steel_l', 40],
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

  await installRigViaPipeline(page, planetId, haulerId, 'hull_patch_kit');
  const rf = await page.request.post(`/api/ships/${haulerId}/refuel`, { data: {} });
  expect(rf.ok()).toBe(true);
  const load = await page.request.post(`/api/ships/${haulerId}/cargo`, {
    data: { resource: 'steel_l', tons: 1, direction: 'load' },
  });
  expect(load.ok()).toBe(true);

  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  const section = haulerPanel.getByRole('region', {
    name: /Active gear — hull patch kit/,
  });
  await expect(section).toBeVisible();
  await section
    .getByRole('button', { name: 'Start process (inputs consumed, hull held)' })
    .click();
  await expect(page.getByRole('status')).toContainText('Active gear engaged');
  // Intrants consommés À L'ACTIVATION : 1 T d'acier sortie de soute.
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; cargo: Record<string, number> }[];
      };
      return f.ships.find((x) => x.id === haulerId)!.cargo.steel_l ?? 0;
    })
    .toBeLessThan(0.1);
  // Procédé affiché (échéance) + bouton d'abandon.
  await expect(section.getByText(/Process running — ends/)).toBeVisible();
  await expect(
    section.getByRole('button', { name: 'Abort process (inputs lost)' }),
  ).toBeVisible();
  await shot(page, 'cv-03-batch-running');
  // Au terme (12 h-jeu @ ×7200 ≈ 6 s réels) : procédé clos.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; conversions: Record<string, unknown> }[];
        };
        return f.ships.find((x) => x.id === haulerId)!.conversions.hull_patch_kit
          ? 'running'
          : 'done';
      },
      { timeout: 90_000 },
    )
    .toBe('done');
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'cv-04-batch-done');
});

test('W9e jump_primer UI : durée de charge choisie, boost armé au terme', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-cx-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Jumper', 'Scientific');
  for (const [resource, tons] of [
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
  await installRigViaPipeline(page, planetId, haulerId, 'jump_primer');
  const rf = await page.request.post(`/api/ships/${haulerId}/refuel`, { data: {} });
  expect(rf.ok()).toBe(true);

  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  const section = haulerPanel.getByRole('region', {
    name: /Active gear — jump primer/,
  });
  await expect(section).toBeVisible();
  // Durée de charge : 24 h-jeu (12 s réels @ ×7200).
  await section.getByLabel(/Duration \(game-hours\)/).fill('24');
  await shot(page, 'cv-05-primer-charge');
  await section
    .getByRole('button', { name: 'Start process (inputs consumed, hull held)' })
    .click();
  await expect(page.getByRole('status')).toContainText('Active gear engaged');
  // Au terme de la charge : le BOOST est armé (72 h-jeu).
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: {
            id: string;
            conversions: Record<string, { boostUntilMs?: number }>;
          }[];
        };
        const st = f.ships.find((x) => x.id === haulerId)!.conversions.jump_primer;
        return st?.boostUntilMs && st.boostUntilMs > Date.now() ? 'boosted' : 'waiting';
      },
      { timeout: 120_000 },
    )
    .toBe('boosted');
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(section.getByText(/Jump boost — until/)).toBeVisible();
  await shot(page, 'cv-06-primer-boosted');
});
