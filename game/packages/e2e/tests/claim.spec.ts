/**
 * E2E — claim rig & salvage (GB §6 « no honor », DG §8.8) : une VRAIE
 * épave naît du survival-out (pilote granté §15, survol sauvage,
 * provisions quasi nulles → équipage mort, owner NULL — chaîne du chunk
 * AB), apparaît dans le radar « Wrecks » ; le claimer (rig monté à
 * l'atelier L2) vole à ≤ 1 pc, RÉCLAME (2 h de jeu ÷ 7200 ≈ 1 s),
 * et l'épave rejoint SA flotte en idle.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('salvage : le cimetière est un marché — épave réclamée en 2 h', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-cl-${runId}`,
    (av) =>
      av.available.has('mine') &&
      av.available.has('workshop') &&
      (av.maxLevel.get('workshop') ?? 0) >= 2 &&
      av.available.has('spaceport') &&
      av.available.has('shipyard'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Graverobber');
  for (const [resource, tons] of [
    ['ore', 400],
    ['silicon', 60],
    ['steel_l', 200],
    ['gold', 20],
    ['fuel_cells', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Workshop L2 + shipyard actifs (vraies commandes).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  // Chaîne tech : depot→spaceport→shipyard ; mine→workshop.
  for (const key of ['depot', 'mine', 'workshop', 'spaceport', 'shipyard']) {
    await board.unlockCard(key);
  }
  await board.placeCard('workshop', board.tilePx(0));
  await board.placeCard('shipyard', board.tilePx(1));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return ['workshop', 'shipyard']
          .map((k) => d.buildings.find((b) => b.key === k)?.status ?? '?')
          .join(',');
      },
      { timeout: 90_000 },
    )
    .toBe('active,active');
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

  // 2. La future ÉPAVE : un Cargo S né au chantier, pilote granté (§15),
  //    envoyé en survol SAUVAGE, provisions quasi nulles → survival_out.
  await board.openPanel(board.tilePx(1), /shipyard · L1/);
  const yard = board.panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await yard.getByLabel('Category').selectOption('cargo');
  await yard.getByLabel('Size').selectOption('s');
  const victimName = `Doomed ${runId}`;
  await yard.getByLabel('Ship name').fill(victimName);
  await expect(async () => {
    await yard.getByRole('button', { name: 'Lay the keel' }).click();
    await expect(page.getByRole('status')).toContainText('Keel laid', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string }[];
        };
        return f.ships.find((s) => s.name === victimName)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('docked');
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const victimId = fleet0.ships.find((s) => s.name === victimName)!.id;
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;
  const gn = await page.request.post('/api/test/grant-npc', {
    data: { role: 'pilot', rarity: 'common' },
  });
  expect(gn.ok()).toBe(true);
  const npcs = (await page.request.get('/api/npcs').then((r) => r.json())) as {
    npcs: { id: string; role: string; boundHostId: string | null }[];
  };
  const freePilot = npcs.npcs.find((n) => n.role === 'pilot' && !n.boundHostId)!;
  const ac = await page.request.post(`/api/ships/${victimId}/crew`, {
    data: { npcId: freePilot.id },
  });
  expect(ac.ok()).toBe(true);

  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; bodyType: string; ownerId: string | null; x: number; y: number }[];
  };
  const wild = galaxy.bodies.find((b) => b.bodyType === 'planet' && !b.ownerId)!;
  const rel = await page.request.post('/api/test/relocate-ship', {
    data: { shipId: victimId, bodyId: wild.id },
  });
  expect(rel.ok()).toBe(true);
  const sv = await page.request.post('/api/test/ship-survival', {
    data: { shipId: victimId, foodT: 1e-8, waterT: 1e-8 },
  });
  expect(sv.ok()).toBe(true);
  // survival_out (~86 ms réels) : l'épave sort de MA flotte…
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string }[];
        };
        return f.ships.some((s) => s.id === victimId);
      },
      { timeout: 30_000 },
    )
    .toBe(false);
  // …et apparaît au radar des épaves.
  await expect
    .poll(
      async () => {
        const g = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
          derelicts: { id: string }[];
        };
        return g.derelicts.some((d) => d.id === victimId);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // 3. Le claimer : rig monté à quai (vraie commande UI), vol à 0,5 pc.
  // (Le chantier a consommé l'acier : trésorerie du rig re-provisionnée.)
  const regrant = await page.request.post('/api/test/grant', {
    data: { planetId, resource: 'steel_l', tons: 50 },
  });
  expect(regrant.ok()).toBe(true);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel.getByRole('button', { name: 'Fit claim rig' }).click();
  await expect(page.getByRole('status')).toContainText('Claim rig mounted');
  // Radar « Wrecks » : l'épave est listée (le label d'optgroup n'entre
  // pas dans textContent — on vérifie l'option elle-même, marqueur †).
  await expect(
    page.getByRole('combobox', { name: 'Galaxy contact index' }),
  ).toContainText(`${victimName} († cargo s)`);
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(sf.ok()).toBe(true);
  const mv = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: wild.x + 0.5, y: wild.y },
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

  // 4. RÉCLAMER : bouton sur zone, minuteur, puis l'épave rejoint la flotte.
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel
    .getByRole('button', { name: new RegExp(`Claim ${victimName}`) })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Claim under way — hold position for two hours.',
  );
  await shot(page, 'cl-01-claim-under-way');
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === victimId)?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('idle');
  const g2 = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    derelicts: { id: string }[];
  };
  expect(g2.derelicts.some((d) => d.id === victimId)).toBe(false);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${victimId}`);
    await expect(
      page.getByRole('complementary', { name: victimName }),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'cl-02-wreck-reclaimed');
});
