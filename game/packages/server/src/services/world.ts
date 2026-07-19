/**
 * Visibilité & brouillard de guerre — GAMEBOOK §4.
 * Scope = union des cercles par planète possédée :
 * rayon = BASE_SKY_PC + Σ(200 pc × niveau) des télescopes actifs du monde.
 * BASE_SKY_PC = 60 pc [TUNE-GAP : « ciel local » non chiffré par le guide —
 * permet de voir sa propre poche (étoile 40 pc, sauvages ≤ 60 pc) sans
 * télescope ; le voisin garanti (150–240 pc) exige un télescope].
 */
import {
  intelTierFromSources,
  planetTechAvailability,
  projectPlanetIntel,
  starIsFlaring,
  type IntelTier,
  type PlanetIntel,
} from '@atg/shared';
import { evalStarFuel } from './harvest.js';
import type pg from 'pg';
import { evalLazy, whenReaches } from '../sim/lazy.js';
import { CommandError, governingArchetypes } from './planets.js';

export const BASE_SKY_PC = 60;
export const TELESCOPE_SCOPE_PC_PER_LEVEL = 200;
/** Rayon de scan d'une sonde arrivée / d'un vaisseau (pc). [TUNE-GAP] */
export const PROBE_SCAN_PC = 60;
export const SHIP_SCAN_PC = 20;

export interface VisibleBody {
  id: string;
  bodyType: 'planet' | 'star' | 'black_hole';
  name: string;
  x: number;
  y: number;
  size: string | null;
  climate: string | null;
  quality: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isStarter: boolean;
  starClass: string | null;
  starFuelType: string | null;
  owned: boolean;
  /** Étoile en flare (≤ 5 % du stock initial — GB §22). */
  flaring: boolean;
  /** Monde annihilé par supernova (cendre — jamais recolonisable). */
  annihilated: boolean;
}

/**
 * Corps visibles par un joueur. Les champs cachés (stock d'étoile…) ne
 * sortent JAMAIS d'ici ; le détail par paliers vit dans bodyIntel (chunk Q).
 */
export async function visibleBodies(
  pool: pg.Pool,
  playerId: string,
): Promise<VisibleBody[]> {
  const { rows } = await pool.query(
    `
    WITH scopes AS (
      SELECT b.x, b.y,
             $2::float + COALESCE((
               SELECT sum($3::float * t.level)
               FROM buildings t
               WHERE t.body_id = b.id AND t.key = 'telescope'
                 AND t.status = 'active'
             ), 0) AS radius
      FROM bodies b
      WHERE b.owner_id = $1
      UNION ALL
      -- Sondes et vaisseaux hors transit : vision locale (GB §4 —
      -- « on découvre en y allant ou par sonde »).
      SELECT s.x, s.y,
             CASE WHEN s.hull_category = 'probe' THEN $4::float ELSE $5::float END
      FROM ships s
      WHERE s.owner_id = $1 AND s.status IN ('hovering', 'idle', 'docked', 'stranded')
    )
    SELECT DISTINCT ON (b.id)
           b.id, b.body_type, b.name, b.x, b.y, b.size, b.climate, b.quality,
           b.owner_id, p.display_name AS owner_name, b.is_starter,
           b.star_class, b.star_fuel_type,
           b.star_fuel_stock, b.star_fuel_rate_u_per_day, b.star_fuel_as_of,
           b.star_fuel_initial,
           (b.config->>'annihilated') IS NOT NULL AS annihilated
    FROM bodies b
    LEFT JOIN players p ON p.id = b.owner_id
    WHERE b.owner_id = $1
       OR EXISTS (
            SELECT 1 FROM scopes s
            WHERE (b.x - s.x)^2 + (b.y - s.y)^2 <= s.radius^2
          )
    ORDER BY b.id
    `,
    [playerId, BASE_SKY_PC, TELESCOPE_SCOPE_PC_PER_LEVEL, PROBE_SCAN_PC, SHIP_SCAN_PC],
  );
  return rows.map((r) => ({
    id: r.id,
    bodyType: r.body_type,
    name: r.name,
    x: r.x,
    y: r.y,
    size: r.size,
    climate: r.climate,
    // Fuite canon corrigée (chunk Q) : la QUALITÉ est de l'intel de
    // palier 4 (deep sight) — jamais publiée par la simple visibilité.
    // Champ conservé (null) pour la stabilité du schéma.
    quality: r.owner_id === playerId ? r.quality : null,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    isStarter: r.is_starter,
    starClass: r.star_class,
    starFuelType: r.star_fuel_type,
    // Flare (GB §22) : la SEULE jauge que l'univers donne — un booléen,
    // jamais le stock. Visible dès que l'étoile l'est (scope/vision).
    flaring:
      r.body_type === 'star'
        ? starIsFlaring(
            evalStarFuel(r, Date.now()),
            Number(r.star_fuel_initial ?? 0),
          )
        : false,
    annihilated: !!r.annihilated,
    owned: r.owner_id === playerId,
  }));
}

