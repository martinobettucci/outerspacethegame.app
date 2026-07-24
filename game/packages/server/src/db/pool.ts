/** @spec All declarations and algorithms in this file implement: docs/DAT.md §3/§8; docs/SCHEMA.md §Conventions. */
import pg from 'pg';
import { config } from '../config.js';

/**
 * Pool PostgreSQL partagé. Les quantités de jeu utilisent NUMERIC côté SQL ;
 * pg les renvoie en chaîne par défaut — on les parse en nombre ici, la
 * précision double suffit pour les grandeurs du jeu (tonnes, unités) et le
 * déterminisme des recalculs est garanti par les mêmes opérations flottantes
 * partout (même moteur V8 API/worker).
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => parseFloat(v));

export function createPool(databaseUrl: string = config.DATABASE_URL): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
