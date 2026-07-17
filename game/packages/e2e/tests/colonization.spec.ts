/**
 * E2E — colonisation (GB §19/§14/§12, DG §12/§3.2/§10.3) : le parcours
 * complet vers la deuxième planète — chaîne d'infrastructures, coque
 * Civil M, pilote lié, kit colonie provisionné, embarquement, vol, péage
 * de route, établissement 72 h, colonie dans le rail avec badge de grâce.
 * Échelle test : TIME_SCALE=7200 (72 h → 36 s) ; grants via /test/grant
 * (instrumentation §15).
 */
import { expect, test } from '@playwright/test';
import { settlerLosses, settlerTripRisk } from '@atg/shared';
import { boardHelpers, pickEmailByDna, registerSovereign, shot } from './lib.js';

const runId = Date.now().toString(36);

/**
 * E-mail dont l'ADN tech contient déjà toute la chaîne (spaceport,
 * shipyard, workshop L2) AVANT d'inscrire — zéro roll perdu.
 */
const pickColonyEmail = (nth: number): string =>
  pickEmailByDna(
    `e2e-colony-${runId}`,
    (av) =>
      av.available.has('spaceport') &&
      av.available.has('shipyard') &&
      av.available.has('workshop') &&
      (av.maxLevel.get('workshop') ?? 0) >= 2,
    nth,
  );

