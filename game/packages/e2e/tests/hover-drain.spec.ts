/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Hovering”; GAME_BOOK.md §7/§13; DESIGN_GUIDE.md §3.5. */
/**
 * E2E — drains de loitering, échouage & sauvetage (GB §7/§13, DG §3.5) :
 * survol possédé payé par la planète (taux visibles), échouage
 * DÉTERMINISTE dans le vide (instrumentation /test/ship-fuel — le drain
 * lazy court en jours RÉELS, TIME_SCALE n'accélère que les événements),
 * refus de départ échoué, sauvetage par transfert vaisseau→vaisseau
 * (≤ 1 pc), retour et plein au monde (bouton Refuel).
 */
import { expect, test } from '@playwright/test';
import {
  boardHelpers,
  galaxyLabel,
  pickEmailByDna,
  registerSovereign,
  selectFleetShip,
  shot,
} from './lib.js';

const runId = Date.now().toString(36);

test('drains de survol : la planète paie, le vide échoue, le tanker sauve', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // 1. Inscription — ADN garanti : spaceport + shipyard (le Tender de
  // sauvetage se construit par le vrai flux chantier).
  const email = pickEmailByDna(
    `e2e-hover-${runId}`,
    (av) => av.available.has('spaceport') && av.available.has('shipyard'),
    0,
  );
  const planetId = await registerSovereign(page, email, 'Wayfarer');

  // 2. Trésorerie (instrumentation §15).
  for (const [resource, tons] of [
    ['ore', 400],
    ['steel_l', 200],
    ['silicon', 40],
    ['fuel_cells', 60],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 3. Infrastructure : spaceport + shipyard, puis quille du Tender.
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
  for (const key of ['depot', 'spaceport', 'shipyard']) {
    await unlockCard(key);
  }
  await placeCard('spaceport', tilePx(0));
  await placeCard('shipyard', tilePx(1));
  await openPanel(tilePx(1), /shipyard · L1/);
  const yard = panel.getByRole('region', { name: 'Shipyard — lay a keel' });
  await yard.getByLabel('Category').selectOption('cargo');
  await yard.getByLabel('Size').selectOption('s');
  const tenderName = `Tender ${runId}`;
  await yard.getByLabel('Ship name').fill(tenderName);
  await expect(async () => {
    await yard.getByRole('button', { name: 'Lay the keel' }).click();
    await expect(page.getByRole('status')).toContainText('Keel laid', {
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { name: string; status: string }[];
        };
        return f.ships.find((s) => s.name === tenderName)?.status ?? 'absent';
      },
      { timeout: 40_000 },
    )
    .toBe('docked');

  // 4. Survol de SON monde : la planète paie le loitering.
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  await expect(page.getByTestId('galaxy-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const fleetIds = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string; fuelType: string }[];
  };
  const haulerShip = fleetIds.ships.find((s) => s.name === 'First hauler')!;
  const haulerId = haulerShip.id;
  // La ressource de RÉSERVOIR (fuel_cold/hot/gas) — PAS fuel_cells, qui
  // est un composant de chantier et matche aussi « fuel_ ».
  const tankRes = `fuel_${haulerShip.fuelType}`;
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string; name: string }[];
  };
  const starterName = me.planets[0]!.name;
  // Le nom du starter existe AUSSI dans le rail : on scope à la scène.
  const label = galaxyLabel(page, starterName);
  await expect(label).toBeVisible({ timeout: 10_000 });
  const lb = (await label.boundingBox())!;
  const bodyPx = { x: lb.x + lb.width / 2, y: lb.y - 26 };

  // Sélection ROBUSTE par l'index de contacts (l'éventail pixel dérive
  // dès que le panneau ou la flotte change — leçon chunk AF).
  const haulerPanel = page.getByRole('complementary', { name: 'First hauler' });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await haulerPanel.getByRole('button', { name: 'Undock' }).click();
  await expect(page.getByRole('status')).toContainText('Airborne');
  // La planète paie (GB §7) : le taux du stock fuel_x passe à −0.2 u/j.
  await expect
    .poll(async () => {
      const d = (await page.request
        .get(`/api/planets/${planetId}`)
        .then((r) => r.json())) as {
        stock: Record<string, { ratePerDay: number }>;
      };
      return d.stock[tankRes]?.ratePerDay ?? 0;
    })
    .toBeCloseTo(-0.2, 5);
  await expect(
    haulerPanel.getByText('loitering paid by the planet below'),
  ).toBeVisible();
  await shot(page, 'hov-01-planet-pays');
  // Re-atterrir (le vol vers le vide s'auto-charge À QUAI).
  await haulerPanel.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Touchdown');

  // 5. Vol vers le VIDE — le point de clic est CALCULÉ : projection
  // affine (ancre = label du starter + un 2e corps) puis candidat à
  // ≥ 45 px de TOUT corps connu ; la destination est ensuite vérifiée par
  // l'API (aucun corps ciblé).
  const galaxyBodies = (
    (await page.request.get('/api/galaxy').then((r) => r.json())) as {
      bodies: {
        id: string;
        name: string;
        x: number;
        y: number;
        bodyType: string;
        size: string | null;
      }[];
    }
  ).bodies;
  const starterBody = galaxyBodies.find((b) => b.id === planetId)!;
  let scale = 3.56; // secours : 9 pc d'éventail ≈ 32 px au zoom par défaut
  for (const other of galaxyBodies) {
    if (other.id === planetId) continue;
    const ol = galaxyLabel(page, other.name);
    if (!(await ol.isVisible().catch(() => false))) continue;
    const ob = await ol.boundingBox();
    if (!ob) continue;
    const dxPc = other.x - starterBody.x;
    if (Math.abs(dxPc) < 5) continue;
    scale = Math.abs((ob.x + ob.width / 2 - bodyPx.x) / dxPc);
    break;
  }
  const project = (b: { x: number; y: number }) => ({
    x: bodyPx.x + (b.x - starterBody.x) * scale,
    y: bodyPx.y - (b.y - starterBody.y) * scale,
  });
  // Dégagement requis = rayon du SPRITE du corps (SPRITE_PC de GalaxyMap :
  // étoile 44 pc, planètes s/m/l = 10/16/24 pc) × échelle + marge — le
  // clic touche le mesh, pas le label.
  const clearancePx = (b: { bodyType: string; size: string | null }) => {
    const pc =
      b.bodyType === 'star'
        ? 44
        : ({ s: 10, m: 16, l: 24 }[b.size ?? 'm'] ?? 16);
    return (pc / 2) * scale + 16;
  };
  const candidates: { x: number; y: number }[] = [];
  for (let r = 90; r <= 210; r += 40) {
    for (let k = 0; k < 12; k++) {
      const cand = {
        x: bodyPx.x + r * Math.cos((k * Math.PI) / 6),
        y: bodyPx.y + r * Math.sin((k * Math.PI) / 6),
      };
      if (cand.x < 320 || cand.y < 80 || cand.x > 1420 || cand.y > 860) continue;
      if (
        galaxyBodies.some((b) => {
          const p = project(b);
          return Math.hypot(p.x - cand.x, p.y - cand.y) < clearancePx(b);
        })
      ) {
        continue;
      }
      candidates.push(cand);
    }
  }
  expect(candidates.length, 'aucun point de vide dégagé trouvé').toBeGreaterThan(0);
  let voidPx: { x: number; y: number } | null = null;
  for (const cand of candidates.slice(0, 4)) {
    await haulerPanel.getByRole('button', { name: 'Send ship' }).click();
    await page.mouse.click(cand.x, cand.y);
    // Vérification API : transit SANS corps ciblé = vide confirmé.
    let dest: string | null | 'pending' = 'pending';
    for (let i = 0; i < 20 && dest === 'pending'; i++) {
      await page.waitForTimeout(400);
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: {
          id: string;
          status: string;
          mission: { destBodyId: string | null } | null;
        }[];
      };
      const h = f.ships.find((s) => s.id === haulerId)!;
      if (h.status === 'transit') dest = h.mission?.destBodyId ?? null;
    }
    if (dest === null) {
      voidPx = cand;
      break;
    }
    // Corps touché par accident (projection imparfaite) : attendre
    // l'arrivée puis retenter depuis le survol — l'état se re-fixe.
    await expect
      .poll(
        async () => {
          const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
            ships: { id: string; status: string }[];
          };
          return f.ships.find((s) => s.id === haulerId)!.status;
        },
        { timeout: 60_000 },
      )
      .not.toBe('transit');
  }
  expect(voidPx, 'aucun clic de vide accepté').toBeTruthy();
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)!.status;
      },
      { timeout: 60_000 },
    )
    .toBe('idle');

  // Réservoir fixé au ras du vide (instrumentation) : 1e-6 u à 0,2 u/j →
  // le bord ship_fuel_out tombe en ~0,4 s réelle, le tick le matérialise.
  const sf = await page.request.post('/api/test/ship-fuel', {
    data: { shipId: haulerId, units: 0.000001 },
  });
  expect(sf.ok()).toBe(true);
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)!.status;
      },
      { timeout: 30_000 },
    )
    .toBe('stranded');

  // 6. La coque échouée : chip danger, aucun départ possible.
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await expect(haulerPanel.getByText('Stranded — out of fuel')).toBeVisible();
  await expect(
    haulerPanel.getByRole('button', { name: 'Send ship' }),
  ).toHaveCount(0);
  await shot(page, 'hov-02-stranded');

  // 7. Sauvetage : le Tender vole sur la MÊME coordonnée (distance 0),
  // puis transfert de 20 u via l'UI.
  const tenderId = (
    (await page.request.get('/api/fleet').then((r) => r.json())) as {
      ships: { id: string; name: string }[];
    }
  ).ships.find((s) => s.name === tenderName)!.id;
  const tenderPanel = page.getByRole('complementary', { name: tenderName });
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${tenderId}`);
    await expect(tenderPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await tenderPanel.getByRole('button', { name: 'Send ship' }).click();
  await page.mouse.click(voidPx!.x, voidPx!.y);
  await expect(page.getByRole('status')).toContainText('Course plotted.', {
    timeout: 10_000,
  });
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === tenderId)!.status;
      },
      { timeout: 60_000 },
    )
    .toBe('idle');

  // Deux coques au même point : l'index accessible identifie Tender sans
  // dépendre de l'ordre de l'éventail graphique.
  await selectFleetShip(page, (ship) => ship.id === tenderId);
  await expect(tenderPanel).toBeVisible();
  const transfer = tenderPanel.getByRole('region', { name: 'Transfer fuel' });
  await transfer.getByLabel('To ship').selectOption({ label: 'First hauler' });
  await transfer.getByLabel('Units').fill('20');
  await transfer.getByRole('button', { name: 'Transfer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Fuel transferred.');
  const rescued = (
    (await page.request.get('/api/fleet').then((r) => r.json())) as {
      ships: { id: string; status: string; fuel: Record<string, number>; fuelType: string }[];
    }
  ).ships.find((s) => s.id === haulerId)!;
  expect(rescued.status).toBe('idle');
  expect(rescued.fuel[rescued.fuelType]).toBeGreaterThan(19);
  await shot(page, 'hov-03-rescued');

  // 8. Retour au monde, atterrissage, PLEIN au spaceport (bouton Refuel).
  await expect(async () => {
    await page
      .getByLabel('Galaxy contact index')
      .selectOption(`ship:${haulerId}`);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 40_000 });
  await haulerPanel.getByRole('button', { name: 'Send ship' }).click();
  // Depuis le vide, le starter peut être HORS CHAMP (son étiquette n'existe
  // que projetée) : l'index de contacts, devenu « Choose destination » en
  // mode ciblage, trace la route au clavier — chemin robuste et accessible.
  await page.getByLabel('Choose destination').selectOption(`body:${planetId}`);
  await expect(page.getByRole('status')).toContainText('Course plotted.', {
    timeout: 10_000,
  });
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === haulerId)!.status;
      },
      { timeout: 60_000 },
    )
    .toBe('hovering');
  await expect(async () => {
    await page.mouse.click(bodyPx.x - 24, bodyPx.y - 22);
    await expect(haulerPanel).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await haulerPanel.getByRole('button', { name: 'Land', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Touchdown');
  // Les deux auto-chargements ont vidé le stock (2 × plein) : on regarnit
  // le monde pour que « Refuel » remplisse VRAIMENT le réservoir.
  const g2 = await page.request.post('/api/test/grant', {
    data: { planetId, resource: tankRes, tons: 100 },
  });
  expect(g2.ok()).toBe(true);
  await haulerPanel.getByRole('button', { name: 'Refuel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Tank refueled.');
  await expect
    .poll(async () => {
      const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
        ships: { id: string; fuel: Record<string, number>; fuelType: string; tankU: number }[];
      };
      const h = f.ships.find((s) => s.id === haulerId)!;
      return h.tankU - (h.fuel[h.fuelType] ?? 0);
    })
    .toBeLessThan(0.1);
  await shot(page, 'hov-04-refueled');
});
