/**
 * E2E — stargates (GB §6, DG §9.3–9.4) : le second monde vient d'une
 * VRAIE colonisation (scriptée par l'API — le parcours UI de la colonie
 * est déjà prouvé par colonization.spec) ; le sujet UI ICI est le GATE :
 * yard T4 débloqué/posé par le plateau, section Stargates du panneau
 * (destination, Build gate), activation (48 h ÷ 7200 ≈ 24 s), bouton
 * bleu « Traverse gate → colonie » sur le panneau vaisseau, et l'arrivée
 * DISPERSÉE ≤ 15 pc du monde de sortie (effets backend vérifiés).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('stargate : chantier au yard, traversée instantanée dispersée', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-sg-${runId}`,
    (av) =>
      av.available.has('spaceport') &&
      av.available.has('shipyard') &&
      av.available.has('workshop') &&
      (av.maxLevel.get('workshop') ?? 0) >= 2 &&
      av.available.has('colony_program') &&
      av.available.has('stargate_yard'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Gatekeeper');
  for (const [resource, tons] of [
    ['ore', 2_000],
    ['silicon', 400],
    ['steel_l', 800],
    ['steel_h', 2_000],
    ['fuel_cells', 1_500],
    ['crystal_temperate', 500],
    ['food_1', 200],
    ['water', 200],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Colonie n° 2 par l'API (parcours UI déjà prouvé — colonization.spec).
  const api = page.request;
  const unlock = async (node: string) => {
    // « Assurer le savoir » : les T0 naissent débloqués sur un starter
    // (GB §19) — already_unlocked est un succès de fixture.
    const r = await api.post(`/api/planets/${planetId}/unlock`, {
      data: { node },
    });
    if (!r.ok()) {
      expect((await r.json()).error, `unlock ${node}`).toBe('already_unlocked');
    }
  };
  const place = async (building: string, tileIndex: number) => {
    const r = await api.post(`/api/planets/${planetId}/build`, {
      data: { building, tileIndex, recipe: null },
    });
    expect(r.ok(), `place ${building}`).toBe(true);
  };
  const activeAll = async (...keys: string[]) => {
    await expect
      .poll(
        async () => {
          const d = (await api
            .get(`/api/planets/${planetId}`)
            .then((r) => r.json())) as {
            buildings: { key: string; status: string }[];
          };
          return keys
            .map((k) => d.buildings.find((b) => b.key === k)?.status ?? '?')
            .join(',');
        },
        { timeout: 90_000 },
      )
      .toBe(keys.map(() => 'active').join(','));
  };
  for (const node of ['depot', 'mine', 'workshop', 'spaceport', 'shipyard', 'colony_program']) {
    await unlock(node);
  }
  await place('workshop', 0);
  await place('spaceport', 1);
  await place('shipyard', 2);
  await activeAll('workshop', 'spaceport', 'shipyard');
  const d0 = (await api.get(`/api/planets/${planetId}`).then((r) => r.json())) as {
    buildings: { id: string; key: string }[];
  };
  const workshopId = d0.buildings.find((b) => b.key === 'workshop')!.id;
  const lv = await api.post(
    `/api/planets/${planetId}/buildings/${workshopId}/levelup`,
  );
  expect(lv.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const d = (await api
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
  const born = await api.post(`/api/planets/${planetId}/ships`, {
    data: { category: 'civil', size: 'm', name: `Ark ${runId}` },
  });
  expect(born.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await api.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string }[];
        };
        return f.ships.find((s) => s.name === `Ark ${runId}`)?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('docked');
  const fleet0 = (await api.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const arkId = fleet0.ships.find((s) => s.name === `Ark ${runId}`)!.id;
  const gn = await api.post('/api/test/grant-npc', {
    data: { role: 'pilot', rarity: 'rare' },
  });
  expect(gn.ok()).toBe(true);
  const npcs = (await api.get('/api/npcs').then((r) => r.json())) as {
    npcs: { id: string; role: string; boundHostId: string | null }[];
  };
  const pilot = npcs.npcs.find((n) => n.role === 'pilot' && !n.boundHostId)!;
  expect((await api.post(`/api/ships/${arkId}/crew`, { data: { npcId: pilot.id } })).ok()).toBe(true);
  expect((await api.post(`/api/ships/${arkId}/colony-kit`)).ok()).toBe(true);
  expect(
    (
      await api.post(`/api/ships/${arkId}/settlers`, {
        data: { count: 300, direction: 'embark' },
      })
    ).ok(),
  ).toBe(true);
  const galaxy0 = (await api.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; bodyType: string; ownerId: string | null; climate: string | null; name: string }[];
  };
  const wild = galaxy0.bodies.find(
    (b) => b.bodyType === 'planet' && !b.ownerId && b.climate !== 'poison',
  )!;
  expect((await api.post(`/api/test/ship-fuel`, { data: { shipId: arkId, units: 120 } })).ok()).toBe(true);
  expect(
    (await api.post(`/api/ships/${arkId}/move`, { data: { bodyId: wild.id } })).ok(),
  ).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await api.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === arkId)?.status;
      },
      { timeout: 120_000 },
    )
    .toBe('hovering');
  expect((await api.post(`/api/ships/${arkId}/colonize`)).ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const g = (await api.get('/api/galaxy').then((r) => r.json())) as {
          bodies: { id: string; owned: boolean }[];
        };
        return g.bodies.find((b) => b.id === wild.id)?.owned ?? false;
      },
      { timeout: 120_000 },
    )
    .toBe(true);

  // 2. LE SUJET : yard T4 par le PLATEAU, section Stargates, Build gate.
  // (Kit colonie et déblocages ont mangé la trésorerie : re-provision.)
  for (const [resource, tons] of [
    ['fuel_cells', 600],
    ['steel_h', 800],
    ['crystal_temperate', 300],
  ] as const) {
    const rg = await api.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(rg.ok()).toBe(true);
  }
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  await board.unlockCard('stargate_yard');
  await board.placeCard('stargate_yard', board.tilePx(3));
  await activeAll('stargate_yard');
  await board.openPanel(board.tilePx(3), /stargate yard · L1/);
  const gateSection = board.panel.getByRole('region', { name: 'Stargates' });
  await expect(gateSection).toBeVisible();
  await gateSection
    .getByLabel('Destination (your worlds)')
    .selectOption({ label: wild.name });
  await gateSection.getByRole('button', { name: 'Build gate' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Gate under construction — the network grows.',
  );
  await expect(gateSection.getByText(/building/)).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, 'sg-01-gate-under-construction');
  await expect
    .poll(
      async () => {
        const g = (await api.get('/api/galaxy').then((r) => r.json())) as {
          stargates: { status: string }[];
        };
        return g.stargates[0]?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // 3. Traversée : bouton bleu sur le panneau du hauler À QUAI, arrivée
  //    dispersée ≤ 15 pc de la colonie.
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;
  // Réservoir plein AVANT la traversée : une coque à sec dans le vide de
  // sortie s'échoue aussitôt (drain idle — physique, mais hors sujet ici).
  const hf = await api.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(hf.ok()).toBe(true);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel
    .getByRole('button', { name: new RegExp(`Traverse gate → ${wild.name}`) })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Gate crossed — scattered off the fixed point.',
  );
  const after = (await api.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; status: string; x: number; y: number }[];
  };
  const h = after.ships.find((s) => s.id === haulerId)!;
  expect(h.status).toBe('idle');
  const dest = galaxy0.bodies.find((b) => b.id === wild.id)!;
  const gAll = (await api.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; x: number; y: number }[];
  };
  const destPos = gAll.bodies.find((b) => b.id === wild.id)!;
  const scatter = Math.hypot(h.x - destPos.x, h.y - destPos.y);
  expect(scatter).toBeGreaterThan(0);
  expect(scatter).toBeLessThanOrEqual(15);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText('idle', { exact: true })).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 20_000 });
  await shot(page, 'sg-02-scattered-arrival');
  void dest;
});
