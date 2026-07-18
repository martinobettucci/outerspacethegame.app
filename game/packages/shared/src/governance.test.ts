/**
 * Gouvernance v1 (GB §11, DG §4.1) : exigences par taille, G 1.0/0.5,
 * bonus +2 %/tier du gouverneur installé le plus faible, rôle du vaisseau
 * personnel parqué (satisfait l'exigence, ne porte ni ne dilue le bonus).
 */
import { describe, expect, it } from 'vitest';
import { governanceMultiplier, GOVERNORS_MAX, GOVERNORS_REQUIRED } from './governance.js';

describe('exigences par taille (canon GB §11)', () => {
  it('S 0 / M 1 / L 3 — et les caps d\'installation les égalent', () => {
    expect(GOVERNORS_REQUIRED).toEqual({ s: 0, m: 1, l: 3 });
    expect(GOVERNORS_MAX).toEqual({ s: 0, m: 1, l: 3 });
  });
});

describe('governanceMultiplier', () => {
  it('petit monde : toujours 1.0, même sans rien', () => {
    expect(
      governanceMultiplier({ size: 's', installedTiers: [], personalShipParked: false }),
    ).toEqual({ g: 1, required: 0, governedCount: 0, fullyGoverned: true });
  });

  it('moyen sans gouverneur : 0.5 ; le vaisseau personnel parqué rétablit 1.0', () => {
    expect(
      governanceMultiplier({ size: 'm', installedTiers: [], personalShipParked: false }).g,
    ).toBe(0.5);
    const parked = governanceMultiplier({
      size: 'm',
      installedTiers: [],
      personalShipParked: true,
    });
    expect(parked.g).toBe(1);
    expect(parked.governedCount).toBe(1);
  });

  it('grand : 0.5 à 1–2 gouverneurs (canon), 1.0 + bonus à 3', () => {
    expect(
      governanceMultiplier({ size: 'l', installedTiers: [2, 3], personalShipParked: false }).g,
    ).toBe(0.5);
    // 3 installés rare/epic/legendary : min = rare (tier 2) → +4 %.
    expect(
      governanceMultiplier({ size: 'l', installedTiers: [2, 3, 4], personalShipParked: false }).g,
    ).toBe(1.04);
  });

  it('le vaisseau parqué complète l\'exigence sans diluer le bonus', () => {
    // Grand : 2 installés epic + le vaisseau → pleinement gouverné,
    // bonus = min des INSTALLÉS (3) → 1.06, pas min(3, 0-du-vaisseau).
    const r = governanceMultiplier({
      size: 'l',
      installedTiers: [3, 3],
      personalShipParked: true,
    });
    expect(r.fullyGoverned).toBe(true);
    expect(r.g).toBe(1.06);
    // Gouverné UNIQUEMENT par le vaisseau : pas de bonus.
    expect(
      governanceMultiplier({ size: 'm', installedTiers: [], personalShipParked: true }).g,
    ).toBe(1);
  });
});
