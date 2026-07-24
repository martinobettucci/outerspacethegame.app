/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Junk fields” and “Salvage claims”; GAME_BOOK.md §6/§22; DESIGN_GUIDE.md §8.8/§10.4. */
/**
 * E2E — champs de junk (GB §22, DG §10.4) : collecteur monté à l'atelier
 * L2 (vraies commandes), fret chargé, vol dans le VIDE (> 50 pc des
 * starters), LARGAGE — le champ naît dans la cellule, la ligne de champ
 * et l'usure de présence s'affichent ; puis COLLECTE (scoop) — le junk
 * embarque en soute (tier salvage), le champ se dissipe, l'usure cesse.
 * Effets backend vérifiés à chaque pas.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, installRigViaPipeline, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('junk : larguer crée le champ, collecter le résorbe', async ({ page }) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-jk-${runId}`,
    (av) =>
      av.available.has('mine') &&
      av.available.has('workshop') &&
      (av.maxLevel.get('workshop') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Scrapmaster');
  for (const [resource, tons] of [
    ['ore', 300],
    ['silicon', 60],
    ['steel_l', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop L2 actif (unlock → place → level up).
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

  // 2. Collecteur monté + 3 T d'ore en soute (vraies commandes API).
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  // Erratum 2026-07-22 : rig = accessoire du pipeline.
  await installRigViaPipeline(page, planetId, haulerId, 'junk_collector');
  const load = await page.request.post(`/api/ships/${haulerId}/cargo`, {
    data: { resource: 'ore', tons: 3, direction: 'load' },
  });
  expect(load.ok()).toBe(true);

  // 3. Vol dans le VIDE à 60 pc du starter (hors zone protégée).
  const me = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; x: number; y: number }[];
  };
  const home = me.bodies.find((b) => b.id === planetId)!;
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(sf.ok()).toBe(true);
  const mv = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: home.x + 60, y: home.y },
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

  // 4. LARGAGE de 2 T via l'UI : champ né, ligne + usure visibles.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel.getByLabel('Dump tons').fill('2');
  await haulerPanel.getByRole('button', { name: 'Dump' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Cargo jettisoned — a junk field spreads here.',
  );
  await expect(haulerPanel.getByText(/Junk field here — 2\.0 T/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(haulerPanel.getByText(/hazard −1\.0 HP\/day/)).toBeVisible();
  await expect(
    haulerPanel.getByText(/−1\.0 HP\/day · wearing — hostile environment/),
  ).toBeVisible();
  await shot(page, 'jk-01-field-born-hazard');

  // 5. COLLECTE : le junk embarque, le champ se dissipe, l'usure cesse.
  await haulerPanel.getByRole('button', { name: 'Collect junk' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Scoop complete — junk aboard.',
  );
  await expect(haulerPanel.getByText(/junk · 2\.0 T/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(haulerPanel.getByText(/Junk field here/)).toHaveCount(0, {
    timeout: 15_000,
  });
  const after = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: {
      id: string;
      cargo: Record<string, number>;
      hull: { wearPerDay: number };
    }[];
  };
  const h = after.ships.find((s) => s.id === haulerId)!;
  expect(h.cargo.junk).toBeCloseTo(2, 1);
  expect(h.hull.wearPerDay).toBe(0);
  const gal = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    junkFields: { x: number }[];
  };
  expect(gal.junkFields.some((f) => Math.abs(f.x - (home.x + 60)) < 1)).toBe(
    false,
  );
  await shot(page, 'jk-02-collected-clean');
});
