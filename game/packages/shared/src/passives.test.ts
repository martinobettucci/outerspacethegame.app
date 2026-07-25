/** @verifies This test file verifies: docs/GEAR_CATALOG.md §1; JOURNAL 2026-07-22. */
import { describe, expect, it } from 'vitest';
import {
  containerBonus, claimTimeMult, dwellMult, fleeAlarmFraction,
  gateTollMult, hoverDrainMult, innatePriceMult, junkDamageMult,
  junkScoopMult, loadFracPenalty, paxMult, retrieveTimeMult,
  shipScanPc, solarSailFreeHoverPc, starFieldWearMult,
  survivalCapacityMult, survivalDrainMult, surveyIntelCap,
} from './passives.js';

describe('W9d — effets passifs (std / enhanced / absent)', () => {
  it('multiplicateurs et overrides exhaustifs', () => {
    expect(hoverDrainMult([])).toBe(1);
    expect(hoverDrainMult(['heat_recycler'])).toBe(0.85);
    expect(hoverDrainMult(['heat_recycler_enhanced'])).toBe(0.75);
    expect(survivalCapacityMult(['cryo_larder'])).toBe(1.5);
    expect(dwellMult(['docking_clamps_enhanced'])).toBe(3);
    expect(shipScanPc([], 20)).toBe(20);
    expect(shipScanPc(['signal_mirror'], 20)).toBe(60);
    expect(shipScanPc(['signal_mirror_enhanced'], 20)).toBe(100);
    expect(surveyIntelCap(['survey_suite'])).toBe(2);
    expect(junkDamageMult(['ballast_shielding'])).toBe(0.5);
    expect(starFieldWearMult(['flare_dampers_enhanced'])).toBe(0.25);
    expect(paxMult(['berth_module'])).toBe(1.25);
    expect(containerBonus(['cargo_netting_enhanced'])).toBe(2);
    expect(retrieveTimeMult(['mooring_winch'])).toBe(0.5);
    expect(survivalDrainMult(['bilge_purifier_enhanced'])).toBe(0.5);
    expect(gateTollMult(['stargate_caller'])).toBe(0.75);
    expect(claimTimeMult(['salvage_grapnel_enhanced'])).toBe(0.25);
    expect(innatePriceMult(['haggler_matrix'])).toBe(0.9);
    expect(junkScoopMult(['ore_hopper'])).toBe(1.5);
    expect(solarSailFreeHoverPc(['solar_sails_enhanced'])).toBe(15);
    expect(fleeAlarmFraction([], 0.25)).toBe(0.25);
    expect(fleeAlarmFraction(['escape_thrusters'], 0.25)).toBe(0.4);
  });

  it('loadFrac (DG §8.2, livré avec W9d) : pénalité et trim_vanes', () => {
    const bare = loadFracPenalty(3, 3, []);
    expect(bare.loadFrac).toBe(1);
    expect(bare.speedMult).toBeCloseTo(0.85, 9);
    expect(bare.burnMult).toBeCloseTo(1.5, 9);
    const vaned = loadFracPenalty(3, 3, ['trim_vanes']);
    expect(vaned.speedMult).toBeCloseTo(0.925, 9);
    expect(vaned.burnMult).toBeCloseTo(1.25, 9);
    expect(loadFracPenalty(0, 3, []).speedMult).toBe(1);
    expect(loadFracPenalty(1, 0, []).loadFrac).toBe(0);
  });
});
