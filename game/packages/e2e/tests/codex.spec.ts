/** @verifies This test file verifies: docs/BACKLOG.md §P2.codex; docs/MANUAL_PLAN.md §2–§7. */
/**
 * Player Codex (P2.codex — docs/MANUAL_PLAN.md). The in-game manual must be
 * reachable from every screen, open deep-linked to the chapter matching the
 * current view, render its three first-slice chapters, and expose the exact
 * rule/formula with a live number pulled from @atg/shared.
 *
 * Proofs by the UI (visible chapters, live figures, focus behaviour). The
 * Codex is client-only (no API/authz surface), so there is no backend effect
 * to assert beyond reaching the authenticated shell.
 */
import { expect, test } from '@playwright/test';
import {
  MEDICINE_AGE_WEIGHTS,
  POP_NEEDS_PER_1000_PER_DAY,
  TRACE_MINING_T_PER_DAY,
} from '@atg/shared';
import { registerSovereign, shot } from './lib.ts';

function rail(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

test('Codex : ouvrable depuis chaque écran, deep-link contextuel, 3 chapitres, règle exacte live', async ({
  page,
}) => {
  await registerSovereign(page, `codex-${Date.now()}@test.local`, 'Archivist');

  // --- From the galaxy (default view): opens on Deposits ------------------
  await rail(page).getByRole('button', { name: 'Codex' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Codex' })).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Deposits & mining' }),
  ).toBeVisible();
  await shot(page, 'codex-01-deposits-from-galaxy');

  // --- The "Exact rule" discloses a LIVE number from @atg/shared ----------
  await dialog.getByText('Exact rule & formula').first().click();
  await expect(
    dialog.getByText(`${TRACE_MINING_T_PER_DAY} T/day`, { exact: false }).first(),
  ).toBeVisible();
  await shot(page, 'codex-02-exact-rule-live-number');

  // --- Chapter navigation -------------------------------------------------
  await dialog.getByRole('button', { name: 'Population' }).click();
  await expect(dialog.getByRole('heading', { name: 'Population' })).toBeVisible();
  await expect(dialog.getByText(/Medicine is optional:/)).toBeVisible();
  await dialog.getByText('Exact rule & formula').click();
  await expect(
    dialog.getByText(
      `${POP_NEEDS_PER_1000_PER_DAY.medicine} T/day`,
      { exact: false },
    ),
  ).toBeVisible();
  const medicineWeights = dialog.getByText(
    `${MEDICINE_AGE_WEIGHTS.children}× / ${MEDICINE_AGE_WEIGHTS.actives}× / ${MEDICINE_AGE_WEIGHTS.seniors}×`,
    { exact: true },
  );
  await expect(medicineWeights).toBeVisible();
  await shot(page, 'codex-03-population');
  await medicineWeights.scrollIntoViewIfNeeded();
  await shot(page, 'codex-03-population-medicine');

  await dialog
    .getByRole('button', { name: 'Efficiency & employment' })
    .click();
  await expect(
    dialog.getByRole('heading', { name: 'Efficiency & employment' }),
  ).toBeVisible();
  await shot(page, 'codex-04-efficiency');

  // --- Escape closes, focus returns to the shell --------------------------
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // --- Reachable from the market too --------------------------------------
  await rail(page).getByRole('button', { name: 'Market' }).click();
  await rail(page).getByRole('button', { name: 'Codex' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // --- Reachable from a planet (deep-links to Deposits) -------------------
  await rail(page)
    .getByRole('button')
    .filter({ hasNotText: /Galaxy|Fleet|Market|Comms|Factions|Codex/ })
    .first()
    .click();
  await rail(page).getByRole('button', { name: 'Codex' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Deposits & mining' }),
  ).toBeVisible();
  await shot(page, 'codex-05-from-planet');

  // --- Minimum supported viewport (DESIGN_SYSTEM §7) --------------------
  // The Codex must remain wholly inside the 1280×800 desktop/tablet floor.
  await page.setViewportSize({ width: 1280, height: 800 });
  const shell = page.getByRole('dialog').locator('.ls-codex-shell');
  await expect(shell).toBeVisible();
  const bounds = await shell.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(800);
  await shot(page, 'codex-06-tablet-min');
});
