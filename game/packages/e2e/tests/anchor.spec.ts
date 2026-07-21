/** @verifies This test file verifies: docs/MASTER_PLAN.md §W1/§W3/§W4; docs/BACKLOG.md §P3 “Sondes L3 & multi-carburant”; GAME_BOOK.md §4/§6/§14; DESIGN_GUIDE.md §8.1–§8.3. */
/**
 * E2E — W3 sondes L3 : ancrage & transfert (MASTER_PLAN W3, JOURNAL
 * 2026-07-21) : pad L3 (vraies commandes build + 2 level-ups), sonde L3
 * née en survol, expédiée EN OPENSPACE ; le hauler de départ (pilote
 * granté §15) vole au même point et s'arrête ; l'ANCRAGE se fait dans
 * l'UI galaxie (panneau sonde) — le carburant coule lentement (20 u/h-jeu
 * ÷ 7200), le règlement au bord crédite le moteur du receveur.
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, selectFleetShip, shot } from './lib.js';

const runId = Date.now().toString(36);

test('ancrage tanker : une L3 ravitaille un cargo à l\'arrêt dans le vide', async ({
  page,
}) => {
  test.setTimeout(420_000);

  // Le pad doit pouvoir monter L3 : l'ADN du seed gate le niveau max.
  const email = pickEmailByDna(
    `e2e-anc-${runId}`,
    (av) => (av.maxLevel.get('probe_pad') ?? 0) >= 3,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Tankerline', 'Scientific');

  // Moteur natal du hauler (W2) = type que la sonde devra donner.
  const f0 = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string; engineType: string | null }[];
  };
  const hauler = f0.ships.find((s) => s.name === 'First hauler')!;
  const natal = hauler.engineType!;
  // Ladder du pad (générique ×3/×6 du placement {ore 7.5, carbon 5}) :
  // le carbon seedé varie (24–57 observés) — granté explicitement.
  for (const [resource, tons] of [
    ['ore', 900],
    ['silicon', 500],
    ['carbon', 120],
    ['steel_l', 300],
    ['fuel_cells', 120],
    [`fuel_${natal}`, 300],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Pad L3 par les VRAIES commandes : build + 2 level-ups.
  const pb = await page.request.post(`/api/planets/${planetId}/build`, {
    data: { building: 'probe_pad', tileIndex: null, recipe: null },
  });
  expect(pb.ok()).toBe(true);
  const padId = ((await pb.json()) as { buildingId: string }).buildingId;
  const padState = async () => {
    const d = (await page.request
      .get(`/api/planets/${planetId}`)
      .then((r) => r.json())) as {
      buildings: { id: string; status: string; level: number }[];
    };
    const b = d.buildings.find((x) => x.id === padId);
    return `${b?.status}:L${b?.level}`;
  };
  await expect.poll(padState, { timeout: 60_000 }).toBe('active:L1');
  for (const lvl of [2, 3] as const) {
    const up = await page.request.post(
      `/api/planets/${planetId}/buildings/${padId}/levelup`,
    );
    if (!up.ok()) throw new Error(`levelup L${lvl}: ${await up.text()}`);
    await expect.poll(padState, { timeout: 60_000 }).toBe(`active:L${lvl}`);
  }

  // 2. Sonde (défaut = L3, pad L3) née en survol, expédiée en OPENSPACE.
  const bp = await page.request.post(`/api/planets/${planetId}/probes`);
  expect(bp.ok()).toBe(true);
  const home = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; x: number; y: number }[];
  };
  const starter = home.bodies.find((b) => b.id === planetId)!;
  const voidPoint = { x: starter.x + 5, y: starter.y + 4 };
  const send = await page.request.post(`/api/planets/${planetId}/probes/send`, {
    data: voidPoint,
  });
  expect(send.ok()).toBe(true);
  const probeId = ((await send.json()) as { probeId: string }).probeId;

  // 3. Le hauler : pilote granté (§15), vol réel au même point → idle.
  const gn = await page.request.post('/api/test/grant-npc', {
    data: { role: 'pilot', rarity: 'common' },
  });
  expect(gn.ok()).toBe(true);
  const npcs = (await page.request.get('/api/npcs').then((r) => r.json())) as {
    npcs: { id: string; role: string; boundHostId: string | null }[];
  };
  const pilot = npcs.npcs.find((n) => n.role === 'pilot' && !n.boundHostId)!;
  const ac = await page.request.post(`/api/ships/${hauler.id}/crew`, {
    data: { npcId: pilot.id },
  });
  expect(ac.ok()).toBe(true);
  const mv = await page.request.post(`/api/ships/${hauler.id}/move`, {
    data: voidPoint,
  });
  expect(mv.ok()).toBe(true);
  const shipStatus = async (id: string) => {
    const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
      ships: { id: string; status: string }[];
    };
    return f.ships.find((s) => s.id === id)?.status ?? '?';
  };
  await expect.poll(() => shipStatus(probeId), { timeout: 60_000 }).toBe('idle');
  await expect.poll(() => shipStatus(hauler.id), { timeout: 60_000 }).toBe('idle');

  // 4. Réservoirs de scénario (§15) : sonde pleine à 60 u, cargo à 5 u.
  for (const [shipId, units] of [
    [probeId, 60],
    [hauler.id, 5],
  ] as const) {
    const sf = await page.request.post('/api/test/ship-fuel', {
      data: { shipId, units },
    });
    expect(sf.ok()).toBe(true);
  }

  // 5. L'ANCRAGE dans l'UI : panneau sonde → cible → 40 u → transfert.
  await selectFleetShip(page, (s) => s.id === probeId);
  const anchorSection = page.getByRole('region', { name: 'Tanker anchor (L3)' });
  await expect(anchorSection).toBeVisible();
  await shot(page, 'anc-01-anchor-form');
  await anchorSection.getByLabel('Anchor to').selectOption(hauler.id);
  await anchorSection.getByLabel('Units').fill('40');
  await anchorSection.getByRole('button', { name: 'Anchor & transfer' }).click();
  await expect(page.getByRole('status')).toContainText('Anchored', {
    timeout: 10_000,
  });
  await shot(page, 'anc-02-anchored');

  // 6. Règlement au bord (40 u ÷ 20 u/h = 2 h-jeu = 1 s réelle) : le
  //    moteur du receveur est crédité, l'ancre libérée.
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: {
            id: string;
            fuel: Record<string, number>;
            transfer: unknown | null;
          }[];
        };
        const h = f.ships.find((s) => s.id === hauler.id)!;
        const p = f.ships.find((s) => s.id === probeId)!;
        return p.transfer === null && (h.fuel[natal] ?? 0) > 40 ? 'settled' : 'flowing';
      },
      { timeout: 60_000 },
    )
    .toBe('settled');
  const fEnd = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; fuel: Record<string, number> }[];
  };
  const hEnd = fEnd.ships.find((s) => s.id === hauler.id)!;
  const pEnd = fEnd.ships.find((s) => s.id === probeId)!;
  // 5 + 40 côté receveur, 60 − 40 côté sonde (± drains d'openspace).
  expect(hEnd.fuel[natal]!).toBeGreaterThan(43);
  expect(hEnd.fuel[natal]!).toBeLessThanOrEqual(45.01);
  expect(pEnd.fuel[natal]!).toBeGreaterThan(18);
  expect(pEnd.fuel[natal]!).toBeLessThanOrEqual(20.01);
  // Le panneau se resynchronise au poll (5 s) : l'ancre a disparu, le
  // formulaire d'ancrage revient (§16 : capturer l'état RÉEL).
  await selectFleetShip(page, (s) => s.id === probeId);
  await expect(
    page.getByRole('button', { name: 'Anchor & transfer' }),
  ).toBeVisible({ timeout: 15_000 });
  await shot(page, 'anc-03-settled');
});
