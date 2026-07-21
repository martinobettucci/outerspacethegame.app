/**
 * Intégration — §2.2b pocket luck & frontière latente (directive
 * responsable 2026-07-20) sur VRAIE base, via le VRAI flux d'inscription :
 * - multi-starter (e-mail chanceux trouvé par balayage DÉTERMINISTE du
 *   même flux que la prod — aucun endpoint de triche) : chaque extra est
 *   colonisée + dotée intégralement ;
 * - mondes bonus : distance U(800–4000) pc, INVISIBLES de tout joueur
 *   (requête directe contre la même règle de scope), ρ_eff ≥ 0,25 figé en
 *   config, gisements/ruines/stocks conformes aux rolls purs, étoile à
 *   25 % ;
 * - saturation : la sonde de visibilité injectable prouve le skip après
 *   K tentatives ;
 * - ADN effectif : ruines force-unionnées et plafonds ≥ niveau hérité,
 *   servis par le VRAI planetDetail après prise de possession.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { SeededStream, STARTER_POP, STARTER_PRE_UNLOCKED } from '@atg/shared';
import { registerPlayer, type RegisterResult } from '../../src/services/players.js';
import { demolishBuilding, planetDetail } from '../../src/services/planets.js';
import {
  isPointVisibleToAnyPlayer,
  placeBonusCandidate,
  STARTER_STOCK,
} from '../../src/gen/spawn.js';
import {
  BONUS_COUNT_MAX,
  BONUS_COUNT_MIN,
  BONUS_MAX_PC,
  BONUS_MIN_PC,
  BONUS_RHO_POCKET_FLOOR,
  bonusRhoEffFromPocket,
  pocketLuckStream,
  rollLeftoverSupply,
  rollPocketLuck,
  rollRuins,
  rollStar,
} from '../../src/gen/rolls.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
const universeSeed = `luck-universe-${run}`;
// Poivre de luck de TEST (PATCH 10-5) : injecté pour rendre le tirage
// déterministe et reproductible hors base — le même dans register ET dans le
// balayage, sinon les luck divergeraient.
const TEST_PEPPER = `test-luck-pepper-${run}`;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));

/**
 * Balayage déterministe : trouve un e-mail dont le flux de luck SECRET
 * (HMAC(TEST_PEPPER, email), le MÊME que register) donne exactement
 * `starters` planètes starter. P(2) = 1 % → ~100 candidats en moyenne.
 */
function findEmailWithLuck(starters: number): string {
  for (let i = 0; i < 200_000; i++) {
    const email = `lucky-${run}-${i}@test.local`;
    const luck = rollPocketLuck(pocketLuckStream(TEST_PEPPER, email));
    if (luck.starters === starters) return email;
  }
  throw new Error(`Aucun e-mail à ${starters} starters trouvé (balayage 200k)`);
}

let lucky: RegisterResult;
let luckyEmail: string;

