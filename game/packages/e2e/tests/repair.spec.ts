/**
 * E2E — réparation d'atelier (DG §8.7) : coque endommagée (§15) à quai
 * de SON monde à workshop actif — la jauge affiche 40/80 et la ligne
 * VERTE « +96.0 HP/day · under repair — the workshop bills steel per
 * HP » ; les HP REMONTENT en temps réel (poll API) et l'acier est
 * facturé au stock (taux négatif visible côté backend).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('réparation : l\'atelier rend 5 %/h et facture l\'acier', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-rp-${runId}`,
    (av) => av.available.has('mine') && av.available.has('workshop'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Millwright');
  for (const [resource, tons] of [
    ['ore', 200],
    ['silicon', 40],
    ['steel_l', 50],
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
  await board.unlockCard('mine');
  await board.unlockCard('workshop');
  await board.placeCard('workshop', board.tilePx(0));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'workshop')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // Coque endommagée (§15) : la réparation s'arme aussitôt à quai.
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  const dmg = await page.request.post('/api/test/ship-hull', {
    data: { shipId: haulerId, hp: 40 },
  });
  expect(dmg.ok()).toBe(true);

  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(haulerPanel.getByText(/Hull — 40\.\d\/80 HP/)).toBeVisible();
  await expect(
    haulerPanel.getByText(/\+96\.0 HP\/day · under repair/),
  ).toBeVisible();
  await shot(page, 'rp-01-under-repair');

  // Effets backend : HP qui remontent (temps réel) + acier facturé.
  const before = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; hull: { hp: number; wearPerDay: number } }[];
  };
  const b = before.ships.find((s) => s.id === haulerId)!;
  expect(b.hull.wearPerDay).toBeCloseTo(-96, 2); // négatif = réparation
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; hull: { hp: number } }[];
        };
        return f.ships.find((s) => s.id === haulerId)!.hull.hp;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(b.hull.hp + 0.03);
  const detail = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    stock: Record<string, { ratePerDay: number }>;
  };
  expect(detail.stock.steel_l.ratePerDay).toBeLessThan(-9);
});
