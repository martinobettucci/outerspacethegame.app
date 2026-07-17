/**
 * E2E — intel par paliers (GB §20, DG §4.1) : un Souverain SCIENTIFIQUE
 * observe un monde sauvage de sa propre poche (déterministe — la
 * garantie voisin 150–240 pc ancre sur N'IMPORTE quel actif, pas sur
 * l'observateur : on ne s'y fie pas). Échelle : ciel de base → L1 ;
 * télescope L1+scientifique → L2 ; L2 → L3 ; L3 → deep sight (L4).
 * Vérifs backend directes : 404 hors scope, 403 /planets d'un monde non
 * possédé, quality absente de /galaxy pour tout monde étranger.
 */
import { expect, test } from '@playwright/test';
import { boardHelpers, galaxyLabel, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

test('intel : la lunette monte, le monde sauvage se révèle palier par palier', async ({
  page,
}) => {
  test.setTimeout(300_000);

  // 1. ADN garanti : télescope disponible jusqu'au niveau 3.
  const email = pickEmailByDna(
    `e2e-intel-${runId}`,
    (av) => av.available.has('telescope') && (av.maxLevel.get('telescope') ?? 0) >= 3,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Stargazer', 'Scientific');

  // Cible : un monde sauvage de la poche (n'importe quel climat).
  const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: {
      id: string;
      name: string;
      bodyType: string;
      ownerId: string | null;
      quality: string | null;
      owned: boolean;
    }[];
  };
  const wild = galaxy.bodies.find((b) => b.bodyType === 'planet' && !b.ownerId)!;
  expect(wild).toBeTruthy();
  // Fuite fermée : la qualité d'un monde non possédé ne sort JAMAIS de /galaxy.
  for (const b of galaxy.bodies.filter((x) => !x.owned)) {
    expect(b.quality).toBeNull();
  }

  // 2. Palier 1 (ciel de base) : silhouette + rangées verrouillées.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const wildPanel = page.getByRole('complementary', { name: wild.name });
  const selectWild = async () => {
    const label = galaxyLabel(page, wild.name);
    await expect(label).toBeVisible({ timeout: 10_000 });
    const lb = (await label.boundingBox())!;
    await expect(async () => {
      await page.mouse.click(lb.x + lb.width / 2, lb.y - 26);
      await expect(wildPanel).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 40_000 });
  };
  await selectWild();
  await expect(wildPanel.getByText('Intel L1', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(wildPanel.getByText('Level 2 telescope required')).toBeVisible();
  await shot(page, 'int-01-silhouette');

  // 3. Trésorerie + télescope L1 (infrastructure sans tuile).
  for (const [resource, tons] of [
    ['ore', 500],
    ['silicon', 200],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const { hand } = await boardHelpers(page, planetId);
  const teleCard = hand
    .getByRole('article')
    .filter({ hasText: /^telescope/ })
    .first();
  await expect(async () => {
    const unlock = teleCard.getByRole('button', { name: 'Unlock' });
    if (await unlock.isVisible().catch(() => false)) {
      await unlock.click().catch(() => undefined);
    }
    await expect(teleCard.getByRole('button', { name: 'Place' })).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 30_000 });
  await teleCard.getByRole('button', { name: 'Place' }).click();
  const telescopeLevel = async () => {
    const d = (await page.request
      .get(`/api/planets/${planetId}`)
      .then((r) => r.json())) as {
      buildings: { key: string; level: number; status: string }[];
    };
    const t = d.buildings.find(
      (b) => b.key === 'telescope' && b.status === 'active',
    );
    return t?.level ?? 0;
  };
  await expect.poll(telescopeLevel, { timeout: 40_000 }).toBe(1);

  // Palier 2 : télescope L1 + oeil scientifique (personnel à quai).
  const infra = page.getByRole('region', { name: 'Infrastructure' });
  await expect(infra.getByText(/telescope L1/)).toBeVisible();
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await selectWild();
  await expect(wildPanel.getByText('Intel L2', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(wildPanel.getByText('Development', { exact: true })).toBeVisible();
  await expect(wildPanel.getByText(/Tiles used : 0\//)).toBeVisible();
  await shot(page, 'int-02-development');

  // 4. Level up L2 → palier 3 (stratégique).
  // UN SEUL clic sur un état PRÉ-STABLE (niveau cible−1 actif) : un clic
  // Playwright « en attente de visibilité » re-tirerait à l'apparition du
  // bouton suivant et sauterait un palier (observé : 1→3).
  const levelTo = async (target: number) => {
    await rail
      .getByRole('button')
      .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
      .first()
      .click();
    await expect(page.getByTestId('planet-canvas')).toBeVisible();
    await expect.poll(telescopeLevel, { timeout: 60_000 }).toBe(target - 1);
    await page
      .getByRole('region', { name: 'Infrastructure' })
      .getByRole('button', { name: /Level up telescope/ })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Level-up construction started.',
    );
    await expect.poll(telescopeLevel, { timeout: 60_000 }).toBe(target);
  };
  await levelTo(2);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await selectWild();
  await expect(wildPanel.getByText('Intel L3', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(wildPanel.getByText('Strategic', { exact: true })).toBeVisible();
  await expect(wildPanel.getByText(/Deposits present :/)).toBeVisible();
  await shot(page, 'int-03-strategic');

  // 5. Level up L3 → deep sight (L4) : qualité + gisements + ADN tech.
  await levelTo(3);
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await selectWild();
  await expect(wildPanel.getByText('Deep sight', { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(wildPanel.getByText(/Quality :/)).toBeVisible();
  await expect(wildPanel.getByText(/Tech DNA :/)).toBeVisible();
  await shot(page, 'int-04-deep-sight');

  // 6. Refus directs (§10) : id inconnu → 404 ; /planets d'un monde non
  // possédé → 403.
  const bogus = await page.request.get(
    '/api/bodies/00000000-0000-4000-8000-000000000000/intel',
  );
  expect(bogus.status()).toBe(404);
  const foreign = await page.request.get(`/api/planets/${wild.id}`);
  expect(foreign.status()).toBe(403);
});