test('colonisation : de la première colonie à la deuxième planète', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Inscription — l'ADN tech est garanti par pickColonyEmail ; la poche
  // garantit ≥ 2 mondes sauvages ; on re-roule (borné à 3) seulement si le
  // climat ne laisse aucun wild non-poison.
  let planetId = '';
  let wild: { id: string; name: string } | null = null;
  for (let attempt = 0; attempt < 3 && !wild; attempt++) {
    const email = pickColonyEmail(attempt);
    planetId = await registerSovereign(page, email, `Pathfinder ${attempt}`);
    const galaxy = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
      bodies: {
        id: string;
        name: string;
        bodyType: string;
        ownerId: string | null;
        climate: string | null;
      }[];
    };
    wild =
      galaxy.bodies.find(
        (b) => b.bodyType === 'planet' && !b.ownerId && b.climate !== 'poison',
      ) ?? null;
    if (!wild) await page.getByRole('button', { name: 'Log out' }).click();
  }
  expect(wild, 'aucun monde sauvage non-poison après 3 poches').toBeTruthy();

  // 2. Trésorerie de chantier (instrumentation §15 — les coûts T2/T3
  // dépassent l'économie d'un starter neuf).
  for (const [resource, tons] of [
    ['ore', 500],
    ['steel_l', 500],
    ['fuel_cells', 550],
    ['steel_h', 15],
    ['crystal_temperate', 8],
    ['crystal_cold', 8],
    ['crystal_hot', 8],
    ['silicon', 30],
    ['food_1', 40],
    ['water', 40],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 3. Chaîne d'infrastructures : depot→spaceport→shipyard→workshop (L2).
  const rail = page.getByRole('navigation', { name: 'Main' });
  await rail
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions/ })
    .first()
    .click();
  const { tilePx, panel, unlockCard, placeCard, openPanel } = await boardHelpers(
    page,
    planetId,
  );
  const TILE = { a: tilePx(0), b: tilePx(1), c: tilePx(2) } as const;

  // Chaîne de prérequis réelle : depot → spaceport → shipyard ; mine →
  // workshop (mine et depot sont never-masked — déterministes).
  for (const key of ['depot', 'mine', 'spaceport', 'shipyard', 'workshop']) {
    await unlockCard(key);
  }
  await placeCard('spaceport', TILE.a);
  await placeCard('shipyard', TILE.b);
  await placeCard('workshop', TILE.c);

  // Workshop → L2 (le terraform core exige un atelier de niveau 2).
  await openPanel(TILE.c, /workshop · L1/);
  await panel.getByRole('button', { name: /Level up/ }).click();
  await expect(page.getByRole('status')).toContainText('Level-up construction started.');
  await openPanel(TILE.c, /workshop · L2/);

  // colony_program : un PROGRAMME (jamais masqué), déverrouillé depuis la
  // section Programs de la barre latérale.
  const programs = page.getByRole('region', { name: 'Programs' });
  await programs.scrollIntoViewIfNeeded();
  await expect(async () => {
    const btn = programs.getByRole('button', { name: /colony program/ });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => undefined);
    }
    await expect(
      programs.getByText(/Unlocked — colony fittings enabled/),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // 4. Coque Civil M au chantier.
  await openPanel(TILE.b, /shipyard · L1/);
  const yard = panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await yard.getByLabel('Category').selectOption('civil');
  await yard.getByLabel('Size').selectOption('m');
  const arkName = `Ark ${runId}`;
  await yard.getByLabel('Ship name').fill(arkName);
  await expect(async () => {
    await yard.getByRole('button', { name: 'Lay the keel' }).click();
    await expect(page.getByRole('status')).toContainText('Keel laid', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await shot(page, 'col-01-keel-laid');
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string }[];
        };
        return f.ships.find((s) => s.name === arkName)?.status ?? 'absent';
      },
      { timeout: 40_000 },
    )
    .toBe('docked');

  // 5. Panneau de l'Arche : pilote, kit, settlers.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  // L'Arche (éventail idx 2, angle 4,8 rad ≈ +32 px SOUS le corps) tombe
  // pile sur le bouton-étiquette « Inspect » qui intercepte le clic depuis
  // la refonte UI : on la sélectionne par l'index de contacts (chemin
  // clavier canonique), pas par le sprite.
  const arkPanel = page.getByRole('complementary', { name: arkName });
  const fleetForAsk = (await page.request
    .get('/api/fleet')
    .then((r) => r.json())) as { ships: { id: string; name: string }[] };
  const arkListedId = fleetForAsk.ships.find((s) => s.name === arkName)!.id;
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${arkListedId}`);
    await expect(arkPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });

  await arkPanel.getByRole('button', { name: /Assign pilot/ }).click();
  await expect(page.getByRole('status')).toContainText('Pilot bound to the hull');
  await arkPanel.getByRole('button', { name: 'Fit colony kit' }).click();
  await expect(page.getByRole('status')).toContainText('Colony kit fitted');
  await expect(arkPanel.getByText('Colony kit', { exact: true })).toBeVisible();
  await arkPanel.getByRole('spinbutton', { name: 'Settlers' }).fill('300');
  await arkPanel.getByRole('button', { name: 'Embark', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Settlers transferred.');
  await expect(arkPanel.getByText(/Settlers — 300\/800/)).toBeVisible();
  await shot(page, 'col-02-ark-ready');

  // Péage attendu : mêmes fonctions partagées que le serveur, avec le roll
  // RÉEL du pilote lié (déterministe par compte ; un pilote fort peut
  // annuler le risque — zéro mort est alors le résultat CORRECT).
  const fleetNow = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string }[];
  };
  const arkId = fleetNow.ships.find((s) => s.name === arkName)!.id;
  const { npcs } = (await page.request.get('/api/npcs').then((r) => r.json())) as {
    npcs: {
      role: string;
      boundHostType: string | null;
      boundHostId: string | null;
      statRolls: Record<string, number>;
    }[];
  };
  const reductions = npcs
    .filter((n) => n.role === 'pilot' && n.boundHostType === 'ship' && n.boundHostId === arkId)
    .map((n) => Number(n.statRolls.settler_risk_reduction ?? 0));
  expect(reductions.length).toBe(1);
  // Route neuve (origine et destination propres à ce compte) → report 0.
  const expectedDeaths = settlerLosses(300, settlerTripRisk(reductions), 0).deaths;

  // 6. Vol vers le monde sauvage (clic sur son label projeté).
  await arkPanel.getByRole('button', { name: 'Send ship' }).click();
  // Sélecteur de destination (mode ciblage) : robuste au cadrage caméra.
  await page.getByLabel('Choose destination').selectOption(`body:${wild!.id}`);
  await expect(page.getByRole('status')).toContainText('Course plotted.', {
    timeout: 10_000,
  });

  // Arrivée : le péage de route a prélevé EXACTEMENT sa part déterministe
  // (base 5 % − réduction du pilote, accumulateur de route à report 0).
  let settlersAfter = 0;
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string; settlers: number }[];
        };
        const ark = f.ships.find((s) => s.name === arkName);
        settlersAfter = ark?.settlers ?? 0;
        return ark?.status ?? 'absent';
      },
      { timeout: 60_000 },
    )
    .toBe('hovering');
  expect(settlersAfter).toBe(300 - expectedDeaths);

  // 7. Coloniser — re-sélection de l'Arche par l'index de contacts (même
  // motif : les clics-sprite près des étiquettes sont interceptés).
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${arkListedId}`);
    await expect(arkPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await shot(page, 'col-03-hovering-wild');
  await arkPanel.getByRole('button', { name: 'Colonize', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Colony ship landed');
  await expect(arkPanel.getByText(/Establishing colony/)).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, 'col-04-establishing');

  // 8. 72 h (36 s à l'échelle test) : la colonie apparaît dans le rail.
  await expect
    .poll(
      async () => {
        const me = (await page.request.get('/api/me').then((r) => r.json())) as {
          planets: { id: string; name: string }[];
        };
        return me.planets.length;
      },
      { timeout: 90_000 },
    )
    .toBe(2);
  await rail.getByRole('button', { name: wild!.name }).click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible();
  // Badge de grâce 14 j + population = settlers livrés + coque convertie
  // (depot et spaceport actifs sur les tuiles 0/1 — visibles au plateau).
  await expect(page.getByText(/Colony grace until/)).toBeVisible();
  await expect(page.getByText('Population')).toBeVisible();
  const detail = (await page.request
    .get(`/api/planets/${wild!.id}`)
    .then((r) => r.json())) as {
    population: number;
    graceUntil: string | null;
    buildings: { key: string; status: string }[];
  };
  expect(detail.population).toBe(settlersAfter);
  expect(detail.graceUntil).toBeTruthy();
  expect(
    detail.buildings
      .filter((b) => ['depot', 'spaceport'].includes(b.key))
      .every((b) => b.status === 'active'),
  ).toBe(true);
  // « The ship is spent » : l'Arche n'existe plus.
  const fleetAfter = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { name: string }[];
  };
  expect(fleetAfter.ships.some((s) => s.name === arkName)).toBe(false);
  await page.waitForTimeout(1200);
  await shot(page, 'col-05-second-world');
});
