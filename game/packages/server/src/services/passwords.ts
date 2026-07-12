/**
 * Hachage de mots de passe — scrypt natif Node (aucune dépendance).
 * Format : scrypt$N$r$p$salt_b64$hash_b64 — auto-décrit pour permettre
 * une montée de paramètres sans casser les comptes existants.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const actual = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAXMEM,
  });
  return timingSafeEqual(actual, expected);
}
