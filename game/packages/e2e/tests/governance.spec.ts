/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Governance v1”; GAME_BOOK.md §11/§21; DESIGN_GUIDE.md §4.1. */
/**
 * E2E — gouvernance v1 (GB §11/§21, DG §4.1) : sur un monde MOYEN, le
 * vaisseau personnel parqué gouverne (G ×1) ; le décoller fait tomber le
 * monde à G ×0.5 (avertissement visible) ; la préview canon-obligatoire
 * montre masque résultant, nœuds perdus et G ; l'installation exige la
 * confirmation TYPÉE (nom de la planète) et est permanente — le G tient
 * ensuite sans le vaisseau. Le starter est s|m (roll) : son seed pur permet
 * de sélectionner un moyen avant l'inscription (état vérifié par l'API).
 */
import { expect, test } from '@playwright/test';
import { pickEmailByStarterSize, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('gouvernance : vaisseau-gouverneur, demi-efficacité, préview et installation typée', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Un starter MOYEN (exigence 1) — seed prédit puis résultat vérifié.
  const email = pickEmailByStarterSize(`e2e-gov-${runId}`, 'm');
  const planetId = await registerSovereign(page, email, 'Regent');
  const starter = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { size: string };
  expect(starter.size).toBe('m');

  // 2. Parqué au spawn : 0/1 siège mais G ×1 (le vaisseau gouverne).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const gov = page.getByRole('region', { name: 'Governance' });
  const badge = gov.getByTestId('governance-g');
  await expect(badge).toContainText('0/1 seats · G ×1');
  await expect(gov.getByText('Personal ship parked — acting governor')).toBeVisible();
  await gov.scrollIntoViewIfNeeded();
  await shot(page, 'gov-01-ship-governing');

  // 3. Décoller le vaisseau : G ×0.5 + avertissement demi-efficacité.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const anchor = fleet.ships.find((s) => s.name === 'Sovereign anchor')!.id;
  const anchorPanel = page.getByRole('complementary', { name: 'Sovereign anchor' });
  await expect(async () => {
    await page.getByLabel('Galaxy contact index').selectOption(`ship:${anchor}`);
    await expect(anchorPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await anchorPanel.getByRole('button', { name: 'Undock' }).click();
  await expect(page.getByRole('status')).toContainText('Airborne');
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(badge).toContainText('0/1 seats · G ×0.5');
  await expect(
    gov.getByText('Under-governed — world runs at half efficiency'),
  ).toBeVisible();
  await gov.scrollIntoViewIfNeeded();
  await shot(page, 'gov-02-understaffed');
  const halved = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { governance: { g: number } };
  expect(halved.governance.g).toBe(0.5);

  // 4. Un gouverneur-grade au roster (instrumentation §15 — les rolls de
  // pods sont seedés par playerId, non précomputables ici).
  const g = await page.request.post('/api/test/grant-npc', {
    data: { role: 'merchant', rarity: 'rare' },
  });
  expect(g.ok()).toBe(true);
  // Re-entrée sur l'écran planète : le roster de candidats se recharge.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();

  // 5. Préview OBLIGATOIRE : masque résultant, nœuds perdus, G ×1.06.
  await gov
    .getByLabel('Install governor (PERMANENT)')
    .selectOption({ label: 'merchant · rare · human' });
  await gov.getByRole('button', { name: 'Preview mask' }).click();
  const preview = gov.getByTestId('governance-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('mercantile · G ×1.06');
  await expect(preview).toContainText('lost');
  await preview.scrollIntoViewIfNeeded();
  await shot(page, 'gov-03-preview');

  // 6. Confirmation TYPÉE : le bouton reste inerte tant que le nom exact
  // de la planète n'est pas saisi.
  const installBtn = gov.getByRole('button', { name: 'Install forever' });
  await expect(installBtn).toBeDisabled();
  const planetName = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { name: string };
  await gov
    .getByLabel('Type the planet name to confirm — this is irreversible')
    .fill(planetName.name);
  await expect(installBtn).toBeEnabled();
  await installBtn.click();
  await expect(page.getByRole('status')).toContainText('Governor installed');

  // 7. Permanent : 1/1, G ×1.06 SANS le vaisseau ; masque intersecté.
  await expect(badge).toContainText('1/1 seats · G ×1.06');
  await expect(gov.getByText(/merchant · rare · human → mercantile/)).toBeVisible();
  await gov.scrollIntoViewIfNeeded();
  await shot(page, 'gov-04-installed');
  const after = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    governance: { g: number; governors: unknown[]; personalShipParked: boolean };
  };
  expect(after.governance.g).toBe(1.06);
  expect(after.governance.governors).toHaveLength(1);
  expect(after.governance.personalShipParked).toBe(false);
});
