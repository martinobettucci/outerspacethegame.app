/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Deterministic sim core” and §P2 “Pocket luck”; GAME_BOOK.md §15/§19; DESIGN_GUIDE.md §1/§2.2b. */
/**
 * E2E — §2.2b frontière latente (directive responsable 2026-07-20,
 * CLAUDE.md §15/§16) : les mondes bonus lointains existent (prouvé en
 * intégration) mais restent INVISIBLES du ciel d'un compte neuf.
 *
 * Preuve observable côté produit : après inscription, /galaxy ne contient
 * QUE la poche — chaque corps rendu est ≤ 150 pc du starter (étoile à
 * 40 pc, sauvages ≤ 60 pc, extras luck ≤ 60 pc). Les mondes bonus naissent
 * à ≥ 800 pc : s'ils fuyaient dans la réponse, l'assertion casse. La carte
 * galaxie rendue est capturée pour la vérification visuelle (§16).
 */
import { expect, test } from '@playwright/test';
import { registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);
const email = `e2e-frontier-${runId}@test.local`;

interface GalaxyBody {
  id: string;
  bodyType: string;
  name: string;
  x: number;
  y: number;
}

test('frontière latente : /galaxy ne montre que la poche, jamais un monde bonus', async ({
  page,
}) => {
  const starterId = await registerSovereign(page, email, 'Frontier');
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();

  const galaxy = (await page.request
    .get('/api/galaxy')
    .then((r) => r.json())) as { bodies: GalaxyBody[] };

  const starter = galaxy.bodies.find((b) => b.id === starterId);
  expect(starter).toBeDefined();

  // Le ciel d'un compte neuf : ciel local 60 pc autour des corps possédés
  // (+ vaisseaux dockés 20 pc). TOUT corps visible appartient à la poche.
  expect(galaxy.bodies.length).toBeGreaterThanOrEqual(3); // starter+étoile+2 sauvages (luck : plus)
  for (const body of galaxy.bodies) {
    const d = Math.hypot(body.x - starter!.x, body.y - starter!.y);
    expect(
      d,
      `${body.bodyType} « ${body.name} » à ${d.toFixed(0)} pc du starter — un monde bonus (≥ 800 pc) a fui dans /galaxy`,
    ).toBeLessThanOrEqual(150);
  }

  // Vérification visuelle (§16) : la carte rendue = la poche seule.
  await page.waitForTimeout(1500); // sprites
  await shot(page, 'frontier-01-pocket-only-sky');
});
