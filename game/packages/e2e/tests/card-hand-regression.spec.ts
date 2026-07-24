/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Card hand UI”/“Card hand v2”; GAME_BOOK.md §17/§18; docs/DESIGN_SYSTEM.md §5. */
/**
 * E2E — clôture AO + télescope sur tuile (décisions propriétaire
 * 2026-07-19/20, CLAUDE.md §16/§18).
 *
 * Preuves dans un seul parcours cohérent : deck replié à tranche 64 px,
 * dépliage pointeur + focus, télescope placé sur une vraie tuile et ouvert
 * dans le panneau bâtiment standard, puis carte DÉVERROUILLÉE conservée avec
 * « max 1 ». Le serveur refuse aussi directement une deuxième instance.
 */
import { expect, test, type Page } from '@playwright/test';
import { boardHelpers, registerSovereign, revealCard, shot } from './lib.js';

const runId = Date.now().toString(36);
const email = `e2e-cardreg-${runId}@test.local`;

async function openStarter(page: Page): Promise<void> {
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
}

test('AO + telescope : tranche accessible, pose sur tuile et plafond max 1 visible', async ({
  page,
}) => {
  await registerSovereign(page, email, 'CardReg');
  await openStarter(page);

  const board = await boardHelpers(
    page,
    (await page.request.get('/api/me').then((r) => r.json()) as {
      planets: { id: string }[];
    }).planets[0]!.id,
  );
  const hand = board.hand;
  const teleCard = hand
    .getByRole('article')
    .filter({ hasText: /^telescope/i })
    .first();

  // Départ : déverrouillé et posable (savoir de départ, GB §19). La carte
  // non finale avance de 64 px exactement dans le deck, quelle que soit sa
  // largeur responsive.
  await expect(teleCard).toBeVisible();
  const advances = await hand.locator('.ls-construction-card').evaluateAll((cards) =>
    cards.slice(1).map((card) => {
      const style = getComputedStyle(card);
      return parseFloat(style.width) + parseFloat(style.marginLeft);
    }),
  );
  expect(advances.length).toBeGreaterThan(0);
  for (const advance of advances) expect(advance).toBeCloseTo(64, 0);
  const spine = teleCard.locator('.ls-card-spine');
  await expect(spine).toContainText('telescope');
  await expect(spine).toHaveCSS('width', '64px');

  // Focus clavier/tactile : la carte entière passe au premier plan sans
  // dépendre d'une animation. Puis même preuve au pointeur depuis la tranche.
  await teleCard.focus();
  await expect(teleCard).toHaveCSS('z-index', '6');
  await expect(spine).toHaveCSS('opacity', '0');
  await teleCard.evaluate((card) => (card as HTMLElement).blur());
  await expect(spine).toHaveCSS('opacity', '1');
  await teleCard.hover({ position: { x: 16, y: 120 } });
  await expect(teleCard).toHaveCSS('z-index', '6');
  await expect(teleCard.getByRole('button', { name: 'Place' })).toBeVisible();

  // Passage entre cartes : sortir du deck puis viser la tranche voisine doit
  // rabattre la précédente. Sans ce geste, la carte levée masque la tranche
  // suivante (régression détectée par le balayage complet).
  const probeCard = hand
    .getByRole('article')
    .filter({ hasText: /^probe pad/i })
    .first();
  await revealCard(probeCard);
  await expect(probeCard).toHaveCSS('z-index', '6');
  await expect(spine).toHaveCSS('opacity', '1');
  await revealCard(teleCard);
  await shot(page, 'ao-01-card-hand-fold-open');

  // Sélection explicite : le troisième chemin du contrat AO doit lui aussi
  // garder la carte entière au premier plan, indépendamment du hover courant.
  const tile0 = board.tilePx(0);
  await teleCard.getByRole('button', { name: 'Place' }).click();
  await expect(teleCard).toHaveAttribute('data-selected', 'true');
  await expect(teleCard).toHaveCSS('z-index', '6');

  // Pose sur la vraie tuile 0, puis panneau bâtiment STANDARD depuis la tuile.
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string }[];
  };
  const planetId = me.planets[0]!.id;
  await page.mouse.click(tile0[0], tile0[1]);
  await expect.poll(() => board.hasBuilding('telescope'), { timeout: 40_000 }).toBe(true);
  const detail = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    buildings: { id: string; key: string; tileIndex: number | null }[];
  };
  const telescope = detail.buildings.find((b) => b.key === 'telescope');
  expect(telescope?.tileIndex).toBe(0);
  await board.openPanel(tile0, /^telescope$/i);
  await expect(board.panel).toContainText('Surface unit / telescope');
  await shot(page, 'ao-02-telescope-on-tile-panel');

  // CŒUR DE LA RÉGRESSION : max 1 atteint, la carte ne disparaît PAS.
  await expect(teleCard).toBeVisible();
  await expect(teleCard).toHaveAttribute('data-blocked', 'true');
  await teleCard.hover({ position: { x: 16, y: 120 } });
  await expect(teleCard.locator('.ls-card-blocked')).toContainText('max 1');
  await expect(teleCard.getByRole('button', { name: 'Place' })).toHaveCount(0);
  await shot(page, 'ao-03-telescope-max-one-visible');

  // Refus direct (§10) : l'API ne dépend pas du filtre client.
  const duplicate = await page.request.post(`/api/planets/${planetId}/build`, {
    data: { building: 'telescope', tileIndex: 1, recipe: null },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).error).toBe('max_instances');

  // Deuxième viewport contractuel : le minimum 1280 × 800 conserve la
  // tranche, la carte bloquée et le panneau sans collision horizontale.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(teleCard).toBeVisible();
  const compactAdvances = await hand.locator('.ls-construction-card').evaluateAll((cards) =>
    cards.slice(1).map((card) => {
      const style = getComputedStyle(card);
      return parseFloat(style.width) + parseFloat(style.marginLeft);
    }),
  );
  for (const advance of compactAdvances) expect(advance).toBeCloseTo(64, 0);
  await expect(board.panel).toBeVisible();
  await shot(page, 'ao-04-tablet-minimum');
});
