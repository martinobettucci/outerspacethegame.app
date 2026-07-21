/**
 * E2E — W5 champs climatiques stellaires & coque morphique (GB §27,
 * MASTER_PLAN W5, 2026-07-21) : le champ d'une étoile (0,5 × r_nova) est
 * VISUALISÉ au clic ; une coque idle DANS le champ sans l'adaptation
 * appariée paie −4.0 HP/day (Cargo S) ; la morphose se fait SUR PLACE
 * (temps seul, 24 h-jeu ÷ 7200 = 12 s, coque immobilisée — moveShip
 * refusé pendant) ; le péage cesse à la fin de la réécriture.
 */
import { expect, test } from '@playwright/test';
import { galaxyLabel, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('champ stellaire : péage sans adaptation, morphose sur place, plus rien après', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-sh-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Morphwright', 'Scientific');
  const g = await page.request.post('/api/test/grant', {
    data: { planetId, resource: 'fuel_cold', tons: 100 },
  });
  expect(g.ok()).toBe(true);

  // 1. L'étoile de la poche : champ, type, adaptation appariée.
  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: {
      id: string;
      bodyType: string;
      name: string;
      x: number;
      y: number;
      starFuelType: string | null;
      starFieldPc: number | null;
    }[];
  };
  const star = galaxy.bodies.find((b) => b.bodyType === 'star')!;
  expect(star.starFieldPc).toBeGreaterThanOrEqual(19.9);
  const kind =
    star.starFuelType === 'hot'
      ? 'hot'
      : star.starFuelType === 'cold'
        ? 'cold'
        : 'radio';
  const morphLabel =
    kind === 'hot'
      ? 'Morph hull → heat'
      : kind === 'cold'
        ? 'Morph hull → cryo'
        : 'Morph hull → radiation';

  // 2. Visualisation du champ au clic sur l'étoile (§16).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1_000);
  await galaxyLabel(page, star.name).click();
  await page.waitForTimeout(600);
  await shot(page, 'sh-00-star-field');

  // 3. Le hauler (pilote granté §15, fuel §15) vole DANS le champ, hors
  //    de la zone de flare (≤ 5 pc) : seule source = le champ.
  const fleet0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const haulerId = fleet0.ships.find((s) => s.name === 'First hauler')!.id;
  const gn = await page.request.post('/api/test/grant-npc', {
    data: { role: 'pilot', rarity: 'common' },
  });
  expect(gn.ok()).toBe(true);
  const npcs = (await page.request.get('/api/npcs').then((r) => r.json())) as {
    npcs: { id: string; role: string; boundHostId: string | null }[];
  };
  const pilot = npcs.npcs.find((n) => n.role === 'pilot' && !n.boundHostId)!;
  const ac = await page.request.post(`/api/ships/${haulerId}/crew`, {
    data: { npcId: pilot.id },
  });
  expect(ac.ok()).toBe(true);
  const inField = { x: star.x + star.starFieldPc! - 2, y: star.y };
  const mv = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: inField,
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

  // 4. Le péage court : −4.0 HP/day (5 % des 80 HP), vérifié API + UI.
  const wearing = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; hull: { wearPerDay: number; maxHp: number } }[];
  };
  const w = wearing.ships.find((s) => s.id === haulerId)!;
  expect(w.hull.wearPerDay).toBeCloseTo(4, 3);
  expect(w.hull.maxHp).toBe(80);
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(
    haulerPanel.getByText(/−4\.0 HP\/day · wearing — hostile environment/),
  ).toBeVisible();
  await shot(page, 'sh-01-wearing-in-field');

  // 5. Morphose SUR PLACE (temps seul — pas d'atelier, pas de coût) ;
  //    la coque est immobilisée pendant la réécriture (moveShip refusé).
  await haulerPanel.getByRole('button', { name: morphLabel }).click();
  await expect(page.getByRole('status')).toContainText('Molecular rewrite');
  const blocked = await page.request.post(`/api/ships/${haulerId}/move`, {
    data: { x: star.x + 60, y: star.y },
  });
  expect(blocked.status()).toBe(409);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText(/Hull morphing/)).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'sh-02-morphing');

  // 6. Fin de morphose (12 s réelles) : adaptation active, péage ÉTEINT.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: {
            id: string;
            morphingShield: string | null;
            shields: Record<string, boolean>;
            hull: { wearPerDay: number };
          }[];
        };
        const s = f.ships.find((x) => x.id === haulerId)!;
        return `${s.morphingShield}:${s.shields[kind]}:${s.hull.wearPerDay}`;
      },
      { timeout: 60_000 },
    )
    .toBe(`null:true:0`);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel.getByText(/Hull — /)).toBeVisible({
      timeout: 1_500,
    });
  }).toPass({ timeout: 30_000 });
  await expect(
    haulerPanel.getByText(/wearing — hostile environment/),
  ).toHaveCount(0);
  await shot(page, 'sh-03-morphed-no-toll');
});
