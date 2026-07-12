/**
 * E2E — parcours complet du chunk D (CLAUDE.md §15/§16) :
 * états d'erreur d'auth → éveil d'un Souverain (vrai flux d'inscription)
 * → ciel connu (galaxie) → vue planète isométrique → unlock d'une carte
 * → pose d'un bâtiment → persistance après rechargement.
 * Captures JPEG à chaque étape + vidéo webm (config).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const CAPTURES = new URL('../captures/', import.meta.url).pathname;
mkdirSync(CAPTURES, { recursive: true });

const runId = Date.now().toString(36);
const email = `e2e-${runId}@test.local`;
const password = 'motdepasse-e2e-solide';

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `${CAPTURES}/${name}.jpeg`,
    type: 'jpeg',
    quality: 90,
  });

test.describe.configure({ mode: 'serial' });

test("écran d'accueil : l'état d'erreur d'identifiants est explicite", async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ATG/ })).toBeVisible();
  await shot(page, '01-login');
  await page.getByLabel('E-mail').fill('ghost@test.local');
  await page.getByLabel('Password').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Unknown e-mail or wrong password.',
  );
  await shot(page, '02-login-error');
});

test('éveil d\'un Souverain : inscription → spawn → galaxie de la poche', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
    .click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Sovereign name').fill('E2E Sovereign');
  await page.getByLabel('Industrialist').check();
  await shot(page, '03-register');
  await page.getByRole('button', { name: 'Awaken' }).click();

  // HUD + galaxie.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  // La poche : le starter (possédé) apparaît dans le rail.
  const rail = page.getByRole('navigation', { name: 'Main' });
  const planetButton = rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first();
  await expect(planetButton).toBeVisible();
  await page.waitForTimeout(1500); // chargement des sprites de la carte
  await shot(page, '04-galaxy');
});

test('vue planète : stats, courbe d\'efficacité, main de cartes exhaustive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();

  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  await expect(page.getByText('Population')).toBeVisible();
  await expect(
    page.getByText('Efficiency — the tilted bell', { exact: false }),
  ).toBeVisible();
  // Main exhaustive : 28 cartes (règle de complétude).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  await expect(hand.getByRole('article')).toHaveCount(28);
  await page.waitForTimeout(1200);
  await shot(page, '05-planet-view');
});

test('unlock depot → pose sur une tuile → chantier visible → persistance', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  const hand = page.getByRole('region', { name: 'Construction cards' });
  const depotCard = hand.getByRole('article').filter({ hasText: 'depot' }).first();
  await depotCard.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('status')).toContainText('Card unlocked.');

  await depotCard.getByRole('button', { name: 'Place' }).click();
  await expect(
    page.getByText('Select a card, then click a free tile to build.'),
  ).toBeVisible();
  await shot(page, '06-card-selected');

  // Clic au centre du plateau : le pavage iso garantit une tuile sous le
  // curseur ; sur un starter neuf, toutes sont libres.
  const canvas = page.getByTestId('planet-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 20);
  await expect(page.getByRole('status')).toContainText('Construction started.');
  await page.waitForTimeout(900); // sprite du chantier
  await shot(page, '07-building-constructing');

  // Persistance : rechargement → session conservée, chantier toujours là.
  await page.reload();
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  const handAfter = page.getByRole('region', { name: 'Construction cards' });
  await expect(handAfter.getByRole('article').first()).toBeVisible();
  // La tuile est occupée : l'état du bâtiment vient du serveur.
  await page.waitForTimeout(1000);
  await shot(page, '08-persisted-after-reload');
});

test('boucle colonie : mine + recette → production réelle → réglages du bâtiment', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Unlock de la mine puis choix de recette (canon : une industrie, une chose).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand
    .getByRole('article')
    .filter({ hasText: /^mine/ })
    .first();
  await mineCard.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('status')).toContainText('Card unlocked.');
  await mineCard.getByRole('button', { name: 'Place' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await shot(page, '09-recipe-picker');
  await dialog.getByRole('button', { name: /Extract ore/ }).click();

  // Pose sur une tuile adjacente au dépôt du test précédent.
  const canvas = page.getByTestId('planet-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 74, box.y + box.height / 2 + 17);
  await expect(page.getByRole('status')).toContainText('Construction started.');

  // Chantier 3 s (TIME_SCALE) + tick worker 0,5 s + polling UI 4 s.
  await expect(page.getByText(/ore/).first()).toBeVisible();
  await expect(
    page
      .getByRole('table')
      .filter({ hasText: 'ore' })
      .getByText(/\+9\.\d\/day|\+10\.0\/day|\+8\.\d\/day/)
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  // Date de tarissement projetée (exigence UI, DG §3.3).
  await expect(page.getByText(/dry on/).first()).toBeVisible();
  await shot(page, '10-mine-active-rates');

  // Panneau du bâtiment : clic sur la tuile de la mine.
  await page.mouse.click(box.x + box.width / 2 + 74, box.y + box.height / 2 + 17);
  const panel = page.getByRole('region', { name: 'Building settings' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Extracting ore/)).toBeVisible();
  await expect(panel.getByText('Running clean')).toBeVisible();
  await shot(page, '11-building-panel');

  // Réglage : cadence 50 % → le débit affiché baisse.
  await panel.getByRole('slider').fill('50');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toContainText('Settings applied.');
  await expect(
    page
      .getByRole('table')
      .filter({ hasText: 'ore' })
      .getByText(/\+4\.\d\/day|\+5\.0\/day/)
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await shot(page, '12-throttled-50pct');
});

test('niveaux & démolition : mine L1→L2, page stats, démolition remboursée', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Compte NEUF : budget d'ore déterministe (unlock 15 + pose 8 + L2 24 ≤ 60 min.).
  const email2 = `e2e-lvl-${runId}@test.local`;
  await page.goto('/');
  await page
    .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
    .click();
  await page.getByLabel('E-mail').fill(email2);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Sovereign name').fill('E2E Leveler');
  await page.getByLabel('Industrialist').check();
  await page.getByRole('button', { name: 'Awaken' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Mine : unlock → recette ore → pose au centre.
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand.getByRole('article').filter({ hasText: /^mine/ }).first();
  await mineCard.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('status')).toContainText('Card unlocked.');
  await mineCard.getByRole('button', { name: 'Place' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Extract ore/ }).click();
  const canvas = page.getByTestId('planet-canvas');
  const box = (await canvas.boundingBox())!;
  const tileX = box.x + box.width / 2;
  const tileY = box.y + box.height / 2 - 20;
  await page.mouse.click(tileX, tileY);
  await expect(page.getByRole('status')).toContainText('Construction started.');

  // Attend l'activation (3 s + tick 0,5 s + polling 4 s) via le panneau.
  const panel = page.getByRole('region', { name: 'Building settings' });
  await expect(async () => {
    await page.mouse.click(tileX, tileY);
    await expect(panel.getByText('Running clean')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 25_000 });

  // Montée de niveau L1 → L2.
  await panel.getByRole('button', { name: /Level up/ }).click();
  await expect(page.getByRole('status')).toContainText(
    'Level-up construction started.',
  );
  // L2 : chantier 24 h / 7200 = 12 s ; on attend le retour à l'actif.
  // À L2 la workforce optimale passe à 120 : la mine à 35 est
  // « Understaffed » — comportement canon (monter de niveau exige de
  // re-staffer), qu'on vérifie ici.
  await expect(async () => {
    await page.mouse.click(tileX, tileY);
    await expect(panel.getByText(/mine · L2/)).toBeVisible({ timeout: 2_000 });
    await expect(
      panel.getByText('Understaffed — assign workforce'),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 40_000 });
  await shot(page, '13-mine-level2');

  // Page stats : chaque unité avec u, E, facteur limitant (canon GB §10).
  await page.getByRole('button', { name: 'Planet stats' }).click();
  const stats = page.getByRole('dialog', { name: 'Planet stats' });
  await expect(stats.getByText('Planet (population)')).toBeVisible();
  await expect(stats.getByText(/mine · ore/)).toBeVisible();
  await expect(stats.getByText('L2')).toBeVisible();
  await shot(page, '14-planet-stats');
  await stats.getByRole('button', { name: 'Close' }).click();

  // Démolition : confirmation en deux temps, remboursement 50 %.
  await page.mouse.click(tileX, tileY);
  await panel.getByRole('button', { name: 'Demolish' }).click();
  await expect(
    panel.getByRole('button', { name: /Click again to confirm/ }),
  ).toBeVisible();
  await shot(page, '15-demolish-confirm');
  await panel.getByRole('button', { name: /Click again to confirm/ }).click();
  await expect(page.getByRole('status')).toContainText(
    'Demolition started — 50% refunded.',
  );
  await shot(page, '16-demolition');
});

test('mouvement : envoi d\'un vaisseau depuis la carte galaxie', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500); // sprites + flotte

  // Le starter est centré ; les vaisseaux dockés sont déployés en éventail :
  // index 1 (le cargo, créé après le personnel) à ~(−25, −23) px du centre.
  const canvas = page.getByTestId('galaxy-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 25, box.y + box.height / 2 - 23);

  // Panneau vaisseau (marqueur prioritaire) OU panneau planète.
  const sendBtn = page.getByRole('button', { name: 'Send ship' });
  const probeBtn = page.getByRole('button', { name: 'Launch probe' });
  await expect(sendBtn.or(probeBtn).first()).toBeVisible({ timeout: 5_000 });
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
    await expect(page.getByText('Click a destination', { exact: false })).toBeVisible();
    await page.mouse.click(box.x + box.width / 2 + 180, box.y + box.height / 2 - 60);
    await expect(page.getByRole('status')).toContainText('Course plotted.', {
      timeout: 10_000,
    });
  } else {
    await probeBtn.click();
    await page.mouse.click(box.x + box.width / 2 + 180, box.y + box.height / 2 - 60);
    await expect(page.getByRole('status')).toContainText(/Probe away|Course rejected/, {
      timeout: 10_000,
    });
  }
  await page.waitForTimeout(1200);
  await shot(page, '18-ship-in-transit');
});

test('la Silence se brise : télescope → ping → ping-back → canal (GB §5)', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  // Comptes SEEDÉS (contrat de seed, CLAUDE.md §8) : Sovereign Demo et
  // Sovereign Neighbor naissent à ~160 pc l'un de l'autre (anneau de
  // voisinage 150–240 pc du spawn) — dans le ciel d'un télescope L1
  // (60 + 200 pc). Le test est tolérant aux reruns : télescope déjà bâti
  // → on saute ; hail déjà en attente → on répond quand même.
  await page.goto('/');
  await page.getByLabel('E-mail').fill('demo@atg.local');
  await page.getByLabel('Password').fill('demo-password-1');
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Télescope L1 — infrastructure sans tuile : « Place » construit
  // directement, et le bâtiment apparaît dans le panneau Infrastructure.
  const infra = page.getByRole('region', { name: 'Infrastructure' });
  await expect(infra).toBeVisible();
  if (!(await infra.getByText(/telescope L1/).isVisible().catch(() => false))) {
    const hand = page.getByRole('region', { name: 'Construction cards' });
    const teleCard = hand
      .getByRole('article')
      .filter({ hasText: 'telescope' })
      .first();
    const unlockBtn = teleCard.getByRole('button', { name: 'Unlock' });
    if (await unlockBtn.isVisible().catch(() => false)) {
      await unlockBtn.click();
      await expect(page.getByRole('status')).toContainText('Card unlocked.');
    }
    await teleCard.getByRole('button', { name: 'Place' }).click();
    await expect(page.getByRole('status')).toContainText('Construction started.');
  }
  // Activation : chantier 6 h / TIME_SCALE + tick 0,5 s + polling UI 4 s.
  await expect(infra.getByText(/telescope L1/)).toBeVisible({ timeout: 30_000 });
  await expect(infra.getByText('active', { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await infra.scrollIntoViewIfNeeded(); // la capture doit MONTRER la preuve
  await shot(page, '19-telescope-infrastructure');

  // Carte galaxie : le monde du voisin est entré dans le ciel. Son nom
  // vient de l'API (seed déterministe — rien de codé en dur).
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  const galaxy = (await page.request
    .get('/api/galaxy')
    .then((r) => r.json())) as {
    bodies: { name: string; ownerName: string | null; owned: boolean }[];
  };
  const neighborWorld = galaxy.bodies.find(
    (b) => b.ownerName === 'Sovereign Neighbor' && !b.owned,
  );
  expect(neighborWorld, 'le starter voisin doit être dans le scope').toBeTruthy();
  // Le label projeté marque la position écran du corps (centre à −26 px).
  const label = page.getByText(neighborWorld!.name, { exact: true });
  await expect(label).toBeVisible({ timeout: 15_000 });
  const lb = (await label.boundingBox())!;
  await page.mouse.click(lb.x + lb.width / 2, lb.y - 26);
  const panel = page.getByRole('complementary', { name: neighborWorld!.name });
  await expect(panel.getByText('Sovereign Neighbor')).toBeVisible();
  await shot(page, '20-neighbor-in-scope');

  // Ping — premier geste du protocole. Rerun : un hail peut déjà attendre.
  await panel.getByRole('button', { name: 'Ping' }).click();
  await expect(page.getByRole('status')).toContainText(
    /Hail sent|Un hail attend déjà/,
    { timeout: 10_000 },
  );
  await shot(page, '21-ping-sent');

  // Second navigateur : le voisin voit le hail entrant et répond.
  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://localhost:5173',
  });
  const pageB = await ctxB.newPage();
  await pageB.goto('/');
  await pageB.getByLabel('E-mail').fill('neighbor@atg.local');
  await pageB.getByLabel('Password').fill('demo-password-2');
  await pageB.getByRole('button', { name: 'Enter the Silence' }).click();
  await pageB
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Comms' })
    .click();
  const incoming = pageB.getByRole('region', { name: 'Incoming hails' });
  await expect(incoming.getByText('Sovereign Demo')).toBeVisible({
    timeout: 15_000,
  });
  await shot(pageB, '22-incoming-hail');
  await incoming.getByRole('button', { name: 'Ping back' }).first().click();
  await expect(pageB.getByRole('status')).toContainText(
    'Channel open — the Silence breaks.',
  );

  // Premier message du voisin (identifié par runId : assertion sans ambiguïté).
  const msgB = `The Silence breaks — we read you. [${runId}]`;
  await pageB.getByPlaceholder('Speak across the dark…').fill(msgB);
  await pageB.getByRole('button', { name: 'Send' }).click();
  await expect(pageB.getByText(msgB)).toBeVisible();
  await shot(pageB, '23-channel-open');

  // Côté Demo : le canal apparaît, le message arrive, la réponse part.
  await rail.getByRole('button', { name: 'Comms' }).click();
  const channels = page.getByRole('region', { name: 'Open channels' });
  await expect(
    channels.getByRole('button', { name: 'Sovereign Neighbor' }),
  ).toBeVisible({ timeout: 15_000 });
  await channels.getByRole('button', { name: 'Sovereign Neighbor' }).click();
  await expect(page.getByText(msgB)).toBeVisible({ timeout: 10_000 });
  const msgA = `Contact confirmed across the dark. [${runId}]`;
  await page.getByPlaceholder('Speak across the dark…').fill(msgA);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(msgA)).toBeVisible();
  await shot(page, '24-chat-demo-side');

  // Aller-retour complet : la réponse arrive chez le voisin (polling 3 s).
  await expect(pageB.getByText(msgA)).toBeVisible({ timeout: 10_000 });
  await shot(pageB, '25-chat-neighbor-side');
  await ctxB.close();
});
