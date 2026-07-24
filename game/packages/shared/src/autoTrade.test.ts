/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Hover auto-trade”; GAME_BOOK.md §7; DESIGN_GUIDE.md §3.5. */
/** Auto-trade du survol (GB §7, DG §3.5) — destinations, validation. */
import { describe, expect, it } from 'vitest';
import {
  AUTO_TRADE_MAX_COST_PER_T,
  autoTradeDestination,
  MAX_AUTO_TRADE_RULES,
  validateAutoTradeRules,
} from './autoTrade.js';

describe('autoTradeDestination — tank / provisions / soute', () => {
  it('fuel du type du réservoir → tank ; autre fuel → soute', () => {
    expect(autoTradeDestination('fuel_cold', 'cold')).toBe('tank');
    expect(autoTradeDestination('fuel_hot', 'cold')).toBe('cargo');
  });

  it('familles food → provisions food ; water → provisions water', () => {
    expect(autoTradeDestination('food_1', 'cold')).toBe('survival_food');
    expect(autoTradeDestination('food_3', 'gas')).toBe('survival_food');
    expect(autoTradeDestination('water', 'cold')).toBe('survival_water');
    expect(autoTradeDestination('ore', 'cold')).toBe('cargo');
  });
});

describe('validateAutoTradeRules — bornes et unicité', () => {
  it('accepte 3 règles distinctes ; refuse la 4e, le doublon, les bornes', () => {
    expect(
      validateAutoTradeRules([
        { resource: 'food_1', belowT: 20, buyT: 200 },
        { resource: 'water', belowT: 10, buyT: 50 },
        { resource: 'fuel_cold', belowT: 5, buyT: 30 },
      ]),
    ).toBeNull();
    expect(
      validateAutoTradeRules(
        Array.from({ length: MAX_AUTO_TRADE_RULES + 1 }, (_, i) => ({
          resource: (['ore', 'gold', 'water', 'food_1'] as const)[i]!,
          belowT: 1,
          buyT: 1,
        })),
      ),
    ).toMatch(/Au plus/);
    expect(
      validateAutoTradeRules([
        { resource: 'ore', belowT: 1, buyT: 1 },
        { resource: 'ore', belowT: 2, buyT: 2 },
      ]),
    ).toMatch(/par ressource/);
    expect(validateAutoTradeRules([{ resource: 'ore', belowT: -1, buyT: 1 }]))
      .toMatch(/Seuil/);
    expect(validateAutoTradeRules([{ resource: 'ore', belowT: 1, buyT: 0 }]))
      .toMatch(/Quantité/);
  });

  it('borne de prix par défaut : 3 T de contrepartie par tonne [TUNE-v1]', () => {
    expect(AUTO_TRADE_MAX_COST_PER_T).toBe(3);
  });
});
