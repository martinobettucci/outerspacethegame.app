/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Survival clocks & derelicts”; GAME_BOOK.md §6/§7; DESIGN_GUIDE.md §3.5/§8.8. */
/**
 * E2E — horloges de survie (GB §6, DG §3.5) : le pilote embarque
 * (jauge d'équipage visible, réserves du spawn 2/2), le drain s'arme en
 * survol d'un monde SAUVAGE (instrumentation relocate, §15), la politique
 * auto-flee se désarme/réarme dans le panneau, et l'expiration
 * (provisions quasi nulles via /test/ship-survival) rend la coque
 * DERELICT : équipage mort, épave DISPARUE de la flotte. L'alarme
 * auto-flee elle-même court en JOURS RÉELS — couverte en intégration.
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('survie : jauge, politique de fuite, expiration → derelict', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-sv-${runId}`, () => true, 0);
  await registerSovereign(page, email, 'Lastbreath');

  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet.ships.find((s) => s.name === 'First hauler')!.id;
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });

  // Pilote à bord (vraie commande UI) → jauge de survie visible.
  await haulerPanel.getByRole('button', { name: /Assign pilot/ }).click();
  await expect(page.getByRole('status')).toContainText('Pilot bound');
  const sv = haulerPanel.getByRole('region', { name: 'Crew survival' });
  await expect(sv).toBeVisible();
  await expect(sv.getByText(/1 crew · 2\.00 food \/ 2\.00 water/)).toBeVisible();
  await expect(sv.getByText('host feeds the crew')).toBeVisible(); // à quai
  await shot(page, 'sv-01-gauge-docked');

  // Politique : désarmer puis réarmer (état backend vérifié).
  await sv.getByRole('button', { name: 'Disarm auto-flee' }).click();
  await expect(sv.getByText(/DISARMED/)).toBeVisible();
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; fleeArmed: boolean }[];
      };
      return f.ships.find((s) => s.id === haulerId)?.fleeArmed;
    })
    .toBe(false);
  await sv.getByRole('button', { name: 'Arm auto-flee' }).click();
  await expect(sv.getByText(/armed \(25% alarm\)/)).toBeVisible();

  // Survol d'un monde SAUVAGE (drain armé — instrumentation §15).
  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; bodyType: string; ownerId: string | null }[];
  };
  const wild = galaxy.bodies.find(
    (b) => b.bodyType === 'planet' && !b.ownerId,
  )!;
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 30 },
  });
  expect(sf.ok()).toBe(true);
  const rel = await page.request.post('/api/test/relocate-ship', {
    data: { shipId: haulerId, bodyId: wild.id },
  });
  expect(rel.ok()).toBe(true);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(sv.getByText(/-0\.01 T\/d · draining/)).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'sv-02-draining-wild');

  // Expiration : provisions quasi nulles → derelict (équipage mort,
  // épave dépouillée, DISPARUE de la flotte).
  const set = await page.request.post('/api/test/ship-survival', {
    data: { shipId: haulerId, foodT: 1e-8, waterT: 1e-8 },
  });
  expect(set.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string }[];
        };
        return f.ships.some((s) => s.id === haulerId);
      },
      { timeout: 30_000 },
    )
    .toBe(false);
  await page.getByRole('button', { name: 'Galaxy' }).click();
  await page.waitForTimeout(4_500); // le poll flotte de l'UI retire l'épave
  await shot(page, 'sv-03-derelict-gone');
});
