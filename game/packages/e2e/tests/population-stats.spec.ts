/** @verifies This test file verifies: docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BA–§BD; GAME_BOOK.md §10; DESIGN_GUIDE.md §3.2-v2. */
/**
 * E2E visuel — chunk BC (GB §10, DG §3.2-v2 h/i) : vraie carte clinique,
 * vraie chaîne d'unlock/pose, puis ledger démographique complet avec
 * pyramide, emploi, facteurs de natalité, flux nets et alarmes datées.
 */
import { expect, test } from '@playwright/test';
import {
  boardHelpers,
  pickEmailByDna,
  registerSovereign,
  shot,
} from './lib.js';

const runId = Date.now().toString(36);

test('clinique + stats : pyramide, emploi, flux nets et alarmes de survie', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = pickEmailByDna(
    `e2e-popstats-${runId}`,
    (availability) =>
      availability.available.has('waterworks') &&
      availability.available.has('lab') &&
      availability.available.has('clinic'),
    0,
  );
  const planetId = await registerSovereign(
    page,
    email,
    'Triage Keeper',
    'Civic',
  );

  // Trésorerie d'instrumentation uniquement : toutes les mutations de
  // gameplay passent ensuite par les vraies commandes unlock/build.
  for (const [resource, tons] of [
    ['ore', 500],
    ['silicon', 250],
    ['lithium', 50],
    ['med_1', 50],
    ['hydrogen', 50],
  ] as const) {
    const grant = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(grant.ok()).toBe(true);
  }

  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  await board.unlockCard('waterworks');
  await board.unlockCard('lab');
  await board.unlockCard('clinic');
  await board.placeCard('clinic', board.tilePx(0));

  await expect
    .poll(
      async () => {
        const detail = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((response) => response.json())) as {
          buildings: { key: string; status: string }[];
        };
        return detail.buildings.some(
          (building) =>
            building.key === 'clinic' && building.status === 'active',
        );
      },
      { timeout: 40_000 },
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Planet stats' }).click();
  const stats = page.getByRole('dialog', { name: 'Planet stats' });
  await expect(stats).toBeVisible();
  await expect(stats.getByTestId('population-pyramid')).toContainText(
    'Children',
  );
  await expect(stats.getByTestId('population-pyramid')).toContainText(
    'Consuming but idle',
  );
  await expect(stats.getByTestId('employment-stats')).toContainText(
    'Unemployment',
  );
  await expect(stats.getByTestId('clinic-effect')).toContainText(
    'Best active clinic',
  );
  await expect(stats.getByTestId('clinic-effect')).toContainText('L1');
  await expect(stats.getByTestId('net-production')).toContainText('/day');
  await expect(stats.getByTestId('survival-alarms')).toContainText(
    'Projected depletion',
  );
  await expect(stats.getByText('clinic', { exact: true })).toBeVisible();

  await shot(page, 'pop-bc-clinic-stats-alarms');
});
