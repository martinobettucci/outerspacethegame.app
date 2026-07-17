/**
 * Docks de spaceport (DG §5.1/§8.6) : comptes cumulatifs par niveau,
 * exemptions canon, faisabilité gloutonne (débordement S→M→L),
 * réservations pour soi (retirées du pool visiteurs, plus petits docks
 * d'abord ; le propriétaire les utilise).
 */
import { describe, expect, it } from 'vitest';
import {
  canAcceptLanding,
  fitsInDocks,
  occupiesDock,
  spaceportDocks,
} from './docks.js';

describe('spaceportDocks — cumulatif canon', () => {
  it('L1 = 2 S ; L2 = +2 M ; L3 = +2 L', () => {
    expect(spaceportDocks(1)).toEqual({ s: 2, m: 0, l: 0 });
    expect(spaceportDocks(2)).toEqual({ s: 2, m: 2, l: 0 });
    expect(spaceportDocks(3)).toEqual({ s: 2, m: 2, l: 2 });
    expect(spaceportDocks(0)).toEqual({ s: 0, m: 0, l: 0 });
  });
});

describe('occupiesDock — exemptions GB §14/§21', () => {
  it('personnel, sonde et Combat-S exemptés ; le reste occupe', () => {
    expect(occupiesDock('personal', null)).toBe(false);
    expect(occupiesDock('probe', null)).toBe(false);
    expect(occupiesDock('combat', 's')).toBe(false);
    expect(occupiesDock('combat', 'm')).toBe(true);
    expect(occupiesDock('cargo', 's')).toBe(true);
    expect(occupiesDock('civil', 'l')).toBe(true);
  });
});

describe('fitsInDocks — glouton par débordement', () => {
  it('une coque ≤ son dock : L exige L ; M déborde sur L ; S partout', () => {
    expect(fitsInDocks(['l'], { s: 2, m: 2, l: 0 })).toBe(false);
    expect(fitsInDocks(['m'], { s: 2, m: 0, l: 1 })).toBe(true);
    expect(fitsInDocks(['s', 's', 's'], { s: 2, m: 1, l: 0 })).toBe(true);
    expect(fitsInDocks(['s', 's', 's'], { s: 2, m: 0, l: 0 })).toBe(false);
  });

  it('mélange serré : 2L+2M+2S remplissent exactement un L3', () => {
    expect(
      fitsInDocks(['l', 'l', 'm', 'm', 's', 's'], { s: 2, m: 2, l: 2 }),
    ).toBe(true);
    expect(
      fitsInDocks(['l', 'l', 'm', 'm', 's', 's', 's'], { s: 2, m: 2, l: 2 }),
    ).toBe(false);
  });

  it('le débordement M consomme les L AVANT le calcul des S', () => {
    // 2 M prennent m+l ; les 2 S ont s=1 + m libéré=0 + l=0 → 1 seul S entre.
    expect(fitsInDocks(['m', 'm', 's'], { s: 1, m: 1, l: 1 })).toBe(true);
    expect(fitsInDocks(['m', 'm', 's', 's'], { s: 1, m: 1, l: 1 })).toBe(false);
  });
});

describe('canAcceptLanding — réservations & propriétaire', () => {
  const L1 = [{ level: 1, reservedForSelf: 0 }];
  const L1R1 = [{ level: 1, reservedForSelf: 1 }];

  it('capacité de base : 2 visiteurs S sur un L1, le 3e est refusé', () => {
    expect(canAcceptLanding(L1, [], { size: 's', isOwner: false }).ok).toBe(true);
    expect(
      canAcceptLanding(L1, [{ size: 's', isOwner: false }], {
        size: 's',
        isOwner: false,
      }).ok,
    ).toBe(true);
    expect(
      canAcceptLanding(
        L1,
        [
          { size: 's', isOwner: false },
          { size: 's', isOwner: false },
        ],
        { size: 's', isOwner: false },
      ).ok,
    ).toBe(false);
  });

  it('coque M refusée sur L1 (aucun dock ≥ M), acceptée dès L2', () => {
    expect(canAcceptLanding(L1, [], { size: 'm', isOwner: true }).ok).toBe(false);
    expect(
      canAcceptLanding([{ level: 2, reservedForSelf: 0 }], [], {
        size: 'm',
        isOwner: true,
      }).ok,
    ).toBe(true);
  });

  it('réservation : le dock gardé refuse le visiteur, sert le propriétaire', () => {
    const oneVisitorDocked = [{ size: 's' as const, isOwner: false }];
    expect(
      canAcceptLanding(L1R1, oneVisitorDocked, { size: 's', isOwner: false }).ok,
    ).toBe(false);
    expect(
      canAcceptLanding(L1R1, oneVisitorDocked, { size: 's', isOwner: true }).ok,
    ).toBe(true);
  });

  it('les docks réservés sont soustraits PETITS d\'abord (S avant M)', () => {
    const r = canAcceptLanding(
      [{ level: 2, reservedForSelf: 2 }],
      [],
      { size: 's', isOwner: false },
    );
    expect(r.visitorPool).toEqual({ s: 0, m: 2, l: 0 });
    expect(r.ok).toBe(true); // le S visiteur déborde sur un dock M
  });

  it('plusieurs spaceports : les docks s\'additionnent', () => {
    const two = [
      { level: 1, reservedForSelf: 0 },
      { level: 1, reservedForSelf: 0 },
    ];
    const threeDocked = [
      { size: 's' as const, isOwner: false },
      { size: 's' as const, isOwner: false },
      { size: 's' as const, isOwner: false },
    ];
    expect(
      canAcceptLanding(two, threeDocked, { size: 's', isOwner: false }).ok,
    ).toBe(true);
  });
});