beforeAll(async () => {
  pool = await createTestPool();
  luckyEmail = findEmailWithLuck(2);
  lucky = await registerPlayer(pool, {
    email: luckyEmail,
    password: 'motdepasse-solide-luck',
    displayName: 'Chanceux',
    politics: 'industrialist',
    universeSeed,
    luckPepper: TEST_PEPPER,
  });
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe('§2.2b — multi-starter (1 % → 2)', () => {
  it("l'e-mail chanceux produit exactement 2 starters possédés, colonisés, liés 45 j", async () => {
    expect(lucky.spawn.starterPlanetIds).toHaveLength(2);
    const { rows } = await pool.query(
      `SELECT id, population, pop_children, pop_seniors, colonized_at,
              account_bound_until, is_starter, x, y
       FROM bodies WHERE owner_id = $1 AND is_starter = true ORDER BY created_at`,
      [lucky.playerId],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Number(row.population)).toBe(STARTER_POP);
      expect(Number(row.pop_children)).toBeGreaterThan(0);
      expect(Number(row.pop_seniors)).toBeGreaterThan(0);
      expect(row.colonized_at).not.toBeNull();
      expect(row.account_bound_until).not.toBeNull();
    }
    // L'extra vit DANS la poche : ≤ 60 pc du primaire.
    const [primary, extra] = rows;
    expect(dist(primary!, extra!)).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('chaque starter a SA dotation complète (stock ×U(1.0–1.3) + fuel) et son savoir T0', async () => {
    for (const starterId of lucky.spawn.starterPlanetIds) {
      const { rows: stock } = await pool.query(
        `SELECT resource, amount_t FROM planet_stock WHERE body_id = $1`,
        [starterId],
      );
      const byRes = new Map(stock.map((s) => [s.resource, Number(s.amount_t)]));
      for (const [res, base] of Object.entries(STARTER_STOCK)) {
        const amount = byRes.get(res);
        expect(amount).toBeDefined();
        expect(amount!).toBeGreaterThanOrEqual(Math.round(base * 1.0));
        expect(amount!).toBeLessThanOrEqual(Math.round(base * 1.3));
      }
      // Fuel du type de l'étoile de poche.
      expect(byRes.get(`fuel_${lucky.spawn.starFuelType}`)).toBe(150);

      const { rows: unlocks } = await pool.query(
        `SELECT node_key FROM tech_unlocks WHERE body_id = $1`,
        [starterId],
      );
      expect(unlocks.map((u) => u.node_key).sort()).toEqual(
        [...STARTER_PRE_UNLOCKED].sort(),
      );

      const { rows: deposits } = await pool.query(
        `SELECT resource FROM deposits WHERE body_id = $1`,
        [starterId],
      );
      expect(deposits.length).toBeGreaterThanOrEqual(7); // garanties starter
    }
  });

  it('les vaisseaux et le pilote restent UNIQUES, dockés au primaire', async () => {
    const { rows: ships } = await pool.query(
      `SELECT hull_category, docked_body_id FROM ships WHERE owner_id = $1`,
      [lucky.playerId],
    );
    expect(ships).toHaveLength(2); // personal + cargo, pas de doublon
    for (const ship of ships) {
      expect(ship.docked_body_id).toBe(lucky.spawn.starterPlanetId);
    }
    const { rows: npcs } = await pool.query(
      `SELECT id FROM npcs WHERE owner_id = $1 AND role = 'pilot'`,
      [lucky.playerId],
    );
    expect(npcs).toHaveLength(1);
  });
});

describe('§2.2b — frontière latente (mondes bonus)', () => {
  it('compte conforme au flux dédié ; distance, invisibilité, ρ_eff figé', async () => {
    const expected = new SeededStream(
      universeSeed,
      `bonus-count:${luckyEmail}`,
    ).int(BONUS_COUNT_MIN, BONUS_COUNT_MAX);
    // Univers quasi vide : aucune tentative ne peut échouer 8 fois.
    expect(lucky.spawn.bonusPlanetIds).toHaveLength(expected);

    const client = await pool.connect();
    try {
      for (const bonusId of lucky.spawn.bonusPlanetIds) {
        const { rows } = await pool.query(
          `SELECT x, y, owner_id, is_starter, tiles, seed, config
           FROM bodies WHERE id = $1`,
          [bonusId],
        );
        const bonus = rows[0]!;
        expect(bonus.owner_id).toBeNull();
        expect(bonus.is_starter).toBe(false);
        const d = dist(bonus, lucky.spawn.pocketCenter);
        expect(d).toBeGreaterThanOrEqual(BONUS_MIN_PC - 1e-6);
        expect(d).toBeLessThanOrEqual(BONUS_MAX_PC + 1e-6);
        // Invariant d'invisibilité — requête DIRECTE contre la même règle
        // de scope que /galaxy (§10 : preuve par accès direct).
        expect(
          await isPointVisibleToAnyPlayer(client, Number(bonus.x), Number(bonus.y)),
        ).toBe(false);
        // ρ_eff figé en config : univers de test minuscule (< 50 corps
        // possédés) → repli « distance à la poche » (Round 10). ρ = fonction
        // pure de la distance au centre de la poche, ≥ plancher poche 0,25.
        const rho = (bonus.config as { bonus: { rhoEff: number } }).bonus.rhoEff;
        const dPocket = dist(bonus, lucky.spawn.pocketCenter);
        expect(rho).toBeCloseTo(bonusRhoEffFromPocket(dPocket), 10);
        expect(rho).toBeGreaterThanOrEqual(BONUS_RHO_POCKET_FLOOR);
      }
    } finally {
      client.release();
    }
  });

  it('gisements 4–8 enrichis, ruines et stocks résiduels EXACTEMENT conformes aux rolls purs', async () => {
    for (const bonusId of lucky.spawn.bonusPlanetIds) {
      const { rows } = await pool.query(
        `SELECT x, y, tiles, seed, config FROM bodies WHERE id = $1`,
        [bonusId],
      );
      const bonus = rows[0]!;
      const rho = (bonus.config as { bonus: { rhoEff: number } }).bonus.rhoEff;

      const { rows: deposits } = await pool.query(
        `SELECT resource FROM deposits WHERE body_id = $1`,
        [bonusId],
      );
      expect(deposits.length).toBeGreaterThanOrEqual(4);
      expect(deposits.length).toBeLessThanOrEqual(8);

      const expectedRuins = rollRuins(bonus.seed, rho, Number(bonus.tiles));
      const { rows: buildings } = await pool.query(
        `SELECT key, level, tile_index, status, workforce FROM buildings
         WHERE body_id = $1 ORDER BY tile_index`,
        [bonusId],
      );
      expect(
        buildings.map((b) => ({
          key: b.key,
          level: Number(b.level),
          tileIndex: Number(b.tile_index),
        })),
      ).toEqual(
        expectedRuins.map((r) => ({
          key: r.key,
          level: r.level,
          tileIndex: r.tileIndex,
        })),
      );
      for (const b of buildings) {
        expect(b.status).toBe('active');
        expect(Number(b.workforce)).toBe(0);
        expect(Number(b.tile_index)).toBeGreaterThanOrEqual(2);
      }

      const expectedSupply = rollLeftoverSupply(bonus.seed, rho).filter(
        (s) => s.amountT > 0,
      );
      const { rows: stock } = await pool.query(
        `SELECT resource, amount_t FROM planet_stock WHERE body_id = $1`,
        [bonusId],
      );
      expect(
        new Map(stock.map((s) => [s.resource, Number(s.amount_t)])),
      ).toEqual(new Map(expectedSupply.map((s) => [s.resource, s.amountT])));
    }
  });

  it("étoile propre : présence liée à ρ (P=0.25+0.5·ρ), REJOUÉE fidèlement + fuel enrichi", async () => {
    // L'univers de test est minuscule : rien n'est visible, donc on REJOUE
    // placeBonusCandidate à l'identique (même flux `bonus-place`, repli poche,
    // isVisible=false) et on confronte hasStar/position à la base — preuve de
    // bout en bout de la présence ρ-dépendante et de la géométrie.
    for (let i = 0; i < lucky.spawn.bonusPlanetIds.length; i++) {
      const bonusStar = rollStar(`${universeSeed}:bonusstar:${luckyEmail}:${i}`);
      const spot = await placeBonusCandidate(
        new SeededStream(universeSeed, `bonus-place:${luckyEmail}:${i}`),
        lucky.spawn.pocketCenter,
        async () => false,
        (x, y) => bonusRhoEffFromPocket(dist({ x, y }, lucky.spawn.pocketCenter)),
        bonusStar.rNova,
      );
      expect(spot).not.toBeNull();
      const { rows: stars } = await pool.query(
        `SELECT x, y, star_fuel_stock FROM bodies WHERE seed = $1`,
        [`${universeSeed}:bonusstar:${luckyEmail}:${i}`],
      );
      expect(stars.length).toBe(spot!.hasStar ? 1 : 0);
      if (spot!.hasStar) {
        // Géométrie de poche (R_nova+5..+30) et stock enrichi ×(1+2ρ) > base.
        const dStar = Math.hypot(
          Number(stars[0]!.x) - spot!.x,
          Number(stars[0]!.y) - spot!.y,
        );
        expect(dStar).toBeGreaterThanOrEqual(bonusStar.rNova + 5 - 1);
        expect(dStar).toBeLessThanOrEqual(bonusStar.rNova + 30 + 1);
        expect(Number(stars[0]!.star_fuel_stock)).toBeGreaterThanOrEqual(
          bonusStar.fuelStock,
        );
      }
    }
  });

  it('saturation : la sonde de visibilité toujours-vraie force le skip (null) après K tentatives', async () => {
    const richHalf = () => 0.5; // P_star = 0.5
    const saturated = await placeBonusCandidate(
      pocketLuckStream(TEST_PEPPER, 'sat'),
      { x: 500_000, y: 500_000 },
      async () => true,
      richHalf,
      40,
    );
    expect(saturated).toBeNull();

    const open = await placeBonusCandidate(
      pocketLuckStream(TEST_PEPPER, 'sat'),
      { x: 500_000, y: 500_000 },
      async () => false,
      richHalf,
      40,
    );
    expect(open).not.toBeNull();
    const d = Math.hypot(open!.x - 500_000, open!.y - 500_000);
    expect(d).toBeGreaterThanOrEqual(BONUS_MIN_PC);
    expect(d).toBeLessThanOrEqual(BONUS_MAX_PC);
    // Étoile (si tirée) : géométrie de poche R_nova+5..+30 (R_nova 40).
    if (open!.hasStar) {
      const starDist = Math.hypot(open!.starX! - open!.x, open!.starY! - open!.y);
      expect(starDist).toBeGreaterThanOrEqual(45 - 1e-6);
      expect(starDist).toBeLessThanOrEqual(70 + 1e-6);
    }
  });
});

describe("§2.2b — ADN effectif d'un monde à ruines (union servie par planetDetail)", () => {
  it('les clés des ruines sont disponibles et plafonnées ≥ leur niveau hérité', async () => {
    // Trouve un monde bonus AVEC ruines dans l'univers de ce run (les
    // seeds sont déterministes : on en fabrique tant qu'il en faut).
    let target: { id: string; seed: string; tiles: number; rho: number } | null =
      null;
    let attempts = 0;
    while (!target && attempts < 40) {
      attempts++;
      const email = `ruinscan-${run}-${attempts}@test.local`;
      const reg = await registerPlayer(pool, {
        email,
        password: 'motdepasse-solide-ruins',
        displayName: `RuinScan${attempts}`,
        politics: 'civic',
        universeSeed,
        luckPepper: TEST_PEPPER,
      });
      for (const bonusId of reg.spawn.bonusPlanetIds) {
        const { rows } = await pool.query(
          `SELECT id, seed, tiles, config FROM bodies WHERE id = $1`,
          [bonusId],
        );
        const rho = (rows[0]!.config as { bonus: { rhoEff: number } }).bonus
          .rhoEff;
        if (rollRuins(rows[0]!.seed, rho, Number(rows[0]!.tiles)).length > 0) {
          target = {
            id: rows[0]!.id,
            seed: rows[0]!.seed,
            tiles: Number(rows[0]!.tiles),
            rho,
          };
          break;
        }
      }
    }
    expect(target).not.toBeNull();

    // Prise de possession chirurgicale (harnais §15 : le flux colonisation
    // complet est déjà couvert par colonization.test) : le détail servi
    // doit unionner les ruines dans l'ADN.
    const { rows: ownerRows } = await pool.query(
      `SELECT id FROM players WHERE email LIKE $1 LIMIT 1`,
      [`ruinscan-${run}-%`],
    );
    const ownerId = ownerRows[0]!.id;
    await pool.query(
      `UPDATE bodies SET owner_id = $2, colonized_at = now(),
         population = 100, pop_children = 18, pop_seniors = 27,
         pop_as_of = now()
       WHERE id = $1`,
      [target!.id, ownerId],
    );
    const detail = await planetDetail(pool, ownerId, target!.id);
    const ruins = rollRuins(target!.seed, target!.rho, target!.tiles);
    for (const ruin of ruins) {
      expect(detail.tech.available).toContain(ruin.key);
      expect(detail.tech.maxLevel[ruin.key]).toBeGreaterThanOrEqual(ruin.level);
    }

    // PATCH 10-4 : démolir une RUINE HÉRITÉE ne rembourse RIEN (investedPaid
    // = {}), même une ruine de haut niveau — le colonisateur n'a rien payé.
    const { rows: ruinRows } = await pool.query(
      `SELECT id, key, level, config FROM buildings
       WHERE body_id = $1 ORDER BY level DESC LIMIT 1`,
      [target!.id],
    );
    expect(ruinRows[0]).toBeDefined();
    expect(ruinRows[0]!.config.investedPaid).toEqual({}); // rien payé
    const { refunded } = await demolishBuilding(
      pool,
      ownerId,
      target!.id,
      ruinRows[0]!.id,
      { timeScale: 7200 },
    );
    expect(Object.values(refunded).every((v) => !v || v === 0)).toBe(true);
  }, 120_000);
});
