/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Recruitment pods”; GAME_BOOK.md §12/§13/§19; DESIGN_GUIDE.md §11.4. */
/**
 * Pods de recrutement (GB §12/§13, DG §11.4) — le puits de ressources
 * qui produit les PNJ. Prix dérivés du DERNIER census (S_r ajusté des
 * tonnes de pods payées depuis le snapshot — « purchases count into
 * supply immediately ») ; cap quotidien et âge de compte appliqués côté
 * serveur (CLAUDE.md §10) ; contenu roulé par RNG SEEDÉ au moment de
 * l'ouverture (déterminisme DG §1 : seed = universe:pod:joueur:index).
 */
import {
  ALL_RESOURCE_IDS,
  GAME_DAY_SECONDS,
  POD_DAILY_CAP,
  POD_MIN_ACCOUNT_AGE_DAYS,
  POD_NPC_ACCOUNT_BIND_DAYS,
  podPrices,
  rollPodNpc,
  SeededStream,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { config } from '../config.js';
import { evalLazy } from '../sim/lazy.js';
import { recomputePlanetRates } from '../sim/rebase.js';
import { CommandError } from './planets.js';

export interface PodPricing {
  /** Snapshot de base (ISO) — null tant qu'aucun census n'existe. */
  censusTakenAt: string;
  /** Barème EXHAUSTIF : tonnes de `r` pour un pod, par ressource. */
  prices: Record<ResourceId, number>;
}

export interface PodEligibility {
  /** Projection informative pour le joueur authentifié — jamais une autorité. */
  eligible: boolean;
  minAccountAgeDays: number;
  eligibleAt: string;
}

/**
 * Éligibilité d'âge du joueur courant. `lock` n'est utilisé que dans la
 * transaction d'ouverture : le GET reste une projection, le POST sérialise
 * et revérifie la même ligne au moment exact de la commande.
 */
export async function podEligibility(
  db: pg.Pool | pg.PoolClient,
  playerId: string,
  nowMs = Date.now(),
  options: { lock?: boolean } = {},
): Promise<PodEligibility> {
  const { rows } = await db.query(
    `SELECT created_at FROM players WHERE id = $1${
      options.lock ? ' FOR UPDATE' : ''
    }`,
    [playerId],
  );
  if (!rows[0]) throw new CommandError('not_found', 'Joueur inconnu');
  const eligibleAtMs =
    new Date(rows[0].created_at).getTime() +
    POD_MIN_ACCOUNT_AGE_DAYS * GAME_DAY_SECONDS * 1000;
  return {
    eligible: nowMs >= eligibleAtMs,
    minAccountAgeDays: POD_MIN_ACCOUNT_AGE_DAYS,
    eligibleAt: new Date(eligibleAtMs).toISOString(),
  };
}

/**
 * Barème courant : S_r du dernier census MOINS les tonnes de pods payées
 * en `r` depuis ce snapshot (impact immédiat, canon). Client optionnel :
 * les écritures le passent pour lire DANS leur transaction.
 */
export async function podPricing(
  db: pg.Pool | pg.PoolClient,
): Promise<PodPricing> {
  const { rows: snaps } = await db.query(
    `SELECT taken_at, totals FROM census_snapshots
     ORDER BY taken_at DESC, id DESC LIMIT 1`,
  );
  if (!snaps[0]) {
    throw new CommandError(
      'not_available',
      'Aucun census encore — le premier snapshot arrive avec le tick',
    );
  }
  const takenAt: Date = snaps[0].taken_at;
  const { rows: sinceRows } = await db.query(
    `SELECT resource, sum(tons_paid) AS paid FROM pod_openings
     WHERE opened_at > $1 GROUP BY resource`,
    [takenAt],
  );
  const paidSince = new Map(
    sinceRows.map((r) => [r.resource as string, Number(r.paid)]),
  );
  const supplies: Partial<Record<ResourceId, number>> = {};
  for (const r of ALL_RESOURCE_IDS) {
    const total = Number(
      (snaps[0].totals as Record<string, { totalT?: number }>)[r]?.totalT ?? 0,
    );
    supplies[r] = Math.max(0, total - (paidSince.get(r) ?? 0));
  }
  return {
    censusTakenAt: new Date(takenAt).toISOString(),
    prices: podPrices(supplies),
  };
}

export interface OpenedPod {
  npc: {
    id: string;
    people: string;
    role: string;
    rarity: string;
    statRolls: Record<string, number>;
    accountBoundUntil: string;
  };
  paid: { resource: ResourceId; tons: number };
  pricing: PodPricing;
}

/**
 * Ouvre un pod : payé en `resource` depuis le stock d'un monde POSSÉDÉ
 * (co-location physique — le puits retire de vraies tonnes). Verrou du
 * joueur d'abord : sérialise cap quotidien et index de seed.
 */
export async function openPod(
  pool: pg.Pool,
  playerId: string,
  input: { planetId: string; resource: string },
  opts: { universeSeed: string; nowMs?: number } = { universeSeed: '' },
): Promise<OpenedPod> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!ALL_RESOURCE_IDS.includes(input.resource as ResourceId)) {
    throw new CommandError('not_found', 'Ressource inconnue');
  }
  const resource = input.resource as ResourceId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligibility = await podEligibility(client, playerId, nowMs, {
      lock: true,
    });
    // Âge de compte (GB : « accounts < 45 days cannot buy pods »).
    if (!eligibility.eligible) {
      throw new CommandError(
        'forbidden',
        `Compte trop jeune : ${eligibility.minAccountAgeDays} jours requis pour recruter`,
      );
    }
    // Cap quotidien (10/jour [TUNE] — jour de jeu = jour réel, DG §0).
    const { rows: dayCount } = await client.query(
      `SELECT count(*)::int AS n FROM pod_openings
       WHERE player_id = $1 AND opened_at > to_timestamp($2 / 1000.0) - interval '24 hours'`,
      [playerId, nowMs],
    );
    if (dayCount[0].n >= POD_DAILY_CAP) {
      throw new CommandError(
        'not_available',
        `Cap quotidien atteint : ${POD_DAILY_CAP} pods/jour`,
      );
    }
    // Prix courant (census + impact immédiat), lu DANS la transaction.
    const pricing = await podPricing(client);
    const price = pricing.prices[resource];

    // Paiement physique depuis un monde possédé.
    const { rows: bodies } = await client.query(
      `SELECT id FROM bodies WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [input.planetId, playerId],
    );
    if (!bodies[0]) {
      throw new CommandError('forbidden', 'Le pod se paie depuis VOTRE monde');
    }
    const { rows: stockRows } = await client.query(
      `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
       WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
      [input.planetId, resource],
    );
    const available = stockRows[0]
      ? evalLazy(
          {
            amount: Number(stockRows[0].amount_t),
            ratePerDay: Number(stockRows[0].rate_t_per_day),
            asOfMs: new Date(stockRows[0].as_of).getTime(),
          },
          nowMs,
          config.TIME_SCALE,
          { min: 0 },
        )
      : 0;
    if (available + 1e-9 < price) {
      throw new CommandError(
        'insufficient_resources',
        `Stock insuffisant : ${Math.floor(available)}/${price} T de ${resource}`,
      );
    }
    await client.query(
      `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [input.planetId, resource, available - price, nowMs],
    );
    await recomputePlanetRates(client, input.planetId, nowMs);

    // Index d'ouverture (verrouillé par la ligne joueur) → seed stable.
    const { rows: countRows } = await client.query(
      `SELECT count(*)::int AS n FROM pod_openings WHERE player_id = $1`,
      [playerId],
    );
    const podIndex = countRows[0].n + 1;
    const roll = rollPodNpc(
      new SeededStream(opts.universeSeed, `pod:${playerId}:${podIndex}`),
    );
    const boundUntil = new Date(
      nowMs + POD_NPC_ACCOUNT_BIND_DAYS * GAME_DAY_SECONDS * 1000,
    );
    const { rows: npcRows } = await client.query(
      `INSERT INTO npcs (owner_id, people, role, rarity, stat_rolls,
          account_bound_until)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        playerId,
        roll.people,
        roll.role,
        roll.rarity,
        JSON.stringify(roll.statRolls),
        boundUntil,
      ],
    );
    await client.query(
      `INSERT INTO pod_openings (player_id, resource, tons_paid, npc_id, opened_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [playerId, resource, price, npcRows[0].id, nowMs],
    );
    await client.query('COMMIT');
    return {
      npc: {
        id: npcRows[0].id,
        people: roll.people,
        role: roll.role,
        rarity: roll.rarity,
        statRolls: roll.statRolls,
        accountBoundUntil: boundUntil.toISOString(),
      },
      paid: { resource, tons: price },
      pricing,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
