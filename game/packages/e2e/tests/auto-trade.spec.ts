/**
 * E2E — auto-trade du survol étranger (GB §7 « if food < 20, buy 200
 * best effort », DG §3.5) : Bob tient l'épicerie (marché fixe food_1
 * contre ore, 1:1, vraie commande UI du slot… via API — le parcours UI
 * du marché est couvert par market.spec) ; Alice configure la RÈGLE dans
 * la section Auto-trade du panneau vaisseau, s'envole vers le monde de
 * Bob avec de l'ore en soute et des provisions basses — le rachat part
 * TOUT SEUL : provisions remontées, ore débité, trade journalisé.
 */
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('auto-trade : la coque se ravitaille toute seule chez l\'épicier', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Bob : marché actif qui VEND food_1 contre ore (1:1) + stock.
  const bobEmail = pickEmailByDna(
    `e2e-atb-${runId}`,
    (av) => av.available.has('market'),
    0,
  );
  const bobPlanet = await registerSovereign(page, bobEmail, 'Grocer');
  for (const [resource, tons] of [
    ['ore', 200],
    ['food_1', 300],
    ['steel_l', 100],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId: bobPlanet, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  const api = page.request;
  for (const node of ['depot', 'market']) {
    const unlock = await api.post(`/api/planets/${bobPlanet}/unlock`, {
      data: { node },
    });
    expect(unlock.ok(), `unlock ${node}`).toBe(true);
  }
  const place = await api.post(`/api/planets/${bobPlanet}/build`, {
    data: { building: 'market', tileIndex: 0, recipe: null },
  });
  expect(place.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const d = (await api
          .get(`/api/planets/${bobPlanet}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'market')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  const d1 = (await api.get(`/api/planets/${bobPlanet}`).then((r) => r.json())) as {
    buildings: { id: string; key: string }[];
  };
  const marketId = d1.buildings.find((b) => b.key === 'market')!.id;
  const slot = await api.post(
    `/api/planets/${bobPlanet}/buildings/${marketId}/market-slot`,
    {
      data: {
        slotIndex: 0,
        give: 'food_1',
        get: 'ore',
        rate: 1,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      },
    },
  );
  if (!slot.ok()) {
    // eslint-disable-next-line no-console
    console.log('DEBUG slot response', slot.status(), await slot.text());
  }
  expect(slot.ok()).toBe(true);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByLabel('E-mail')).toBeVisible();

  // 2. Alice : pilote à bord, ore en soute, provisions basses, RÈGLE en UI.
  const aliceEmail = pickEmailByDna(`e2e-ata-${runId}`, () => true, 0);
  const alicePlanet = await registerSovereign(page, aliceEmail, 'Roamer');
  const g2 = await api.post('/api/test/grant', {
    data: { planetId: alicePlanet, resource: 'ore', tons: 50 },
  });
  expect(g2.ok()).toBe(true);
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  const fleet = (await api.get('/api/fleet').then((r) => r.json())) as {
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
  // Charger l'ore (à quai) puis configurer la règle DANS l'UI.
  const load = await api.post(`/api/ships/${haulerId}/cargo`, {
    data: { resource: 'ore', tons: 3, direction: 'load' },
  });
  expect(load.ok()).toBe(true);
  await haulerPanel.getByText('Auto-trade (foreign hover)').click();
  await haulerPanel.getByLabel('Auto-trade resource 1').selectOption('food_1');
  await haulerPanel.getByLabel('Auto-trade below 1').fill('0.05');
  await haulerPanel.getByLabel('Auto-trade buy 1').fill('0.1');
  await haulerPanel.getByRole('button', { name: 'Apply rules' }).click();
  await expect(page.getByRole('status')).toContainText('Auto-trade rules applied.');
  await shot(page, 'at-01-rule-configured');

  // 3. Provisions basses (§15), plein réservoir, cap sur le monde de Bob.
  const sv = await api.post('/api/test/ship-survival', {
    data: { shipId: haulerId, foodT: 0.02, waterT: 0.1 },
  });
  expect(sv.ok()).toBe(true);
  const sf = await api.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(sf.ok()).toBe(true);
  const rel = await api.post('/api/test/relocate-ship', {
    data: { shipId: haulerId, bodyId: bobPlanet },
  });
  expect(rel.ok()).toBe(true);

  // 4. Le rachat part TOUT SEUL (worker) : provisions ↑, ore ↓.
  await expect
    .poll(
      async () => {
        const f = (await api.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; survival: { food: number } }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.survival.food ?? 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.1);
  const after = (await api.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; cargo: Record<string, number> }[];
  };
  const h = after.ships.find((s) => s.id === haulerId)!;
  expect(h.cargo.ore).toBeCloseTo(2.9, 2);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(
      haulerPanel.getByText(/0\.12 food \/ 0\.10 water/),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await shot(page, 'at-02-auto-restocked');
});
