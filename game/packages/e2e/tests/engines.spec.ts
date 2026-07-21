/** @verifies This test file verifies: docs/MASTER_PLAN.md §W2; docs/BACKLOG.md §P3 “Sondes L3 & multi-carburant”; DESIGN_GUIDE.md §8.1–§8.3. */
/**
 * E2E — W2 moteurs typés à l'usinage (MASTER_PLAN W2, JOURNAL
 * 2026-07-21) : un Souverain SCIENTIFIC (pas de retool instantané) pose
 * un chantier naval, lit son outillage moteur par défaut (étoile
 * natale), le rééquipe vers un AUTRE type (retool standard 24 h-jeu ÷
 * 7200 = 12 s réelles, chantier en pause), puis pose une quille : la
 * coque naît avec le MOTEUR de l'outillage (engineType via l'API flotte).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('moteurs typés : outillage natal, retool moteur, quille au nouveau type', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-eng-${runId}`,
    (av) => av.available.has('shipyard'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Enginewright', 'Scientific');
  for (const [resource, tons] of [
    ['ore', 400],
    ['silicon', 60],
    ['steel_l', 200],
    ['fuel_cells', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // Le moteur NATAL est celui du hauler de départ (accordé au spawn, W2).
  const f0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { name: string; engineType: string | null }[];
  };
  const natal = f0.ships.find((s) => s.name === 'First hauler')!.engineType!;
  expect(['cold', 'hot', 'gas']).toContain(natal);
  const other = natal === 'gas' ? 'hot' : 'gas';

  // 1. Chantier actif (vraies commandes, chaîne tech depot→spaceport).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  for (const key of ['depot', 'spaceport', 'shipyard']) {
    await board.unlockCard(key);
  }
  await board.placeCard('shipyard', board.tilePx(0));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'shipyard')?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('active');

  // 2. Outillage par défaut affiché : étoile natale.
  await board.openPanel(board.tilePx(0), /shipyard · L1/);
  const yard = board.panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await expect(yard.getByText('natal star (default)')).toBeVisible();
  await shot(page, 'eng-01-natal-tooling');

  // 3. Retool moteur vers un AUTRE type : standard (Scientific), le
  //    chantier passe en retooling puis s'éveille outillé engine_<other>.
  await yard.getByLabel('Retool engines').selectOption(other);
  await yard.getByRole('button', { name: 'Retool engines' }).click();
  await expect(page.getByRole('status')).toContainText('Yard retooling');
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${planetId}`)
        .then((r) => r.json())) as {
        buildings: { key: string; status: string; recipe: string | null }[];
      };
      const b = d.buildings.find((x) => x.key === 'shipyard');
      return `${b?.status}:${b?.recipe}`;
    })
    .toBe(`retooling:engine_${other}`);
  await shot(page, 'eng-02-retooling');
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string; recipe: string | null }[];
        };
        const b = d.buildings.find((x) => x.key === 'shipyard');
        return `${b?.status}:${b?.recipe}`;
      },
      { timeout: 60_000 },
    )
    .toBe(`active:engine_${other}`);

  // 4. Quille : la coque naît au moteur de l'outillage.
  await board.openPanel(board.tilePx(0), /shipyard · L1/);
  await expect(yard.getByText(/Engine tooling/)).toContainText(other);
  await yard.getByLabel('Category').selectOption('cargo');
  await yard.getByLabel('Size').selectOption('s');
  const shipName = `Typed ${runId}`;
  await yard.getByLabel('Ship name').fill(shipName);
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
          ships: { name: string; engineType: string | null }[];
        };
        return f.ships.find((s) => s.name === shipName)?.engineType ?? null;
      },
      { timeout: 60_000 },
    )
    .toBe(other);
  await shot(page, 'eng-03-typed-keel');
});
