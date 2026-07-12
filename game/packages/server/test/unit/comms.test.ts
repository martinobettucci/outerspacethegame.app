/**
 * Unitaires comms (GB §5) : paire canonique de canal et normalisation du
 * corps de message — la logique pure derrière le protocole de la Silence
 * (les parcours complets sont couverts en intégration et en E2E).
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalPair,
  MESSAGE_MAX_CHARS,
  normalizeMessageBody,
} from '../../src/services/comms.js';

describe('canonicalPair', () => {
  it('ordonne strictement quel que soit le sens du ping-back', () => {
    expect(canonicalPair('aaa', 'bbb')).toEqual(['aaa', 'bbb']);
    expect(canonicalPair('bbb', 'aaa')).toEqual(['aaa', 'bbb']);
  });

  it('est stable : les deux sens produisent LA même paire (un canal par couple)', () => {
    const [a1, b1] = canonicalPair('p-42', 'p-7');
    const [a2, b2] = canonicalPair('p-7', 'p-42');
    expect([a1, b1]).toEqual([a2, b2]);
    expect(a1 < b1).toBe(true); // miroir de la contrainte SQL channel_pair_order
  });
});

describe('normalizeMessageBody', () => {
  it('trim + conservation du contenu', () => {
    expect(normalizeMessageBody('  We read you.  ')).toBe('We read you.');
  });

  it('vide ou espaces : irrecevable', () => {
    expect(normalizeMessageBody('')).toBeNull();
    expect(normalizeMessageBody('   \n\t ')).toBeNull();
  });

  it(`limite exacte : ${MESSAGE_MAX_CHARS} accepté, ${MESSAGE_MAX_CHARS + 1} refusé`, () => {
    expect(normalizeMessageBody('x'.repeat(MESSAGE_MAX_CHARS))).toHaveLength(
      MESSAGE_MAX_CHARS,
    );
    expect(normalizeMessageBody('x'.repeat(MESSAGE_MAX_CHARS + 1))).toBeNull();
  });
});