/**
 * Intel planétaire par paliers (GB §20, DG §4.1/§11.3) — calcul SERVEUR
 * uniquement (CLAUDE.md §10). Palier 0 ⇒ not_found (jamais forbidden :
 * pas d'oracle d'existence). Lecture pure, pas de transaction.
 * GET /planets/:id reste owner-only : le détail OPÉRATIONNEL (stocks,
 * recettes, workforce, config) n'est jamais de l'intel, même à L4.
 */
export async function bodyIntel(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nowMs: number,
): Promise<PlanetIntel> {
  const { rows: bodies } = await pool.query(
    `SELECT b.*, p.display_name AS owner_name
     FROM bodies b LEFT JOIN players p ON p.id = b.owner_id
     WHERE b.id = $1`,
    [bodyId],
  );
  const body = bodies[0];
  // Corps inconnu ET corps hors scope répondent LA MÊME chose (404).
  const notFound = new CommandError('not_found', 'Rien de connu à cette adresse');
  if (!body) throw notFound;
  if (body.body_type !== 'planet') {
    throw new CommandError(
      'not_available',
      "L'intel détaillée ne vise que les planètes (v1)",
    );
  }

  // Sources : chaque monde possédé dont le scope COMBINÉ couvre la cible
  // apporte son MEILLEUR télescope actif ([TUNE-GAP] indice = meilleur
  // instrument) et son caractère scientifique (gouvernance).
  const { rows: sourceRows } = await pool.query(
    `SELECT w.id,
            (SELECT max(t.level) FROM buildings t
             WHERE t.body_id = w.id AND t.key = 'telescope'
               AND t.status = 'active') AS best_level,
            $3::float + COALESCE((SELECT sum($4::float * t.level)
             FROM buildings t
             WHERE t.body_id = w.id AND t.key = 'telescope'
               AND t.status = 'active'), 0) AS radius,
            sqrt((w.x - $5::float)^2 + (w.y - $6::float)^2) AS distance
     FROM bodies w WHERE w.owner_id = $1 AND w.id <> $2`,
    [playerId, bodyId, BASE_SKY_PC, TELESCOPE_SCOPE_PC_PER_LEVEL, body.x, body.y],
  );
  const sources: { telescopeLevel: 1 | 2 | 3; scientificSource: boolean }[] = [];
  let visible = false;
  for (const w of sourceRows) {
    if (Number(w.distance) > Number(w.radius)) continue;
    visible = true;
    const level = Number(w.best_level ?? 0);
    if (level >= 1) {
      const archetypes = await governingArchetypes(pool, w.id, playerId);
      sources.push({
        telescopeLevel: Math.min(3, level) as 1 | 2 | 3,
        scientificSource: archetypes.includes('scientific'),
      });
    }
  }
  // Présence propre : vaisseau à portée de scan ⇒ visible ; sonde à
  // portée ⇒ deep sight [TUNE-GAP].
  const { rows: presenceRows } = await pool.query(
    `SELECT hull_category FROM ships
     WHERE owner_id = $1 AND status IN ('hovering', 'idle', 'docked', 'stranded')
       AND (x - $2::float)^2 + (y - $3::float)^2 <=
           (CASE WHEN hull_category = 'probe' THEN $4::float ELSE $5::float END)^2`,
    [playerId, body.x, body.y, PROBE_SCAN_PC, SHIP_SCAN_PC],
  );
  const probeOnSite = presenceRows.some((r) => r.hull_category === 'probe');
  if (presenceRows.length > 0) visible = true;
  if (body.owner_id === playerId) visible = true;

  const tier =
    body.owner_id === playerId
      ? 4
      : intelTierFromSources(sources, { visible, probeOnSite });
  if (tier === 0) throw notFound;

  // Données brutes — chargées quel que soit le palier, la PROJECTION
  // (liste blanche partagée) décide seule de ce qui sort.
  const { rows: buildingRows } = await pool.query(
    `SELECT key, level, status, tile_index, config FROM buildings
     WHERE body_id = $1 ORDER BY created_at, id`,
    [bodyId],
  );
  const spaceports = buildingRows.filter(
    (b) => b.key === 'spaceport' && b.status === 'active',
  );
  const spaceportOpen =
    spaceports.length === 0
      ? null
      : spaceports.some((b) => b.config?.landing === 'everyone');
  const marketPairs = buildingRows
    .filter((b) => b.key === 'market' && b.status === 'active')
    .flatMap((b) =>
      ((b.config?.slots ?? []) as { give?: string; get?: string }[])
        .filter((s) => s?.give && s?.get)
        .map((s) => ({ give: String(s.give), get: String(s.get) })),
    );
  const innateOffers = (
    (body.config?.innateOffers ?? []) as {
      sell?: string;
      want?: string;
      price?: number;
    }[]
  )
    .filter((o) => o?.sell && o?.want)
    .map((o) => ({
      sell: String(o.sell),
      want: String(o.want),
      price: Number(o.price),
    }));

  const { rows: depositRows } = await pool.query(
    `SELECT resource, initial_t, amount_t, rate_t_per_day, as_of
     FROM deposits WHERE body_id = $1 ORDER BY resource`,
    [bodyId],
  );
  const deposits = depositRows.map((d) => {
    const remaining = evalLazy(
      {
        amount: Number(d.amount_t),
        ratePerDay: Number(d.rate_t_per_day),
        asOfMs: new Date(d.as_of).getTime(),
      },
      nowMs,
      { min: 0 },
    );
    const dryMs =
      Number(d.rate_t_per_day) < -1e-9
        ? whenReaches(
            { amount: remaining, ratePerDay: Number(d.rate_t_per_day), asOfMs: nowMs },
            0,
          )
        : null;
    return {
      resource: d.resource,
      remainingT: Math.floor(remaining * 100) / 100,
      initialT: Number(d.initial_t),
      dryAt: dryMs ? new Date(dryMs).toISOString() : null,
    };
  });
  const availability = planetTechAvailability(body.seed);

  return projectPlanetIntel(tier as IntelTier, {
    id: body.id,
    bodyType: body.body_type,
    name: body.name,
    x: Number(body.x),
    y: Number(body.y),
    size: body.size,
    climate: body.climate,
    ownerId: body.owner_id,
    ownerName: body.owner_name,
    isStarter: !!body.is_starter,
    tiles: Number(body.tiles ?? 0),
    tilesUsed: buildingRows.filter((b) => b.tile_index !== null).length,
    population: Number(body.population ?? 0),
    spaceportOpen,
    marketPairs,
    innateOffers,
    buildings: buildingRows.map((b) => ({
      key: b.key,
      level: Number(b.level),
      status: b.status,
    })),
    quality: body.quality,
    deposits,
    techDna: {
      available: [...availability.available].sort(),
      maxLevel: Object.fromEntries(availability.maxLevel),
    },
  });
}
