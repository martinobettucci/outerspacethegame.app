/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Stargates”; GAME_BOOK.md §6; DESIGN_GUIDE.md §9.3–§9.4. */
/**
 * E2E — consentement 50/50 des stargates (canon GB §6, DG §9.3), deux
 * comptes séquentiels (patron manual.spec) : Alice (yard actif, moitié
 * provisionnée) PROPOSE un gate vers le starter de Bob depuis la section
 * Stargates (le monde de Bob est visible via une coque relocalisée §15) ;
 * Bob se connecte, voit la proposition dans l'inbox de SON monde,
 * ACCEPTE — les deux moitiés sont payées, le chantier s'active (48 h ÷
 * 7200 ≈ 24 s) et Bob, co-payeur, TRAVERSE sans péage.
 */
import { expect, test } from '@playwright/test';
import {
  boardHelpers,
  E2E_PASSWORD,
  pickEmailByDna,
  registerSovereign,
  shot,
} from './lib.js';

const runId = Date.now().toString(36);

test('consentement 50/50 : proposer, accepter, traverser co-payeur', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Bob d'abord (cible) — n'importe quel ADN.
  const bobEmail = pickEmailByDna(`e2e-scb-${runId}`, () => true, 0);
  const bobPlanet = await registerSovereign(page, bobEmail, 'Bobward');
  for (const [resource, tons] of [
    ['fuel_cells', 200],
    ['steel_h', 300],
    ['crystal_temperate', 100],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId: bobPlanet, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByLabel('E-mail')).toBeVisible();

  // 2. Alice : yard actif + moitié provisionnée + VISIBILITÉ du monde de
  //    Bob (coque relocalisée §15 — la vision suit la coque).
  const aliceEmail = pickEmailByDna(
    `e2e-sca-${runId}`,
    (av) =>
      av.available.has('mine') &&
      av.available.has('spaceport') &&
      av.available.has('shipyard') &&
      av.available.has('stargate_yard'),
    0,
  );
  const alicePlanet = await registerSovereign(page, aliceEmail, 'Aliceward');
  for (const [resource, tons] of [
    ['ore', 800],
    ['silicon', 100],
    ['steel_l', 200],
    ['steel_h', 2_200],
    ['fuel_cells', 1_200],
    ['crystal_temperate', 500],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId: alicePlanet, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, alicePlanet);
  for (const key of ['depot', 'mine', 'spaceport', 'shipyard', 'stargate_yard']) {
    await board.unlockCard(key);
  }
  await board.placeCard('stargate_yard', board.tilePx(0));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${alicePlanet}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'stargate_yard')?.status ?? '?';
      },
      { timeout: 90_000 },
    )
    .toBe('active');
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  // Réservoir plein AVANT le survol étranger (une coque à sec s'échoue —
  // et les échoués gardent désormais leurs yeux, mais autant survoler).
  const hfa = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 40 },
  });
  expect(hfa.ok()).toBe(true);
  const rel = await page.request.post('/api/test/relocate-ship', {
    data: { shipId: haulerId, bodyId: bobPlanet },
  });
  expect(rel.ok()).toBe(true);

  // 3. PROPOSER depuis la section Stargates du yard.
  await page.reload();
  await expect(rail).toBeVisible({ timeout: 10_000 });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board2 = await boardHelpers(page, alicePlanet);
  await board2.openPanel(board2.tilePx(0), /stargate yard · L1/);
  const gateSection = board2.panel.getByRole('region', { name: 'Stargates' });
  await expect(gateSection).toBeVisible();
  await expect(async () => {
    const select = gateSection.getByLabel(
      'Propose to a foreign world (50/50 split)',
    );
    await expect(select).toBeVisible({ timeout: 2_000 });
    await select.selectOption({ value: bobPlanet });
  }).toPass({ timeout: 30_000 });
  await gateSection.getByRole('button', { name: 'Propose gate' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Proposal sent — both halves are paid on acceptance.',
  );
  await shot(page, 'gc-01-proposal-sent');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByLabel('E-mail')).toBeVisible();

  // 4. Bob : l'inbox de SON monde porte la proposition — ACCEPTER.
  await page.getByLabel('E-mail').fill(bobEmail);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(rail).toBeVisible({ timeout: 10_000 });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const inbox = page.getByRole('region', { name: 'Gate proposals' });
  await expect(inbox).toBeVisible({ timeout: 20_000 });
  await expect(inbox.getByText(/Aliceward proposes a 50\/50 gate from/)).toBeVisible();
  await inbox.scrollIntoViewIfNeeded();
  await shot(page, 'gc-02-inbox-proposal');
  await inbox.getByRole('button', { name: 'Accept & pay half' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Gate accepted — both halves paid, construction begins.',
  );
  // Les moitiés de Bob sont parties (200−125 cells, 300−200 steelH).
  const bobDetail = (await page.request
    .get(`/api/planets/${bobPlanet}`)
    .then((r) => r.json())) as {
    stock: Record<string, { amount: number }>;
  };
  expect(bobDetail.stock.fuel_cells.amount).toBeCloseTo(75, 1);
  expect(bobDetail.stock.steel_h.amount).toBeCloseTo(100, 1);

  // 5. Activation (~24 s) puis traversée SANS péage (co-payeur).
  await expect
    .poll(
      async () => {
        const g = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
          stargates: { status: string }[];
        };
        return g.stargates[0]?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  const bobFleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const bobHauler = bobFleet.ships.find((s) => s.name === 'First hauler')!.id;
  const bf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: bobHauler, units: 40 },
  });
  expect(bf.ok()).toBe(true);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const bobPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${bobHauler}`);
    await expect(bobPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await bobPanel
    .getByRole('button', { name: /Traverse gate → / })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Gate crossed — scattered off the fixed point.',
  );
  const after = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; status: string }[];
  };
  expect(after.ships.find((s) => s.id === bobHauler)?.status).toBe('idle');
  await shot(page, 'gc-03-copayer-crossed-free');
});
