/** @verifies This test file verifies: docs/MASTER_PLAN.md §W8 (W8e); JOURNAL 2026-07-22 (plan W8e persisté). */
/**
 * E2E — W8e : le Crusader dans l'UI. Fixture déterministe (§15 :
 * /test/spawn-crusader — la NAISSANCE réelle est couverte par
 * crusader.test) puis parcours réel : panneau de bord (pop, stock,
 * balance), FABRICATION à bord (usinage d'office — l'item apparaît
 * dans la balance), amarrage du hauler par l'UI, INSTALLATION depuis
 * la balance de bord (accessoire monté au terme), pose d'une quille à
 * bord (coque née AMARRÉE au Crusader).
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('Crusader : panneau de bord, fabrication, amarrage, installation, quille', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-cr-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Admiral', 'Industrialist');
  const spawn = await page.request.post('/api/test/spawn-crusader', {
    data: { planetId, name: 'Ark Royal' },
  });
  expect(spawn.ok()).toBe(true);
  const { crusaderId } = (await spawn.json()) as { crusaderId: string };
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;

  // --- Panneau du Crusader : pop / stock / balance, fabrication -----------
  const arkPanel = page.getByRole('complementary', { name: 'Ark Royal' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${crusaderId}`);
    await expect(arkPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  const cruSection = arkPanel.getByRole('region', {
    name: 'Crusader — flying colony',
  });
  await expect(cruSection).toBeVisible();
  await expect(cruSection.getByText(/Aboard : 500/)).toBeVisible();
  await shot(page, 'cr-01-crusader-panel');

  await cruSection
    .getByRole('combobox', { name: 'Fabricate aboard (auto work-order)' })
    .selectOption('cargo_netting');
  await cruSection.getByRole('button', { name: 'Fabricate' }).click();
  await expect(page.getByRole('status')).toContainText('Crusader order accepted');
  // Usinage d'office : 24 h-jeu @ ×7200 ≈ 12 s — l'item entre en balance.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; crusader: { items: Record<string, number> } | null }[];
        };
        return f.ships.find((x) => x.id === crusaderId)!.crusader?.items
          ?.cargo_netting ?? 0;
      },
      { timeout: 120_000 },
    )
    .toBe(1);
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${crusaderId}`);
    await expect(arkPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(cruSection.getByText(/cargo netting ×1/)).toBeVisible();
  await shot(page, 'cr-02-item-in-balance');

  // --- Amarrage du hauler par l'UI ----------------------------------------
  const undock = await page.request.post(`/api/ships/${haulerId}/undock`, { data: {} });
  expect(undock.ok()).toBe(true);
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel.getByRole('button', { name: 'Dock at Crusader' }).click();
  await expect(page.getByRole('status')).toContainText('Crusader order accepted');

  // --- Installation depuis la balance de bord -----------------------------
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${haulerId}`);
    await expect(
      haulerPanel.getByText('Docked at Crusader'),
    ).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'cr-03-docked-at-crusader');
  await haulerPanel
    .getByRole('combobox', { name: 'Install from Crusader hold' })
    .selectOption('cargo_netting');
  await haulerPanel.getByRole('button', { name: 'Install aboard' }).click();
  await expect(page.getByRole('status')).toContainText('Crusader order accepted');
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; accessories: string[] }[];
        };
        return f.ships
          .find((x) => x.id === haulerId)!
          .accessories.includes('cargo_netting')
          ? 'mounted'
          : 'installing';
      },
      { timeout: 90_000 },
    )
    .toBe('mounted');

  // --- Quille posée à bord : la coque naît AMARRÉE ------------------------
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${crusaderId}`);
    await expect(arkPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await arkPanel.getByLabel('Ship name').fill('Dinghy');
  await arkPanel.getByRole('button', { name: 'Lay the keel' }).click();
  await expect(page.getByRole('status')).toContainText('Crusader order accepted');
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string; followShipId: string | null }[];
        };
        const born = f.ships.find((x) => x.name === 'Dinghy');
        return born && born.status === 'docked' && born.followShipId === crusaderId
          ? 'aboard'
          : 'building';
      },
      { timeout: 180_000 },
    )
    .toBe('aboard');
  await shot(page, 'cr-04-keel-laid-aboard');

  // --- Codex : le chapitre « Flying colony » n'existe QUE pour un
  // propriétaire de Crusader (spoiler-free), chiffres LIVE. ------------
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Codex' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Flying colony' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Flying colony' }),
  ).toBeVisible();
  await dialog.getByText('Exact rule & formula').click();
  await expect(dialog.getByText('2,000')).toBeVisible(); // cap pop LIVE
  await shot(page, 'cr-05-codex-flying-colony');
});
