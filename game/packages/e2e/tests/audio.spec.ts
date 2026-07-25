/** @verifies docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §0 (screen→BGM, ambience-per-building, ship-selection stinger), §4 (buses),
 * §5 (mute + per-bus sliders + localStorage persistence, autoplay gesture);
 * docs/DESIGN_SYSTEM.md §13. Deterministic via the in-page `window.__atgAudio`
 * hook — asserts audio STATE without needing real playback in CI. */
import { expect, test } from '@playwright/test';
import { registerSovereign, selectFleetShip, shot } from './lib.js';

const runId = Date.now().toString(36);

type Snap = {
  prefs: { master: number; music: number; ambience: number; sfx: number; muted: boolean };
  bgm: string | null;
  ambience: string[];
  lastSelection: string | null;
};
const snap = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__atgAudio!.snapshot() as unknown as Snap);

test('audio layer: mixer, mute, persistence, BGM-per-view, ambience-per-building, ship selection', async ({
  page,
}) => {
  test.setTimeout(180_000);

  const email = `e2e-audio-${runId}@atg.test`;
  const planetId = await registerSovereign(page, email, 'Audia');
  const rail = page.getByRole('navigation', { name: 'Main' });
  const me = (await page.request.get('/api/me').then((r) => r.json())) as {
    planets: { id: string; name: string }[];
  };
  const planetName = me.planets.find((p) => p.id === planetId)!.name;

  // The audio hook is installed and the galaxy bed is the active context.
  await expect.poll(async () => (await snap(page)).bgm).toBe('galaxy');

  // ---- mute toggle → state + localStorage (explicit action persists, §11) ----
  const mute = page.getByTestId('audio-mute');
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  expect((await snap(page)).prefs.muted).toBe(true);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('atg.audio') || '{}').muted),
  ).toBe(true);
  await mute.click(); // unmute again for the rest
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  // ---- per-bus slider → clamped state + persisted ----
  await page.getByTestId('audio-open').click();
  const musicSlider = page.getByTestId('audio-slider-music');
  await expect(musicSlider).toBeVisible();
  await musicSlider.evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '12');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await snap(page)).prefs.music).toBeCloseTo(0.12, 2);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('atg.audio') || '{}').music),
  ).toBeCloseTo(0.12, 2);
  await shot(page, 'audio-01-mixer-open');
  await page.keyboard.press('Escape'); // close the panel

  // ---- BGM follows the active screen; ambience mirrors the buildings on the ground ----
  await rail.getByRole('button', { name: planetName }).click();
  await expect(page.getByTestId('planet-canvas')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await snap(page)).bgm).toBe('planet');

  const detail = (await page.request.get(`/api/planets/${planetId}`).then((r) => r.json())) as {
    buildings: { key: string; tileIndex: number | null }[];
  };
  const groundKeys = Array.from(
    new Set(detail.buildings.filter((b) => b.tileIndex !== null).map((b) => b.key)),
  ).sort();
  await expect
    .poll(async () => [...(await snap(page)).ambience].sort())
    .toEqual(groundKeys.slice(0, 8)); // capped at 8 voices (AUDIO_PLAN §4)

  // ---- ship selection fires a stinger consistent with the hull (StarCraft feel) ----
  await rail.getByRole('button', { name: 'Galaxy' }).click();
  const fleet = (await page.request.get('/api/fleet').then((r) => r.json())) as {
    ships: { id: string; name: string; hullCategory: string; hullSize: string | null }[];
  };
  const ship = fleet.ships[0];
  if (ship) {
    await selectFleetShip(page, (s) => s.id === ship.id);
    const expectedKey =
      ship.hullSize && ['combat', 'cargo', 'civil'].includes(ship.hullCategory)
        ? `${ship.hullCategory}_${ship.hullSize}`
        : null;
    // Hull ships fire their stinger; probe/personal craft are (by design) silent.
    await expect.poll(async () => (await snap(page)).lastSelection).toBe(expectedKey);
  }
});
