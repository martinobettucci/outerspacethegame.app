/**
 * E2E — W4 vue de bord des sondes L2/L3 (MASTER_PLAN W4, JOURNAL
 * 2026-07-21) : pad L2 (vraies commandes), sonde L2 expédiée loin en
 * openspace — le ciel de bord (260 pc, télescope L1 embarqué) révèle des
 * corps que rien d'autre ne couvre ; halo de scan sur la sonde
 * sélectionnée (§16).
 */
import { expect, test } from '@playwright/test';
import { pickEmailByDna, registerSovereign, selectFleetShip, shot } from './lib.js';

const runId = Date.now().toString(36);

test('vue de bord : une sonde L2 étend le ciel là où elle passe', async ({
  page,
}) => {
  test.setTimeout(420_000);

  const email = pickEmailByDna(
    `e2e-obs-${runId}`,
    (av) => (av.maxLevel.get('probe_pad') ?? 0) >= 2,
    0,
  );
  const planetId = await registerSovereign(page, email, 'Farseer', 'Scientific');
  for (const [resource, tons] of [
    ['ore', 600],
    ['silicon', 300],
    ['carbon', 120],
    ['fuel_cold', 100],
    ['fuel_hot', 100],
    ['fuel_gas', 100],
  ] as const) {
    const g = await page.request.post('/api/test/grant', {
      data: { planetId, resource, tons },
    });
    expect(g.ok()).toBe(true);
  }

  // 1. Pad L2 par les vraies commandes.
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
  const up = await page.request.post(
    `/api/planets/${planetId}/buildings/${padId}/levelup`,
  );
  if (!up.ok()) throw new Error(`levelup L2: ${await up.text()}`);
  await expect.poll(padState, { timeout: 60_000 }).toBe('active:L2');

  // 2. Ciel initial : instantané des corps visibles.
  const galaxyIds = async () => {
    const g = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
      bodies: { id: string }[];
    };
    return new Set(g.bodies.map((b) => b.id));
  };
  const before = await galaxyIds();

  // 3. Sonde (défaut = L2, pad L2) expédiée à 250 pc en openspace : la
  //    vue de bord CONTINUE balaie en volant. (250 pc = 12,5 u sur les
  //    17,5 u du plein de naissance — 350 pc la tuerait à sec, règle v3.)
  const bp = await page.request.post(`/api/planets/${planetId}/probes`);
  expect(bp.ok()).toBe(true);
  const home = (await page.request.get('/api/galaxy').then((r) => r.json())) as {
    bodies: { id: string; x: number; y: number }[];
  };
  const starter = home.bodies.find((b) => b.id === planetId)!;
  const send = await page.request.post(`/api/planets/${planetId}/probes/send`, {
    data: { x: starter.x + 250, y: starter.y },
  });
  expect(send.ok()).toBe(true);
  const probeId = ((await send.json()) as { probeId: string }).probeId;

  // 4. Le ciel S'ÉTEND : des corps hors de tout scope initial émergent.
  await expect
    .poll(
      async () => {
        const now = await galaxyIds();
        return [...now].some((id) => !before.has(id));
      },
      { timeout: 120_000 },
    )
    .toBe(true);

  // 5. Arrivée → halo de bord sur la sonde sélectionnée (§16).
  await expect
    .poll(
      async () => {
        const f = (await page.request.get('/api/fleet').then((r) => r.json())) as {
          ships: { id: string; status: string }[];
        };
        return f.ships.find((s) => s.id === probeId)?.status ?? '?';
      },
      { timeout: 120_000 },
    )
    .toBe('idle');
  await selectFleetShip(page, (s) => s.id === probeId);
  // Le panneau doit refléter l'ARRÊT (poll client 5 s) — le halo de
  // bord ne s'affiche qu'hors transit.
  await expect(
    page.getByRole('complementary', { name: 'Probe' }).getByText('idle'),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_000); // sweep visible
  await shot(page, 'obs-01-onboard-halo');
});
