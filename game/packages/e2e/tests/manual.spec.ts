/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §6. */
/**
 * E2E — canal manuel (GB §9, DG §6 round 7) : le vendeur rend un warehouse
 * PUBLIC (panneau bâtiment) et ouvre son port ; l'acheteur — VRAI second
 * compte — se pose (chemin docks réel), parcourt le stock, envoie une
 * offre (le doublon par ressource est REFUSÉ visiblement) ; le vendeur
 * l'accepte dans sa boîte de réception ; la soute de l'acheteur reçoit le
 * fret. Instrumentation §15 : /test/relocate-ship (les poches de spawn
 * sont disjointes — le vol inter-poches n'est pas déterministe en v1).
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

test('canal manuel : public → browse à quai → offre → acceptation → fret', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. VENDEUR — ADN garanti : spaceport + warehouse disponibles.
  const sellerEmail = pickEmailByDna(
    `e2e-manual-seller-${runId}`,
    (av) => av.available.has('spaceport') && av.available.has('warehouse'),
    0,
  );
  const sellerPlanet = await registerSovereign(page, sellerEmail, 'Sellara');
  for (const [resource, tons] of [
    ['ore', 400],
    ['steel_l', 200],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId: sellerPlanet, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const seller = await boardHelpers(page, sellerPlanet);
  for (const key of ['depot', 'spaceport', 'warehouse']) {
    await seller.unlockCard(key);
  }
  await seller.placeCard('spaceport', seller.tilePx(0));
  await seller.placeCard('warehouse', seller.tilePx(1));
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${sellerPlanet}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return ['spaceport', 'warehouse']
          .map(
            (k) => d.buildings.find((b) => b.key === k)?.status ?? 'absent',
          )
          .join(',');
      },
      { timeout: 60_000 },
    )
    .toBe('active,active');

  // Port ouvert à tous + séjour au max (720 h-jeu ÷ 7200 = 6 min réelles :
  // sans quoi l'éviction de dock du chunk S — 24 h-jeu = 12 s — renverrait
  // l'acheteur au survol avant l'acceptation) + warehouse PUBLIC.
  await seller.openPanel(seller.tilePx(0), /spaceport · L1/);
  const landingSection = seller.panel.getByRole('region', {
    name: 'Landing policy',
  });
  await landingSection.getByRole('combobox').first().selectOption('everyone');
  await expect(page.getByRole('status')).toContainText('Settings applied');
  await landingSection
    .getByLabel('Visitor ground stay (game hours, 1–720)')
    .fill('720');
  await landingSection.getByRole('button', { name: 'Apply' }).click();
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${sellerPlanet}`)
        .then((r) => r.json())) as {
        buildings: { key: string; dwellHours: number | null }[];
      };
      return d.buildings.find((b) => b.key === 'spaceport')?.dwellHours;
    })
    .toBe(720);
  await seller.openPanel(seller.tilePx(1), /warehouse · L1/);
  const visSection = seller.panel.getByRole('region', {
    name: 'Warehouse visibility',
  });
  await visSection.getByRole('combobox').selectOption('public');
  await expect(page.getByRole('status')).toContainText('Settings applied');
  await seller.openPanel(seller.tilePx(1), /warehouse · L1/);
  await expect(
    visSection.getByRole('combobox'),
  ).toHaveValue('public');
  await shot(page, 'man-01-warehouse-public');
  await page.getByRole('button', { name: 'Log out' }).click();

  // 2. ACHETEUR — second compte réel ; 2 T d'eau en soute chez lui.
  const buyerEmail = pickEmailByDna(`e2e-manual-buyer-${runId}`, () => true, 0);
  await registerSovereign(page, buyerEmail, 'Buyara');
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
  const hold = page.getByRole('region', { name: 'Cargo hold' });
  await hold.getByLabel('Resource').selectOption('water');
  await hold.getByLabel('Tons').fill('2');
  await hold.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(hold.getByText(/water · 2\.0 T/)).toBeVisible();
  // Réservoir : le survol d'un monde ÉTRANGER se paie au réservoir (GB §7)
  // — le hauler naît à sec, sans quoi l'arrivée échouerait la coque.
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 30 },
  });
  expect(sf.ok()).toBe(true);

  // 3. Relocalisation (instrumentation) puis ATTERRISSAGE RÉEL (docks).
  const rel = await page.request.post('/api/test/relocate-ship', {
    data: { shipId: haulerId, bodyId: sellerPlanet },
  });
  expect(rel.ok()).toBe(true);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await haulerPanel.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Touchdown');

  // 4. Browse + offre. Le doublon (même ressource) est REFUSÉ visiblement.
  const wh = page.getByRole('region', { name: 'Public warehouse' });
  await expect(wh).toBeVisible({ timeout: 10_000 });
  await expect(wh.getByText(/^ore · /)).toBeVisible();
  await shot(page, 'man-02-browse-docked');
  await wh.getByLabel('Ask for', { exact: true }).selectOption('ore');
  await wh.getByLabel('Ask for T', { exact: true }).fill('2');
  await wh.getByLabel('Pay with', { exact: true }).selectOption('water');
  await wh.getByLabel('Pay with T', { exact: true }).fill('2');
  await wh.getByRole('button', { name: 'Send manual offer' }).click();
  await expect(page.getByRole('status')).toContainText('Manual offer sent');
  await expect(wh.getByText(/2 T ore ← 2 T water/)).toBeVisible();
  await wh.getByRole('button', { name: 'Send manual offer' }).click();
  await expect(page.getByRole('status')).toContainText('seule offre ouverte');
  await shot(page, 'man-03-offer-sent');
  await page.getByRole('button', { name: 'Log out' }).click();

  // 5. VENDEUR : boîte de réception → accepter.
  await page.getByLabel('E-mail').fill(sellerEmail);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(rail).toBeVisible({ timeout: 10_000 });
  const waterBefore = await page.request
    .get(`/api/planets/${sellerPlanet}`)
    .then((r) => r.json())
    .then((d: { stock: Record<string, { amount: number }> }) =>
      Number(d.stock.water?.amount ?? 0),
    );
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const inbox = page.getByRole('region', { name: 'Manual offers' });
  await expect(inbox).toBeVisible({ timeout: 10_000 });
  await expect(inbox.getByText(/Buyara · 2 T ore ← 2 T water/)).toBeVisible();
  await inbox.scrollIntoViewIfNeeded();
  await shot(page, 'man-04-seller-inbox');
  await inbox.getByRole('button', { name: /^Accept/ }).click();
  await expect(page.getByRole('status')).toContainText('Offer accepted');
  await expect(inbox).not.toBeVisible();
  // Vérité backend côté vendeur : l'eau du paiement est au stock.
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${sellerPlanet}`)
        .then((r) => r.json())) as {
        stock: Record<string, { amount: number }>;
      };
      return Number(d.stock.water?.amount ?? 0);
    })
    .toBeGreaterThanOrEqual(waterBefore + 1.9);
  await page.getByRole('button', { name: 'Log out' }).click();

  // 6. ACHETEUR : le fret est à bord (preuve de bout en bout).
  await page.getByLabel('E-mail').fill(buyerEmail);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(rail).toBeVisible({ timeout: 10_000 });
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await expect(hold.getByText(/ore · 2\.0 T/)).toBeVisible();
  await expect(hold.getByText(/water · /)).not.toBeVisible();
  await shot(page, 'man-05-buyer-cargo');
});
