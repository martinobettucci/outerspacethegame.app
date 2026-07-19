/**
 * E2E — usure de coque & bouclier radiatif (GB §27 SETTLED, DG §8.8) :
 * l'étoile de la poche passe en FLARE (§15), la coque vole à 3 pc — zone
 * hostile ≤ 5 pc — et la jauge de coque affiche le péage (−4.0 HP/day,
 * 5 % des 80 HP du Cargo S) ; retour à quai, workshop monté L2 (vraies
 * commandes), bouclier radiatif payé et monté ; retour dans la zone :
 * le péage a CESSÉ (effets backend vérifiés à chaque pas).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('usure : flare = péage sans bouclier, plus rien avec', async ({ page }) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-sh-${runId}`,
    (av) =>
      av.available.has('mine') &&
      av.available.has('workshop') &&
      (av.maxLevel.get('workshop') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Shieldwright');
  for (const [resource, tons] of [
    ['ore', 300],
    ['silicon', 60],
    ['steel_l', 60],
    ['crystal_nox', 10],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop L2 actif (unlock → place → level up, vraies commandes).
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
          buildings: { key: string; status: string; level: number }[];
        };
        return d.buildings.find((b) => b.key === 'workshop')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  await board.openPanel(board.tilePx(0), /workshop · L1/);
  await board.panel.getByRole('button', { name: /Level up → L2/ }).click();
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string; level: number }[];
        };
        const w = d.buildings.find((b) => b.key === 'workshop');
        return `${w?.level}-${w?.status}`;
      },
      { timeout: 90_000 },
    )
    .toBe('2-active');

  // 2. L'étoile de la poche FLARE (§15) — la zone ≤ 5 pc devient hostile.
  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: {
      id: string;
      bodyType: string;
      x: number;
      y: number;
      starFuelType: string | null;
    }[];
  };
  const star = galaxy.bodies.find((b) => b.bodyType === 'star')!;
  const init = await page.request.post('/api/test/star-stock', {
    data: { starId: star.id, stockU: 100 },
  });
  expect(init.ok()).toBe(true);

  // 3. Vol à 3 pc de l'étoile (idle en zone hostile, sans bouclier).
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(sf.ok()).toBe(true);
  const mv = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: star.x + 3, y: star.y },
  });
  expect(mv.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('idle');

  // 4. Le péage court : −4.0 HP/day, visible sur la jauge de coque.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(haulerPanel.getByText(/Hull — /)).toBeVisible();
  await expect(
    haulerPanel.getByText(/−4\.0 HP\/day · wearing — hostile environment/),
  ).toBeVisible();
  const wearing = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; hull: { wearPerDay: number; maxHp: number } }[];
  };
  const w = wearing.ships.find((s) => s.id === haulerId)!;
  expect(w.hull.wearPerDay).toBeCloseTo(4, 3);
  expect(w.hull.maxHp).toBe(80);
  await shot(page, 'sh-01-wearing-in-flare-zone');

  // 5. Retour, atterrissage, bouclier radiatif monté (coût payé).
  const back = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { bodyId: planetId },
  });
  expect(back.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('hovering');
  const land = await page.request.post(`/api/ships/${haulerId}/land`);
  expect(land.ok()).toBe(true);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel
    .getByRole('button', { name: 'Fit radiation shield' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Shield mounted — the toll stops here.',
  );

  // 6. Retour en zone : le péage a cessé (bouclier apparié).
  const out = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: star.x + 3, y: star.y + 0.5 },
  });
  expect(out.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('idle');
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText(/Hull — /)).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 30_000 });
  await expect(haulerPanel.getByText(/wearing — hostile environment/)).toHaveCount(
    0,
  );
  const calm = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; hull: { wearPerDay: number }; shields: { radio: boolean } }[];
  };
  const c = calm.ships.find((s) => s.id === haulerId)!;
  expect(c.hull.wearPerDay).toBe(0);
  expect(c.shields.radio).toBe(true);
  await shot(page, 'sh-02-shielded-no-toll');
});
