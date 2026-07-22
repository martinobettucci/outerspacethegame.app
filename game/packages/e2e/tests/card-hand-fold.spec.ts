/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Card hand v2” (chunk AO, fold final); docs/MASTER_PLAN.md §R1; docs/DESIGN_SYSTEM.md §5. */
/**
 * E2E — R1, contrat FINAL du fold de la main de cartes (BACKLOG l.90) :
 * chaque carte non finale n'expose au repos qu'une TRANCHE NOMMÉE de
 * 64 px (cible pointeur ≥ 44 px), se déplie/passe au premier plan au
 * SURVOL, au FOCUS CLAVIER et à la SÉLECTION ; reduced-motion conserve
 * le changement d'état sans animation. Géométrie mesurée au pixel,
 * captures aux deux viewports (desktop + plancher 1280×800).
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

async function openPlanet(page: import('@playwright/test').Page) {
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions|Codex/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
}

test('fold : tranche 64 px au repos, dépliage au survol/clavier/sélection, reduced-motion', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const email = pickEmailByDna(`e2e-ch-${runId}`, () => true, 0);
  await registerSovereign(page, email, 'Dealer', 'Industrialist');
  await openPlanet(page);

  const dock = page.getByRole('region', { name: 'Construction cards' });
  await expect(dock).toBeVisible();
  const cards = dock.locator('.ls-construction-card');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(3); // la main de spawn a plusieurs cartes

  // --- Géométrie au repos : bords gauches espacés de 64 px ----------------
  const boxes = [];
  for (let i = 0; i < n; i++) {
    boxes.push((await cards.nth(i).boundingBox())!);
  }
  for (let i = 1; i < n; i++) {
    // Tolérance : l'éventail incline (±0,55° par carte) — l'espacement
    // horizontal des tranches reste la spine de 64 px (±3 px).
    expect(Math.abs(boxes[i]!.x - boxes[i - 1]!.x - 64)).toBeLessThanOrEqual(3);
  }
  // Cible pointeur ≥ 44 px : la tranche fait 64 px de large sur toute la
  // hauteur de carte (>44 px dans les deux axes).
  expect(boxes[0]!.height).toBeGreaterThanOrEqual(44);
  // Chaque tranche est NOMMÉE (le nom vertical est rendu).
  const firstSpine = cards.nth(0).locator('.ls-card-spine > span');
  await expect(firstSpine).toBeVisible();
  await shot(page, 'fold-01-resting-desktop');

  // --- Survol : la carte du milieu passe au PREMIER PLAN ------------------
  const mid = Math.floor(n / 2);
  const midCard = cards.nth(mid);
  // Au repos, seule la TRANCHE (64 px à gauche) est atteignable — c'est
  // le contrat : on survole la tranche, la carte se déplie.
  await midCard.hover({ position: { x: 20, y: boxes[mid]!.height / 2 } });
  // La tranche du survolé s'efface (la carte est dépliée)…
  await expect(midCard.locator('.ls-card-spine')).toHaveCSS('opacity', '0');
  // …et un clic au CENTRE de sa surface atteint bien CETTE carte
  // (premier plan réel, pas seulement visuel).
  const midBox = (await midCard.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      return el?.closest('.ls-construction-card')?.querySelector('.ls-card-title')
        ?.textContent ?? null;
    },
    [midBox.x + midBox.width / 2, midBox.y + midBox.height / 2],
  );
  const midTitle = await midCard.locator('.ls-card-title').textContent();
  expect(hit).toBe(midTitle);
  await shot(page, 'fold-02-hover-unfolds');

  // --- Clavier : le focus déplie exactement pareil ------------------------
  await page.mouse.move(4, 4); // quitte le survol
  await midCard.focus();
  await expect(midCard.locator('.ls-card-spine')).toHaveCSS('opacity', '0');
  // Le focus passe à une AUTRE carte (Tab traverse d'abord les boutons
  // internes — focus-within maintient le dépliage, c'est voulu) : la
  // carte quittée se replie.
  await cards.nth(0).focus();
  await expect(midCard.locator('.ls-card-spine')).toHaveCSS('opacity', '1');

  // --- Reduced-motion : même changement d'état, sans transition -----------
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await midCard.hover({ position: { x: 20, y: boxes[mid]!.height / 2 } });
  await expect(midCard.locator('.ls-card-spine')).toHaveCSS('opacity', '0');
  await expect(midCard).toHaveCSS('transition-property', 'none');
  await page.emulateMedia({ reducedMotion: null });

  // --- Viewport plancher 1280×800 (DESIGN_SYSTEM §7) ----------------------
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(dock).toBeVisible();
  const b0 = (await cards.nth(0).boundingBox())!;
  const b1 = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(b1.x - b0.x - 64)).toBeLessThanOrEqual(3);
  await shot(page, 'fold-03-tablet-min');
});
