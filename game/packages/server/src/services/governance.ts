/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Governance v1”; GAME_BOOK.md §11/§21; DESIGN_GUIDE.md §4.1. */
/**
 * Gouvernance v1 (GB §11/§21, DG §4.1) — installation PERMANENTE de
 * gouverneurs et préview canon-obligatoire.
 *
 * Règles d'accès ICI (CLAUDE.md §10) : monde possédé par l'appelant, PNJ
 * possédé, NON hébergé, de grade gouverneur (rareté ≥ rare, chunk R) ;
 * capacité par taille (S 0 / M 1 / L 3 — canon). L'installation est
 * IRRÉVERSIBLE : aucun chemin de retrait n'existe, par conception (« les
 * gouverneurs servent le MONDE » — une conquête les transfère, P5).
 */
import {
  effectiveMask,
  governanceMultiplier,
  GOVERNORS_MAX,
  isGovernorGrade,
  RARITY_TIER_INDEX,
  ROLE_TO_ARCHETYPE,
  type Archetype,
  type NpcRole,
  type PlanetSize,
  type Rarity,
  type TechNodeKey,
} from '@atg/shared';
import type pg from 'pg';
import { recomputePlanetRates } from '../sim/rebase.js';
import { CommandError } from './planets.js';

export interface GovernorView {
  id: string;
  role: NpcRole;
  rarity: Rarity;
  people: string;
  archetype: Archetype;
}

export interface GovernanceView {
  required: number;
  max: number;
  governors: GovernorView[];
  personalShipParked: boolean;
  g: number;
  fullyGoverned: boolean;
}

/** État de gouvernance d'un monde (lecture partagée planetDetail/preview). */
export async function governanceOf(
  client: pg.Pool | pg.PoolClient,
  bodyId: string,
  size: PlanetSize,
  ownerId: string,
): Promise<GovernanceView> {
  const { rows: govRows } = await client.query(
    `SELECT id, role, rarity, people FROM npcs
     WHERE bound_host_type = 'planet' AND bound_host_id = $1
     ORDER BY created_at, id`,
    [bodyId],
  );
  const { rows: parked } = await client.query(
    `SELECT 1 FROM ships
     WHERE hull_category = 'personal' AND owner_id = $1
       AND status = 'docked' AND docked_body_id = $2 LIMIT 1`,
    [ownerId, bodyId],
  );
  const governors: GovernorView[] = govRows.map((r) => ({
    id: String(r.id),
    role: r.role as NpcRole,
    rarity: r.rarity as Rarity,
    people: String(r.people),
    archetype: ROLE_TO_ARCHETYPE[r.role as NpcRole],
  }));
  const result = governanceMultiplier({
    size,
    installedTiers: governors.map((g) => RARITY_TIER_INDEX[g.rarity] ?? 0),
    personalShipParked: parked.length > 0,
  });
  return {
    required: result.required,
    max: GOVERNORS_MAX[size],
    governors,
    personalShipParked: parked.length > 0,
    g: result.g,
    fullyGoverned: result.fullyGoverned,
  };
}

/**
 * Installe un gouverneur — PERMANENT (canon). Verrous : corps puis PNJ.
 * Le rebase suit : G change immédiatement les débits du monde.
 */
