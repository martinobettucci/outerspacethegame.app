/** @verifies This test file verifies: docs/MASTER_PLAN.md §R6 (captures §16 en souffrance); CLAUDE.md §16. */
/**
 * R6 — balayage de CAPTURES §16 en souffrance (débloquées par la pile
 * décalée 8081) : halo/cercles de sélection d'une sonde (V1), panneau
 * UI des sondes (V2), zoom galaxie − / ×1 / +, panneau bâtiment
 * (BuildingPanel) sur un bâtiment posé. Les assertions restent
 * minimales : ce spec EXISTE pour produire des captures OBSERVABLES
 * d'états réellement exécutés — la logique de chaque écran est prouvée
 * par ses suites dédiées.
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('captures : halo de sonde, panneau sondes, zoom galaxie, BuildingPanel', async ({
  page,
}) => {
  test.setTimeout(300_000);

  const email = pickEmailByDna(`e2e-cap-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Archivist', 'Scientific');
  for (const [resource, tons] of [
    ['ore', 600],
    ['silicon', 300],
    ['fuel_cold', 100],
    ['fuel_hot', 100],
    ['fuel_gas', 100],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  // Pad L1 par les vraies commandes, puis une sonde en survol.
  const pb = await page.request.post(`/api/planets/${planetId}/build`, {
    data: { building: 'probe_pad', tileIndex: null, recipe: null },
  });
  expect(pb.ok()).toBe(true);
  const padId = ((await pb.json()) as { buildingId: string }).buildingId;
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { id: string; status: string }[];
        };
        return d.buildings.find((x) => x.id === padId)?.status ?? 'absent';
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  const bp = await page.request.post(`/api/planets/${planetId}/probes`, {
    data: {},
  });
  expect(bp.ok()).toBe(true);

  // --- V1/V2 : une sonde sélectionnée — halo/cercles + panneau -----------
  const probe = await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; hullCategory: string }[];
        };
        return f.ships.find((s) => s.hullCategory === 'probe')?.id ?? null;
      },
      { timeout: 60_000 },
    )
    .not.toBeNull()
    .then(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; hullCategory: string }[];
      };
      return f.ships.find((s) => s.hullCategory === 'probe')!;
    });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${probe!.id}`);
    await expect(
      page.getByRole('complementary').first(),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'r6-01-probe-halo-and-panel');

  // --- Zoom galaxie : − puis + (contrôles explicites) ---------------------
  const zoomOut = page.getByRole('button', { name: /zoom out|−/i }).first();
  const zoomIn = page.getByRole('button', { name: /zoom in|\+/i }).first();
  if (await zoomOut.isVisible().catch(() => false)) {
    await zoomOut.click();
    await zoomOut.click();
    await shot(page, 'r6-02-galaxy-zoomed-out');
    await zoomIn.click();
    await zoomIn.click();
    await zoomIn.click();
    await shot(page, 'r6-03-galaxy-zoomed-in');
  } else {
    // Repli : raccourcis clavier documentés (aria de la carte).
    await page.getByTestId('galaxy-canvas').click();
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await shot(page, 'r6-02-galaxy-zoomed-out');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await shot(page, 'r6-03-galaxy-zoomed-in');
  }

  // RELIQUAT R6 (annoncé, MASTER_PLAN) : la capture « BuildingPanel »
  // exige un hit-test de tuile sur le plateau PixiJS (aucun hook DOM) —
  // le hook vit dans PlanetView.tsx, GELÉ par le chantier @spec du
  // responsable au moment de ce chunk.
});
