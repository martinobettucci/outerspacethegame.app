/**
 * Drains de loitering (GB §7, DG §3.5/§9.1) : taux par taille, exemptions
 * canon (personal §21, probe sans réservoir), table de vérité COMPLÈTE de
 * la cible du drain, rayon de transfert [TUNE-GAP].
 */
import { describe, expect, it } from 'vitest';
import {
  survivalDrainTPerDay,
  survivalCapacityT,
  FUEL_TRANSFER_RADIUS_PC,
  HOVER_IDLE_FUEL_U_PER_DAY,
  hoverIdleFuelUPerDay,
  shipDrainTarget,
} from './ships.js';

describe('hoverIdleFuelUPerDay (DG §3.5)', () => {
  it('0.2 / 0.4 / 0.8 u/jour pour S / M / L', () => {
    expect(hoverIdleFuelUPerDay('cargo', 's')).toBeCloseTo(0.2, 9);
    expect(hoverIdleFuelUPerDay('civil', 'm')).toBeCloseTo(0.4, 9);
    expect(hoverIdleFuelUPerDay('combat', 'l')).toBeCloseTo(0.8, 9);
  });

  it('exemptions : probe et personal ne consomment rien (GB §21)', () => {
    expect(hoverIdleFuelUPerDay('probe', null)).toBe(0);
    expect(hoverIdleFuelUPerDay('personal', null)).toBe(0);
    expect(hoverIdleFuelUPerDay('personal', 's')).toBe(0);
  });

  it('taille inconnue : 0 (défensif, jamais NaN)', () => {
    expect(hoverIdleFuelUPerDay('cargo', null)).toBe(0);
    expect(hoverIdleFuelUPerDay('cargo', 'xl')).toBe(0);
  });
});

describe('shipDrainTarget — table de vérité complète (GB §7)', () => {
  const base = { category: 'cargo', size: 's' as const };

  it.each(['docked', 'transit', 'warehoused', 'derelict', 'stranded', 'colonizing'])(
    'statut %s → none',
    (status) => {
      expect(
        shipDrainTarget({ ...base, status, overOwnPlanet: false, planetCanServe: false }),
      ).toBe('none');
      expect(
        shipDrainTarget({ ...base, status, overOwnPlanet: true, planetCanServe: true }),
      ).toBe('none');
    },
  );

  it('hovering sur SON monde qui sert → planet (resupply round-trips)', () => {
    expect(
      shipDrainTarget({
        ...base,
        status: 'hovering',
        overOwnPlanet: true,
        planetCanServe: true,
      }),
    ).toBe('planet');
  });

  it('hovering sur son monde À SEC → tank', () => {
    expect(
      shipDrainTarget({
        ...base,
        status: 'hovering',
        overOwnPlanet: true,
        planetCanServe: false,
      }),
    ).toBe('tank');
  });

  it('hovering étranger ou sauvage → tank', () => {
    expect(
      shipDrainTarget({
        ...base,
        status: 'hovering',
        overOwnPlanet: false,
        planetCanServe: true,
      }),
    ).toBe('tank');
  });

  it('idle dans le vide → tank (GB §7 : both consume)', () => {
    expect(
      shipDrainTarget({
        ...base,
        status: 'idle',
        overOwnPlanet: false,
        planetCanServe: false,
      }),
    ).toBe('tank');
  });

  it('exemptés (probe/personal) → none quel que soit le statut', () => {
    for (const status of ['hovering', 'idle']) {
      expect(
        shipDrainTarget({
          category: 'probe',
          size: null,
          status,
          overOwnPlanet: false,
          planetCanServe: false,
        }),
      ).toBe('none');
      expect(
        shipDrainTarget({
          category: 'personal',
          size: null,
          status,
          overOwnPlanet: true,
          planetCanServe: true,
        }),
      ).toBe('none');
    }
  });
});

describe('constantes de transfert', () => {
  it('FUEL_TRANSFER_RADIUS_PC = 1 [TUNE-GAP] ; taux de base 0.2 [TUNE]', () => {
    expect(FUEL_TRANSFER_RADIUS_PC).toBe(1);
    expect(HOVER_IDLE_FUEL_U_PER_DAY).toBeCloseTo(0.2, 9);
  });
});

describe('survivalDrainTPerDay & capacité (GB §6, DG §3.5)', () => {
  it('0 sans équipage, 0.01 T/j/ressource par membre là où on vit à bord', () => {
    expect(survivalDrainTPerDay('cargo', 'hovering', 0)).toBe(0);
    expect(survivalDrainTPerDay('cargo', 'hovering', 1)).toBeCloseTo(0.01, 12);
    expect(survivalDrainTPerDay('cargo', 'transit', 2)).toBeCloseTo(0.02, 12);
    expect(survivalDrainTPerDay('cargo', 'idle', 1)).toBeCloseTo(0.01, 12);
    expect(survivalDrainTPerDay('cargo', 'stranded', 1)).toBeCloseTo(0.01, 12);
  });

  it('exemptions : quai/entrepôt/derelict/colonizing, son monde, probe/personal', () => {
    for (const status of ['docked', 'warehoused', 'derelict', 'colonizing']) {
      expect(survivalDrainTPerDay('cargo', status, 3)).toBe(0);
    }
    expect(
      survivalDrainTPerDay('cargo', 'hovering', 2, { overOwnWorld: true }),
    ).toBe(0);
    expect(survivalDrainTPerDay('probe', 'hovering', 1)).toBe(0);
    expect(survivalDrainTPerDay('personal', 'idle', 1)).toBe(0);
  });

  it('capacité = survivalCrewDays × 0.01 × équipage (ancre de l\'alarme 25 %)', () => {
    expect(survivalCapacityT(14, 1)).toBeCloseTo(0.14, 12);
    expect(survivalCapacityT(60, 2)).toBeCloseTo(1.2, 12);
    expect(survivalCapacityT(14, 0)).toBe(0);
  });
});
