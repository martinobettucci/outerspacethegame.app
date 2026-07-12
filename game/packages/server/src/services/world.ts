/**
 * Visibilité & brouillard de guerre — GAMEBOOK §4.
 * Scope = union des cercles par planète possédée :
 * rayon = BASE_SKY_PC + Σ(200 pc × niveau) des télescopes actifs du monde.
 * BASE_SKY_PC = 60 pc [TUNE-GAP : « ciel local » non chiffré par le guide —
 * permet de voir sa propre poche (étoile 40 pc, sauvages ≤ 60 pc) sans
 * télescope ; le voisin garanti (150–240 pc) exige un télescope].
 */
import type pg from 'pg';

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
}

/**
 * Corps visibles par un joueur. Les champs cachés (stock d'étoile…) ne
 * sortent JAMAIS d'ici ; le niveau de détail intel (L1/L2/L3) viendra en P3.
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
      WHERE s.owner_id = $1 AND s.status IN ('hovering', 'idle', 'docked')
    )
    SELECT DISTINCT ON (b.id)
           b.id, b.body_type, b.name, b.x, b.y, b.size, b.climate, b.quality,
           b.owner_id, p.display_name AS owner_name, b.is_starter,
           b.star_class, b.star_fuel_type
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
    quality: r.quality,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    isStarter: r.is_starter,
    starClass: r.star_class,
    starFuelType: r.star_fuel_type,
    owned: r.owner_id === playerId,
  }));
}
