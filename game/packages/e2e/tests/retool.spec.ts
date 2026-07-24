/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Industry”; GAME_BOOK.md §9; DESIGN_GUIDE.md §3.3/§5.1/§6. */
/**
 * E2E — retool des industries (DG §5.1 « re-targeting = 24 h retool » ;
 * §4.1 Industrialist : instantané ≤ 1 switch/24 h) : un Souverain
 * INDUSTRIALIST pose une mine extract:ore, la rééquipe une première fois
 * (INSTANTANÉ — monde-forge, la production continue), puis une seconde
 * fois dans la fenêtre (retool STANDARD : statut retooling, minuteur,
 * production en pause) jusqu'à l'éveil de la nouvelle recette
 * (24 h-jeu ÷ 7200 = 12 s réelles). État vérifié par l'API.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, pickEmailByDna, registerSovereign, revealCard, shot } from './lib.js';

const runId = Date.now().toString(36);

test('retool : instantané Industrialist, puis fenêtre occupée → 24 h minutées', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(`e2e-retool-${runId}`, () => true, 0);
  const planetId = await registerSovereign(page, email, 'Forgeline', 'Industrialist');
  const g = await page.request.post('/api/test/grant', {
    data: { planetId, resource: 'ore', tons: 60 },
  });
  expect(g.ok()).toBe(true);

  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const board = await boardHelpers(page, planetId);
  await board.unlockCard('mine');
  // Pose avec recette (le Place ouvre le sélecteur — canon : une industrie
  // mint une chose).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand.getByRole('article').filter({ hasText: /^mine/ }).first();
  await revealCard(mineCard);
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract ore/ }).click();
  const [tileX, tileY] = board.tilePx(0);
  await expect(async () => {
    await page.mouse.click(tileX, tileY);
    await expect(page.getByRole('status')).toContainText('Construction started.', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 40_000 });
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'mine')?.status;
      },
      { timeout: 60_000 },
    )
    .toBe('active');

  // 1er retool : INSTANTANÉ (gouvernance toute Industrialist).
  await board.openPanel(board.tilePx(0), /mine · L1/);
  await board.panel.getByRole('button', { name: 'Retool', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract silicon/ }).click();
  await expect(page.getByRole('status')).toContainText('instant retool');
  await board.openPanel(board.tilePx(0), /mine · L1/);
  await expect(board.panel.getByText(/Extracting silicon/)).toBeVisible();
  await shot(page, 'ret-01-instant');

  // 2e retool dans la fenêtre : STANDARD — retooling + minuteur, recette
  // déjà écrite, production en pause.
  await board.panel.getByRole('button', { name: 'Retool', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Extract carbon/ }).click();
  await expect(page.getByRole('status')).toContainText('production paused');
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${planetId}`)
        .then((r) => r.json())) as {
        buildings: { key: string; status: string; recipe: string | null }[];
      };
      const mine = d.buildings.find((b) => b.key === 'mine');
      return `${mine?.status}:${mine?.recipe}`;
    })
    .toBe('retooling:extract:carbon');
  await board.openPanel(board.tilePx(0), /mine · L1/);
  await expect(board.panel.getByText(/Retooling · /)).toBeVisible();
  await shot(page, 'ret-02-retooling');

  // Éveil : 24 h-jeu ÷ 7200 = 12 s réelles.
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string; recipe: string | null }[];
        };
        const mine = d.buildings.find((b) => b.key === 'mine');
        return `${mine?.status}:${mine?.recipe}`;
      },
      { timeout: 60_000 },
    )
    .toBe('active:extract:carbon');
  await board.openPanel(board.tilePx(0), /mine · L1/);
  await expect(board.panel.getByText(/Extracting carbon/)).toBeVisible();
  // Un cycle de poll UI (4 s) pour laisser les badges de chantier se
  // résorber — l'état ÉVEILLÉ est prouvé par l'API ci-dessus ; le retard
  // d'affichage des badges est consigné dans SUGGESTIONS.md.
  await page.waitForTimeout(5_000);
  await shot(page, 'ret-03-awake');
});
