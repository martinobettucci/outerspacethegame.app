/**
 * Canal manuel (GB §9, DG §6 round 7) : validation des bundles, limites
 * (1 ouverte/(acheteur, monde, ressource), 20/24 h), échéance 48 h réelles.
 */
import { describe, expect, it } from 'vitest';
import { ALL_RESOURCE_IDS } from './resources.js';
import {
  canOpenOffer,
  MANUAL_OFFER_DAILY_MAX,
  MANUAL_OFFER_TTL_HOURS,
  offerExpiresAtMs,
  validateManualOffer,
} from './manualTrade.js';

const isRes = (r: string) => (ALL_RESOURCE_IDS as readonly string[]).includes(r);

describe('validateManualOffer', () => {
  it('bundle nominal accepté (tonnes partielles comprises)', () => {
    expect(
      validateManualOffer(
        { getResource: 'ore', getTons: 2.5, giveResource: 'water', giveTons: 0.5 },
        isRes,
      ),
    ).toBeNull();
  });

  it('ressources inconnues, identiques, quantités nulles/négatives/infinies refusées', () => {
    const base = { getResource: 'ore', getTons: 1, giveResource: 'water', giveTons: 1 };
    expect(validateManualOffer({ ...base, getResource: 'unobtainium' }, isRes)).toMatch(/inconnue/);
    expect(validateManualOffer({ ...base, giveResource: 'unobtainium' }, isRes)).toMatch(/inconnue/);
    expect(
      validateManualOffer({ ...base, giveResource: 'ore' }, isRes),
    ).toMatch(/même ressource/);
    expect(validateManualOffer({ ...base, getTons: 0 }, isRes)).toMatch(/invalide/);
    expect(validateManualOffer({ ...base, giveTons: -1 }, isRes)).toMatch(/invalide/);
    expect(
      validateManualOffer({ ...base, getTons: Number.POSITIVE_INFINITY }, isRes),
    ).toMatch(/invalide/);
    expect(validateManualOffer({ ...base, giveTons: 2_000_000 }, isRes)).toMatch(/démesurée/);
  });
});

describe('canOpenOffer — limites round 7', () => {
  it('libre sous les plafonds ; 1 seule ouverte par item ; 20 créations/24 h', () => {
    expect(canOpenOffer({ openForItem: 0, createdLast24h: 0 })).toBeNull();
    expect(canOpenOffer({ openForItem: 0, createdLast24h: MANUAL_OFFER_DAILY_MAX - 1 })).toBeNull();
    expect(canOpenOffer({ openForItem: 1, createdLast24h: 0 })).toMatch(/seule offre/);
    expect(
      canOpenOffer({ openForItem: 0, createdLast24h: MANUAL_OFFER_DAILY_MAX }),
    ).toMatch(/Plafond/);
  });
});

describe('offerExpiresAtMs', () => {
  it('échéance = création + 48 h réelles', () => {
    expect(offerExpiresAtMs(1_000)).toBe(1_000 + MANUAL_OFFER_TTL_HOURS * 3600 * 1000);
  });
});
