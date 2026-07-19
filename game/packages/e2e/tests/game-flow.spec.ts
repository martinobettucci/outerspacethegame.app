/**
 * E2E — parcours complet du chunk D (CLAUDE.md §15/§16) :
 * états d'erreur d'auth → éveil d'un Souverain (vrai flux d'inscription)
 * → ciel connu (galaxie) → vue planète isométrique → unlock d'une carte
 * → pose d'un bâtiment → persistance après rechargement.
 * Captures JPEG à chaque étape + vidéo webm (config).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { boardHelpers, galaxyLabel } from './lib.js';

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
  // Savoir de départ (GB §19) : le depot naît débloqué — pose directe.
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

  // Mine née débloquée (GB §19) puis choix de recette (canon : une
  // industrie, une chose).
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand
    .getByRole('article')
    .filter({ hasText: /^mine/ })
    .first();
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

  // Mine née débloquée (GB §19) : recette ore → pose au centre.
  const hand = page.getByRole('region', { name: 'Construction cards' });
  const mineCard = hand.getByRole('article').filter({ hasText: /^mine/ }).first();
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
  const label = galaxyLabel(page, neighborWorld!.name);
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

test('fret : charger à quai → décoller → se reposer → décharger (GB §13, DG §7)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Compte NEUF : soute et stock déterministes (Cargo S = 3 conteneurs).
  const email3 = `e2e-cargo-${runId}@test.local`;
  await page.goto('/');
  await page
    .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
    .click();
  await page.getByLabel('E-mail').fill(email3);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Sovereign name').fill('E2E Hauler');
  await page.getByLabel('Industrialist').check();
  await page.getByRole('button', { name: 'Awaken' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500); // sprites + flotte

  // Le cargo docké est déployé en éventail : idx 1 → ~(−25, −23) px.
  const canvas = page.getByTestId('galaxy-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 25, box.y + box.height / 2 - 23);
  const hold = page.getByRole('region', { name: 'Cargo hold' });
  await expect(hold).toBeVisible({ timeout: 5_000 });
  await expect(hold.getByText('Hold empty')).toBeVisible();
  await shot(page, '26-cargo-hold-empty');

  // Charge 2 T d'ore (stock starter ≥ 60).
  await hold.getByLabel('Resource').selectOption('ore');
  await hold.getByLabel('Tons').fill('2');
  await hold.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cargo transferred.');
  await expect(hold.getByText(/ore · 2\.0 T/)).toBeVisible();
  await expect(hold.getByText(/2\/3 containers/)).toBeVisible();
  await shot(page, '27-cargo-loaded');

  // Décoller (survol du même monde) puis se reposer — l'atterrissage est
  // un acte explicite (GB §9), pas une conséquence de l'arrivée.
  await page.getByRole('button', { name: 'Undock', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Airborne — hovering.');
  const landBtn = page.getByRole('button', { name: 'Land', exact: true });
  await expect(landBtn).toBeVisible();
  await shot(page, '28-hovering-land-available');
  await landBtn.click();
  await expect(page.getByRole('status')).toContainText('Touchdown.');
  await expect(page.getByRole('button', { name: 'Undock', exact: true })).toBeVisible();

  // Décharge tout : la soute se vide (le stock remonte côté serveur —
  // vérifié en intégration).
  await hold.getByLabel('Tons').fill('2');
  await hold.getByRole('button', { name: 'Unload', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cargo transferred.');
  await expect(hold.getByText('Hold empty')).toBeVisible();
  await shot(page, '29-cargo-unloaded');
});

test('marché L1 taux fixe : poster une offre → échanger à quai (GB §9/§13)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Compte FIXE : le seed du starter dérive de l'e-mail
  // (universe:starter:email) — l'ADN de ce monde contient market (L3) et
  // depot, vérifié hors-ligne par la fonction pure. Rerun-tolérant :
  // inscription au premier passage, connexion ensuite.
  const emailMkt = 'e2e-market@test.local';
  await page.goto('/');
  await page.getByLabel('E-mail').fill(emailMkt);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  // Attend un état déterministe : HUD (connu) OU alerte (premier passage).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail.or(page.getByRole('alert')).first()).toBeVisible({
    timeout: 10_000,
  });
  if (!(await rail.isVisible().catch(() => false))) {
    await page
      .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
      .click();
    await page.getByLabel('E-mail').fill(emailMkt);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Sovereign name').fill('E2E Marketeer');
    await page.getByLabel('Mercantile').check();
    await page.getByRole('button', { name: 'Awaken' }).click();
    await expect(rail).toBeVisible({ timeout: 10_000 });
  }
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Le marché est-il déjà bâti (rerun) ? Introspection API (lecture seule,
  // les ACTIONS restent pilotées par l'UI) — un clic-sonde sur le canvas
  // arrive trop tôt pendant l'init Pixi.
  const panel = page.getByRole('region', { name: 'Building settings' });
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string }[];
  };
  // Géométrie de tuile PARTAGÉE (lib.boardHelpers) : le « centre du canvas
  // − 20 px » d'avant lib.ts est devenu un coup de dés depuis la refonte
  // des styles de la scène planète.
  const bh = await boardHelpers(page, me.planets[0]!.id);
  const [tileX, tileY] = bh.tilePx(0);
  const detail = (await page.request
    .get(`/api/planets/${me.planets[0]!.id}`)
    .then((r) => r.json())) as { buildings: { key: string }[] };
  if (!detail.buildings.some((b) => b.key === 'market')) {
    const hand = page.getByRole('region', { name: 'Construction cards' });
    for (const key of ['depot', 'market']) {
      const card = hand
        .getByRole('article')
        .filter({ hasText: new RegExp(`^${key}`) })
        .first();
      // La main se re-trie après chaque unlock (re-render) : un clic peut
      // être avalé. On re-clique jusqu'à la PREUVE d'état (bouton Place).
      await expect(async () => {
        const unlockBtn = card.getByRole('button', { name: 'Unlock' });
        if (await unlockBtn.isVisible().catch(() => false)) {
          await unlockBtn.click().catch(() => undefined);
        }
        await expect(card.getByRole('button', { name: 'Place' })).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 30_000 });
    }
    // Pose au centre — re-tentée tant que le plateau Pixi n'est pas
    // interactif (le succès est prouvé par la notice).
    await expect(async () => {
      const placeBtn = hand
        .getByRole('article')
        .filter({ hasText: /^market/ })
        .first()
        .getByRole('button', { name: 'Place' });
      if ((await placeBtn.getAttribute('aria-pressed')) !== 'true') {
        await placeBtn.click();
      }
      await page.mouse.click(tileX, tileY);
      await expect(page.getByRole('status')).toContainText(
        'Construction started.',
        { timeout: 2_500 },
      );
    }).toPass({ timeout: 30_000 });
  }
  // Ouvre le panneau du marché (chantier 6 h / TIME_SCALE ≈ 3 s au premier
  // passage ; déjà actif en rerun). Compte FIXE : le marché historique a pu
  // être posé sur une AUTRE tuile par d'anciennes géométries de clic — on
  // vise la tuile RÉELLE publiée par l'API, jamais une constante.
  const detailNow = (await page.request
    .get(`/api/planets/${me.planets[0]!.id}`)
    .then((r) => r.json())) as {
    buildings: { key: string; tileIndex: number | null }[];
  };
  const marketTile = detailNow.buildings.find((b) => b.key === 'market')!
    .tileIndex!;
  const [mtX, mtY] = bh.tilePx(marketTile);
  await expect(async () => {
    await page.mouse.click(mtX, mtY);
    await expect(panel.getByText(/market · L1/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 45_000 });

  // Poster l'offre : achète ore, paie water @ 0,5 (slot 0 — L1 = 1 slot).
  const slotForm = panel.getByRole('region', { name: 'Trade slot' });
  await expect(slotForm).toBeVisible();
  await slotForm.getByLabel('Buys').selectOption('ore');
  await slotForm.getByLabel('pays').selectOption('water');
  await slotForm.getByLabel(/Rate/).fill('0.5');
  await shot(page, '30-market-slot-form');
  await expect(async () => {
    await slotForm.getByRole('button', { name: 'Post offer' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Offer posted on the open channel.',
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });

  // Côté visiteur (même Souverain, son cargo à quai) : l'offre est là.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const gbox = (await page.getByTestId('galaxy-canvas').boundingBox())!;
  // La scène se reconstruit au polling (5 s) : on re-clique le marqueur
  // jusqu'à l'ouverture du panneau.
  const hold = page.getByRole('region', { name: 'Cargo hold' });
  await expect(async () => {
    await page.mouse.click(
      gbox.x + gbox.width / 2 - 25,
      gbox.y + gbox.height / 2 - 23,
    );
    await expect(hold).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });

  // Normalise la soute (reruns) : décharge l'eau et l'ore résiduels.
  for (const res of ['water', 'ore']) {
    const line = hold.getByText(new RegExp(`^${res} · `));
    if (await line.isVisible().catch(() => false)) {
      const tons = (await line.innerText()).match(/([\d.]+) T/)?.[1] ?? '0';
      await hold.getByLabel('Resource').selectOption(res);
      await hold.getByLabel('Tons').fill(tons);
      await hold.getByRole('button', { name: 'Unload', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Cargo transferred.');
    }
  }

  // Charge 1 T d'ore puis échange contre 0,5 T d'eau au taux posté.
  await hold.getByLabel('Resource').selectOption('ore');
  await hold.getByLabel('Tons').fill('1');
  await hold.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(hold.getByText(/ore · 1\.0 T/)).toBeVisible();

  const offers = page.getByRole('region', { name: 'Market offers' });
  await expect(offers).toBeVisible({ timeout: 10_000 });
  await expect(offers.getByText(/ore → water @ 0\.5/)).toBeVisible();
  await shot(page, '31-market-offers-docked');
  await offers.getByLabel(/Trade ore/).fill('1');
  await offers.getByRole('button', { name: 'Trade', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Trade settled — goods moved.');
  await expect(hold.getByText(/water · 0\.5 T/)).toBeVisible();
  await shot(page, '32-trade-settled');
});

test('hospitalité du monde marchand : publier → acheter sur place (GB §9)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // e2e-market est Mercantile (test précédent, mode série) : son monde
  // vend survie+carburant SANS bâtiment de marché.
  await page.goto('/');
  await page.getByLabel('E-mail').fill('e2e-market@test.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail).toBeVisible({ timeout: 10_000 });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();

  // Publie l'offre innée : vend water contre ore @ 2, plancher 10 T.
  const hosp = page.getByRole('region', { name: 'Hospitality (Mercantile)' });
  await expect(hosp).toBeVisible();
  await hosp.getByLabel('Sells').selectOption('water');
  await hosp.getByLabel('for', { exact: true }).selectOption('ore');
  await hosp.getByLabel(/Price/).fill('2');
  await hosp.getByLabel(/Keep-for-self/).fill('10');
  await hosp.getByRole('button', { name: 'Publish offer' }).click();
  await expect(page.getByRole('status')).toContainText('Hospitality posted');
  await expect(hosp.getByText(/water @ 2 ore\/T · floor 10 T/)).toBeVisible();
  await shot(page, '33-hospitality-published');

  // Le visiteur (son propre cargo, sur place) voit l'offre et achète.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const gbox = (await page.getByTestId('galaxy-canvas').boundingBox())!;
  const hold = page.getByRole('region', { name: 'Cargo hold' });
  await expect(async () => {
    await page.mouse.click(
      gbox.x + gbox.width / 2 - 25,
      gbox.y + gbox.height / 2 - 23,
    );
    await expect(hold).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });

  // Normalise la soute (reruns) puis charge 2 T d'ore pour payer.
  for (const res of ['water', 'ore']) {
    const line = hold.getByText(new RegExp(`^${res} · `));
    if (await line.isVisible().catch(() => false)) {
      const tons = (await line.innerText()).match(/([\d.]+) T/)?.[1] ?? '0';
      await hold.getByLabel('Resource').selectOption(res);
      await hold.getByLabel('Tons').fill(tons);
      await hold.getByRole('button', { name: 'Unload', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Cargo transferred.');
    }
  }
  await hold.getByLabel('Resource').selectOption('ore');
  await hold.getByLabel('Tons').fill('2');
  await hold.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(hold.getByText(/ore · 2\.0 T/)).toBeVisible();

  const hospOffers = page.getByRole('region', { name: 'Hospitality', exact: true });
  await expect(hospOffers).toBeVisible({ timeout: 10_000 });
  await expect(hospOffers.getByText(/water @ 2 ore\/T/)).toBeVisible();
  await shot(page, '34-hospitality-offers-on-site');
  await hospOffers.getByLabel(/Buy water/).fill('0.5');
  await hospOffers.getByRole('button', { name: 'Buy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Hospitality honored');
  await expect(hold.getByText(/water · 0\.5 T/)).toBeVisible();
  await expect(hold.getByText(/ore · 1\.0 T/)).toBeVisible();
  await shot(page, '35-hospitality-honored');
});

test('chantier naval : poser la quille → le vaisseau rejoint la flotte (GB §14)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  // E-mail FIXE (ADN shipyard+spaceport garanti — seed = universe:starter:
  // email) ; les coûts en steelL/cells absents du stock starter passent par
  // l'endpoint de test /test/grant (instrumentation §15, jamais en prod).
  const emailYard = 'e2e-shipyard@test.local';
  await page.goto('/');
  await page.getByLabel('E-mail').fill(emailYard);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the Silence' }).click();
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail.or(page.getByRole('alert')).first()).toBeVisible({
    timeout: 10_000,
  });
  if (!(await rail.isVisible().catch(() => false))) {
    await page
      .getByRole('button', { name: 'No account? Awaken a new Sovereign' })
      .click();
    await page.getByLabel('E-mail').fill(emailYard);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Sovereign name').fill('E2E Shipwright');
    await page.getByLabel('Industrialist').check();
    await page.getByRole('button', { name: 'Awaken' }).click();
    await expect(rail).toBeVisible({ timeout: 10_000 });
  }
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string }[];
  };
  const planetId = me.planets[0]!.id;
  for (const [resource, tons] of [
    ['ore', 270],
    ['steel_l', 190],
    ['fuel_cells', 45],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  // Géométrie partagée + tuile réelle (compte fixe : le chantier historique
  // a pu être posé ailleurs par d'anciennes géométries de clic).
  const bhYard = await boardHelpers(page, planetId);
  const [tileX, tileY] = bhYard.tilePx(0);
  const panel = page.getByRole('region', { name: 'Building settings' });

  const detail = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as { buildings: { key: string }[] };
  if (!detail.buildings.some((b) => b.key === 'shipyard')) {
    const hand = page.getByRole('region', { name: 'Construction cards' });
    for (const key of ['depot', 'spaceport', 'shipyard']) {
      const card = hand
        .getByRole('article')
        .filter({ hasText: new RegExp(`^${key}`) })
        .first();
      await expect(async () => {
        const unlockBtn = card.getByRole('button', { name: 'Unlock' });
        if (await unlockBtn.isVisible().catch(() => false)) {
          await unlockBtn.click().catch(() => undefined);
        }
        await expect(card.getByRole('button', { name: 'Place' })).toBeVisible({
          timeout: 3_000,
        });
      }).toPass({ timeout: 30_000 });
    }
    await expect(async () => {
      const placeBtn = hand
        .getByRole('article')
        .filter({ hasText: /^shipyard/ })
        .first()
        .getByRole('button', { name: 'Place' });
      if ((await placeBtn.getAttribute('aria-pressed')) !== 'true') {
        await placeBtn.click();
      }
      await page.mouse.click(tileX, tileY);
      await expect(page.getByRole('status')).toContainText(
        'Construction started.',
        { timeout: 2_500 },
      );
    }).toPass({ timeout: 30_000 });
  }
  // La section « lay a keel » n'existe que sur un chantier ACTIF : sur une
  // base fraîche le chantier vient d'être posé — attendre l'état réel.
  await expect
    .poll(
      async () => {
        const d = (await page.request
          .get(`/api/planets/${planetId}`)
          .then((r) => r.json())) as {
          buildings: { key: string; status: string }[];
        };
        return d.buildings.find((b) => b.key === 'shipyard')?.status ?? '?';
      },
      { timeout: 60_000 },
    )
    .toBe('active');
  const detailYard = (await page.request
    .get(`/api/planets/${planetId}`)
    .then((r) => r.json())) as {
    buildings: { key: string; tileIndex: number | null }[];
  };
  const yardTile = detailYard.buildings.find((b) => b.key === 'shipyard')!
    .tileIndex!;
  const [ytX, ytY] = bhYard.tilePx(yardTile);
  await expect(async () => {
    await page.mouse.click(ytX, ytY);
    await expect(panel.getByText(/shipyard · L1/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  // Pose la quille d'un Cargo S — nom unique par run.
  const yard = panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await expect(yard).toBeVisible();
  const shipName = `Keel ${runId}`;
  await yard.getByLabel('Category').selectOption('cargo');
  await yard.getByLabel('Size').selectOption('s');
  await yard.getByLabel('Ship name').fill(shipName);
  await shot(page, '36-shipyard-form');
  await expect(async () => {
    await yard.getByRole('button', { name: 'Lay the keel' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Keel laid — the yard is at work.',
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });
  await expect(yard.getByText(new RegExp(shipName))).toBeVisible();
  await shot(page, '37-keel-under-construction');

  // 12 h / TIME_SCALE = 6 s : le vaisseau rejoint la flotte, à quai.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string }[];
        };
        return f.ships.find((s) => s.name === shipName)?.status ?? 'absent';
      },
      { timeout: 30_000 },
    )
    .toBe('docked');
  // Preuve visible : la flotte sur la carte compte le nouveau marqueur.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '38-new-ship-in-fleet');
});
