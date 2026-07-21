/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Docks”; GAME_BOOK.md §9/§14; DESIGN_GUIDE.md §5.1/§7/§8.6. */
/**
 * E2E — docks de spaceport (GB §9/§14, DG §5.1/§8.6) : le panneau
 * spaceport affiche l'usage des docks et règle dwell/réservation ; un
 * atterrissage sur docks saturés est REFUSÉ avec un message visible ; le
 * niveau 2 (+2 docks M) débloque l'atterrissage par débordement S→M.
 * Parcours mono-compte sur SON monde (les visiteurs, réservations côté
 * pool et éviction sont couverts par test/integration/docks.test.ts).
 * État vérifié par l'API à chaque étape (jamais sur les seuls notices).
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('docks : usage visible, réglages, refus saturé, débordement au L2', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Inscription — ADN garanti : spaceport + shipyard disponibles.
  const email = pickEmailByDna(
    `e2e-docks-${runId}`,
    (av) =>
      av.available.has('spaceport') &&
      av.available.has('shipyard') &&
      (av.maxLevel.get('spaceport') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Dockmaster');

  // 2. Trésorerie (instrumentation §15) : 2 bâtiments + 2 coques S + L2.
  for (const [resource, tons] of [
    ['ore', 900],
    ['steel_l', 450],
    ['silicon', 90],
    ['fuel_cells', 120],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 3. Infrastructure : depot (prérequis) + spaceport + shipyard.
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const { tilePx, panel, unlockCard, placeCard, openPanel } = await boardHelpers(
    page,
    planetId,
  );
  for (const key of ['depot', 'spaceport', 'shipyard']) {
    await unlockCard(key);
  }
  await placeCard('spaceport', tilePx(0));
  await placeCard('shipyard', tilePx(1));

  // Spaceport ACTIF avant d'ouvrir son panneau (les docks n'existent
  // qu'actifs).
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'spaceport')?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // 4. Panneau spaceport : usage des docks (First hauler à quai = S 1/2),
  // réglage dwell 48 h + 1 dock réservé.
  await openPanel(tilePx(0), /spaceport · L1/);
  const usage = panel.getByTestId('docks-usage');
  await expect(usage).toContainText('S 1/2');
  await expect(usage).toContainText('0 visitors aground');
  await expect(usage).toContainText('max stay 24 game h');
  await shot(page, 'dock-01-usage-l1');

  await panel.getByLabel('Visitor ground stay (game hours, 1–720)').fill('48');
  await panel
    .getByLabel('Docks reserved for own fleet (0–2)')
    .selectOption('1');
  await panel
    .getByRole('region', { name: 'Landing policy' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await expect(page.getByRole('status')).toContainText('Settings applied');
  await expect(usage).toContainText('1 reserved for own fleet');
  await expect(usage).toContainText('max stay 48 game h');
  await shot(page, 'dock-02-settings');

  // 5. Chantier : 2 coques cargo S (nées à quai — l'overfill de chantier
  // est permis et VISIBLE : 3 coques S pour 2 docks S).
  await openPanel(tilePx(1), /shipyard · L1/);
  const yard = panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  for (const name of [`Wedge A ${runId}`, `Wedge B ${runId}`]) {
    await yard.getByLabel('Category').selectOption('cargo');
    await yard.getByLabel('Size').selectOption('s');
    await yard.getByLabel('Ship name').fill(name);
    await expect(async () => {
      await yard.getByRole('button', { name: 'Lay the keel' }).click();
      await expect(page.getByRole('status')).toContainText('Keel laid', {
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const f = (await page.request
            .get('/api/fleet')
            .then((r) => r.json())) as {
            ships: { name: string; status: string }[];
          };
          return f.ships.find((s) => s.name === name)?.status ?? 'absent';
        },
        { timeout: 40_000 },
      )
      .toBe('docked');
  }
  await openPanel(tilePx(0), /spaceport · L1/);
  await expect(usage).toContainText('S 3/2');
  await shot(page, 'dock-03-overfill');

  // 6. Galaxie : décoller le hauler (docks pleins 2/2), atterrissage REFUSÉ.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  // Sélection par l'index de contacts (chemin clavier canonique) : les
  // clics-sprite au pixel près flakent sous contention et près des
  // boutons-étiquettes — la sélection sprite reste couverte par
  // game-flow « mouvement » et hover-drain.
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await haulerPanel.getByRole('button', { name: 'Undock' }).click();
  await expect(page.getByRole('status')).toContainText('Airborne');
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; status: string }[];
      };
      return f.ships.find((s) => s.id === haulerId)?.status;
    })
    .toBe('hovering');

  await haulerPanel.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Docks saturés : aucun dock libre pour une coque S',
  );
  await shot(page, 'dock-04-refus-sature');
  // Vérité backend : toujours en survol.
  const still = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; status: string }[];
  };
  expect(still.ships.find((s) => s.id === haulerId)?.status).toBe('hovering');

  // 7. Spaceport → L2 (+2 docks M) : le S déborde en dock M et se pose.
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await openPanel(tilePx(0), /spaceport · L1/);
  await panel.getByRole('button', { name: 'Level up → L2' }).click();
  await expect(page.getByRole('status')).toContainText('Level-up');
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string; level: number }[];
        };
        const sp = d.buildings.find((b) => b.key === 'spaceport');
        return `${sp?.level}:${sp?.status}`;
      },
      { timeout: 60_000 },
    )
    .toBe('2:active');

  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await haulerPanel.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Touchdown');
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; status: string }[];
      };
      return f.ships.find((s) => s.id === haulerId)?.status;
    })
    .toBe('docked');

  // 8. Preuve visuelle finale : 3 coques S posées sur S 2 + M 2.
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await openPanel(tilePx(0), /spaceport · L2/);
  await expect(usage).toContainText('S 3/2');
  await expect(usage).toContainText('M 0/2');
  await shot(page, 'dock-05-l2-spill');
});