export async function installGovernor(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  npcId: string,
  nowMs = Date.now(),
): Promise<GovernanceView> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id, size FROM bodies
       WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [bodyId],
    );
    const body = bodies[0];
    if (!body) throw new CommandError('not_found', 'Planète inconnue');
    if (body.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const size = body.size as PlanetSize;
    const max = GOVERNORS_MAX[size];
    if (max === 0) {
      throw new CommandError(
        'not_available',
        'Un petit monde tourne sans gouverneur (canon)',
      );
    }
    const { rows: npcs } = await client.query(
      `SELECT * FROM npcs WHERE id = $1 FOR UPDATE`,
      [npcId],
    );
    const npc = npcs[0];
    if (!npc) throw new CommandError('not_found', 'Personnage inconnu');
    if (npc.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce personnage ne vous suit pas');
    }
    if (npc.bound_host_type) {
      throw new CommandError(
        'not_available',
        'Ce personnage est déjà lié à un hôte (liaison permanente)',
      );
    }
    if (!isGovernorGrade(npc.rarity as Rarity)) {
      throw new CommandError(
        'not_available',
        'Grade gouverneur requis : rareté rare ou au-delà',
      );
    }
    const { rows: count } = await client.query(
      `SELECT count(*)::int AS n FROM npcs
       WHERE bound_host_type = 'planet' AND bound_host_id = $1`,
      [bodyId],
    );
    if (count[0].n >= max) {
      throw new CommandError(
        'not_available',
        `Sièges de gouvernance pleins (${count[0].n}/${max})`,
      );
    }
    await client.query(
      `UPDATE npcs SET bound_host_type = 'planet', bound_host_id = $2
       WHERE id = $1`,
      [npcId, bodyId],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    const view = await governanceOf(client, bodyId, size, playerId);
    await client.query('COMMIT');
    return view;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface GovernancePreview {
  archetypes: Archetype[];
  maskAllowed: TechNodeKey[];
  /** Nœuds permis AUJOURD'HUI qui seraient PERDUS par l'installation. */
  maskLost: TechNodeKey[];
  g: number;
  fullyGoverned: boolean;
}

/**
 * Préview canon-obligatoire : simule l'ensemble {gouverneurs actuels +
 * candidats} et rend masque résultant, nœuds perdus et G — LECTURE seule,
 * propriétaire seulement, candidats validés comme à l'installation.
 */
export async function previewGovernance(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  npcIds: string[],
): Promise<GovernancePreview> {
  const { rows: bodies } = await pool.query(
    `SELECT id, owner_id, size FROM bodies
     WHERE id = $1 AND body_type = 'planet'`,
    [bodyId],
  );
  const body = bodies[0];
  if (!body) throw new CommandError('not_found', 'Planète inconnue');
  if (body.owner_id !== playerId) {
    throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
  }
  const size = body.size as PlanetSize;
  const current = await governanceOf(pool, bodyId, size, playerId);
  if (npcIds.length === 0) {
    throw new CommandError('not_available', 'Aucun candidat à prévisualiser');
  }
  if (current.governors.length + npcIds.length > GOVERNORS_MAX[size]) {
    throw new CommandError(
      'not_available',
      `Sièges de gouvernance dépassés (${current.governors.length}+${npcIds.length}/${GOVERNORS_MAX[size]})`,
    );
  }
  const { rows: candidates } = await pool.query(
    `SELECT id, owner_id, role, rarity, bound_host_type FROM npcs
     WHERE id = ANY($1::uuid[])`,
    [npcIds],
  );
  if (candidates.length !== new Set(npcIds).size) {
    throw new CommandError('not_found', 'Candidat inconnu');
  }
  for (const c of candidates) {
    if (c.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce personnage ne vous suit pas');
    }
    if (c.bound_host_type) {
      throw new CommandError('not_available', 'Candidat déjà lié à un hôte');
    }
    if (!isGovernorGrade(c.rarity as Rarity)) {
      throw new CommandError(
        'not_available',
        'Grade gouverneur requis : rareté rare ou au-delà',
      );
    }
  }
  const archetypes = [
    ...current.governors.map((g) => g.archetype),
    ...candidates.map((c) => ROLE_TO_ARCHETYPE[c.role as NpcRole]),
  ];
  const maskArchetypes = current.personalShipParked
    ? [...archetypes, await ownerPolitics(pool, playerId)]
    : archetypes;
  const allowed = effectiveMask(maskArchetypes);
  const currentMaskArchetypes = current.personalShipParked
    ? [
        ...current.governors.map((g) => g.archetype),
        await ownerPolitics(pool, playerId),
      ]
    : current.governors.map((g) => g.archetype);
  const currentAllowed = effectiveMask(currentMaskArchetypes);
  const g = governanceMultiplier({
    size,
    installedTiers: [
      ...current.governors.map((gv) => RARITY_TIER_INDEX[gv.rarity] ?? 0),
      ...candidates.map((c) => RARITY_TIER_INDEX[c.rarity as Rarity] ?? 0),
    ],
    personalShipParked: current.personalShipParked,
  });
  return {
    archetypes,
    maskAllowed: [...allowed].sort(),
    maskLost: [...currentAllowed].filter((k) => !allowed.has(k)).sort(),
    g: g.g,
    fullyGoverned: g.fullyGoverned,
  };
}

async function ownerPolitics(
  client: pg.Pool | pg.PoolClient,
  playerId: string,
): Promise<Archetype> {
  const { rows } = await client.query(
    `SELECT politics FROM players WHERE id = $1`,
    [playerId],
  );
  return rows[0]?.politics as Archetype;
}
