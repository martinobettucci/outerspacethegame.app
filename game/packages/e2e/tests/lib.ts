/**
 * Aides E2E partagées (§15) : choix d'e-mail par ADN de compte (seed pur
 * universe:starter:email — précomputable, zéro roll perdu), inscription,
 * géométrie EXACTE du plateau isométrique (mêmes formules que PlanetView)
 * et poses vérifiées par l'ÉTAT de l'API — jamais par une notice.
 */
import { expect, type Page } from '@playwright/test';
import { planetTechAvailability } from '@atg/shared';
import { mkdirSync } from 'node:fs';

export const CAPTURES = new URL('../captures/', import.meta.url).pathname;
mkdirSync(CAPTURES, { recursive: true });

export const E2E_PASSWORD = 'motdepasse-e2e-solide';

export const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${CAPTURES}/${name}.jpeg`, type: 'jpeg', quality: 90 });

/**
 * n-ième e-mail `<prefix>-<i>@test.local` dont l'ADN tech du starter
 * satisfait le prédicat (le seed du starter est une fonction PURE de
 * l'e-mail — l'ADN se lit AVANT d'inscrire).
 */
export function pickEmailByDna(
  prefix: string,
  predicate: (av: ReturnType<typeof planetTechAvailability>) => boolean,
  nth: number,
): string {
  let seen = 0;
  for (let i = 0; i < 800; i++) {
    const email = `${prefix}-${i}@test.local`;
    if (predicate(planetTechAvailability(`atg-dev-universe-0001:starter:${email}`))) {
      if (seen === nth) return email;
      seen++;
    }
  }
  throw new Error(`aucun e-mail candidat pour ${prefix}`);
}

/** Inscription d'un Souverain neuf ; retourne l'id du monde starter. */
export async function registerSovereign(
  page: Page,
  email: string,
  displayName: string,
  politics: string = 'Industrialist',
): Promise<string> {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
    .click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByLabel('Sovereign name').fill(displayName);
  await page.getByLabel(politics).check();
  await page.getByRole('button', { name: 'Awaken' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({
    timeout: 10_000,
  });
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string }[];
  };
  return me.planets[0]!.id;
}

export interface BoardHelpers {
  tilePx: (index: number) => readonly [number, number];
  hand: ReturnType<Page['getByRole']>;
  panel: ReturnType<Page['getByRole']>;
  unlockCard: (key: string) => Promise<void>;
  placeCard: (key: string, tile: readonly [number, number]) => Promise<void>;
  openPanel: (tile: readonly [number, number], text: RegExp) => Promise<void>;
  hasBuilding: (key: string) => Promise<boolean>;
}

/**
 * Aides du plateau : à appeler UNE fois la vue planète affichée
 * (planet-canvas visible). La géométrie reproduit exactement PlanetView —
 * le nombre de tuiles varie par starter, on ne devine jamais les pixels.
 */
export async function boardHelpers(
  page: Page,
  planetId: string,
): Promise<BoardHelpers> {
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  const box = (await page.getByTestId('planet-canvas').boundingBox())!;
  const detail0 = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { tiles: number };

  const tilePx = (index: number): readonly [number, number] => {
    const TILE_W = 148;
    const TILE_H = 74;
    const cols = Math.ceil(Math.sqrt(detail0.tiles));
    const rows = Math.ceil(detail0.tiles / cols);
    const isoX = (c: number, r: number) => ((c - r) * TILE_W) / 2;
    const isoY = (c: number, r: number) => ((c + r) * TILE_H) / 2;
    const centerX = isoX(cols - 1, 0) / 2 + isoX(0, rows - 1) / 2;
    const centerY = isoY(cols - 1, rows - 1) / 2;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return [
      box.x + box.width / 2 - centerX + isoX(col, row),
      box.y + box.height / 2 - centerY - 20 + isoY(col, row),
    ] as const;
  };

  const hand = page.getByRole('region', { name: 'Construction cards' });
  const panel = page.getByRole('region', { name: 'Building settings' });

  const unlockCard = async (key: string) => {
    const card = hand
      .getByRole('article')
      .filter({ hasText: new RegExp(`^${key}`) })
      .first();
    await expect(async () => {
      const btn = card.getByRole('button', { name: 'Unlock' });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => undefined);
      }
      await expect(card.getByRole('button', { name: 'Place' })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });
  };

  const hasBuilding = async (key: string) => {
    const d = (await page.request
      .get(`/api/planets/${planetId}`)
      .then((r) => r.json())) as { buildings: { key: string }[] };
    return d.buildings.some((b) => b.key === key);
  };

  // Pose vérifiée par l'ÉTAT (API), jamais par la notice : le texte
  // « Construction started. » persiste d'une pose à l'autre et un clic
  // tombé pendant la reconstruction du plateau passerait inaperçu.
  const placeCard = async (key: string, tile: readonly [number, number]) => {
    await expect(async () => {
      if (!(await hasBuilding(key))) {
        const btn = hand
          .getByRole('article')
          .filter({ hasText: new RegExp(`^${key}`) })
          .first()
          .getByRole('button', { name: 'Place' });
        if ((await btn.getAttribute('aria-pressed')) !== 'true') {
          await btn.click().catch(() => undefined);
        }
        await page.mouse.click(tile[0], tile[1]);
        await page.waitForTimeout(400);
      }
      expect(await hasBuilding(key)).toBe(true);
    }).toPass({ timeout: 40_000 });
  };

  const openPanel = async (tile: readonly [number, number], text: RegExp) => {
    await expect(async () => {
      await page.mouse.click(tile[0], tile[1]);
      await expect(panel.getByText(text)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 40_000 });
  };

  return { tilePx, hand, panel, unlockCard, placeCard, openPanel, hasBuilding };
}
