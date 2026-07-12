/**
 * Cœur de production — DG §3.3/§3.3b/§3.4/§6, GB §9/§10.
 *
 * Modèle : entre deux événements, tous les débits sont CONSTANTS (lazy
 * linéaire). À chaque « rebase » (chantier fini, réglage, bord de stock,
 * gisement à sec, jour de population), on matérialise les stocks puis on
 * recalcule les débits via ce module PUR et déterministe.
 *
 * Approximations documentées (JOURNAL session 30, à revalider en tour
 * d'équilibrage) :
 * - le frein de stockage §3.3b est traité en constantes par morceaux :
 *   recalcul aux franchissements de 0.7×cap, 0.85×cap et 1.0×cap ;
 * - quand un intrant est à sec, les consommateurs se partagent l'arrivage
 *   au prorata de leur demande (point fixe itératif, ordre stable) ;
 * - la satisfaction de la population est évaluée à la matérialisation
 *   quotidienne (pas d'intégrale intra-jour).
 */
import {
  efficiency,
  FOOD_RESOURCES,
  MEDICINE_RESOURCES,
  POP_NEEDS_PER_1000_PER_DAY,
  RECIPES,
  storageBrake,
  TRACE_MINING_T_PER_DAY,
  WORKFORCE_OPTIMAL_BY_LEVEL,
  type RecipeId,
  type ResourceId,
} from '@atg/shared';

export interface IndustryState {
  buildingId: string;
  key: string;
  level: 1 | 2 | 3;
  /** 'extract:<resource>' ou un RecipeId d'industrie. */
  recipe: string;
  /** Lots/jour de base au niveau (déjà résolu depuis le catalogue). */
  baseBatchesPerDay: number;
  workforce: number;
  runPct: number; // 0..100
}

export type LimitingFactor =
  | 'ok'
  | 'understaffed'
  | 'storage_brake'
  | 'storage_full'
  | 'deposit_dry'
  | `input:${string}`;

export interface IndustryRate {
  buildingId: string;
  /** Lots/jour effectifs après tous les facteurs. */
  effBatchesPerDay: number;
  /** Utilisation workforce (pour la courbe UI). */
  workforceU: number;
  limiting: LimitingFactor;
}

export interface RatesInput {
  /** E_planet × G (gouvernance) — multiplicateur global. */
  planetMultiplier: number;
  /** Population (consommation de survie). */
  population: number;
  /** Cap de stockage total (franchise + dépôts). */
  storageCapT: number;
  /** Stocks matérialisés (T). */
  stocks: Partial<Record<ResourceId, number>>;
  /** Gisements matérialisés (T restants). */
  deposits: Partial<Record<ResourceId, number>>;
  industries: IndustryState[];
}

export interface RatesResult {
  /** Débit net par ressource (T/jour) — peut être négatif. */
  stockRates: Partial<Record<ResourceId, number>>;
  /** Débit (négatif) par gisement (T/jour). */
  depositRates: Partial<Record<ResourceId, number>>;
  industries: IndustryRate[];
  /** Consommation de survie effective (pour H au pop_daily). */
  popConsumption: { food: number; water: number; medicine: number };
  /** Besoins théoriques (pour les saturations). */
  popNeeds: { food: number; water: number; medicine: number };
  /** Utilisation du stockage total au moment du calcul. */
  storageU: number;
}

const EMPTY = 1e-9;

interface Flow {
  buildingId: string;
  inputs: Partial<Record<ResourceId, number>>; // T/jour à pleine cadence eff
  outputs: Partial<Record<ResourceId, number>>;
  fromDeposit?: ResourceId;
  potential: number; // lots/jour potentiels (avant partage d'intrants)
  workforceU: number;
  limiting: LimitingFactor;
}

/** Calcule tous les débits — fonction PURE. */
export function computeRates(input: RatesInput): RatesResult {
  const totalStock = Object.values(input.stocks).reduce(
    (s, v) => s + (v ?? 0),
    0,
  );
  const storageU = input.storageCapT > 0 ? totalStock / input.storageCapT : 1;
  const brake = storageBrake(storageU);

  // 1. Potentiel de chaque industrie.
  const flows: Flow[] = [];
  for (const ind of input.industries) {
    const optimal = WORKFORCE_OPTIMAL_BY_LEVEL[ind.level - 1]!;
    const workforceU = ind.workforce / optimal;
    const eWork = efficiency(workforceU);
    const runFrac = Math.min(100, Math.max(0, ind.runPct)) / 100;

    let limiting: LimitingFactor = 'ok';
    if (brake === 0) limiting = 'storage_full';
    else if (brake < 1) limiting = 'storage_brake';
    else if (workforceU < 0.35) limiting = 'understaffed';

    if (ind.recipe.startsWith('extract:')) {
      const resource = ind.recipe.slice('extract:'.length) as ResourceId;
      const hasDeposit = (input.deposits[resource] ?? 0) > EMPTY;
      const isTrace = !(resource in input.deposits);
      if (!hasDeposit && !isTrace) {
        // Gisement existant mais à sec : à jamais (canon GB §3).
        flows.push({
          buildingId: ind.buildingId,
          inputs: {},
          outputs: {},
          potential: 0,
          workforceU,
          limiting: 'deposit_dry',
        });
        continue;
      }
      // Minage de trace : 2 T/jour, EXEMPT d'efficacité (DG §3.3).
      const rate = isTrace
        ? TRACE_MINING_T_PER_DAY * runFrac * brake
        : ind.baseBatchesPerDay * eWork * runFrac * input.planetMultiplier * brake;
      flows.push({
        buildingId: ind.buildingId,
        inputs: {},
        outputs: { [resource]: rate },
        fromDeposit: hasDeposit ? resource : undefined,
        potential: rate,
        workforceU,
        limiting,
      });
      continue;
    }

    const recipe = RECIPES[ind.recipe as RecipeId];
    if (!recipe || recipe.extraction) {
      flows.push({
        buildingId: ind.buildingId,
        inputs: {},
        outputs: {},
        potential: 0,
        workforceU,
        limiting: 'ok',
      });
      continue;
    }
    const batches =
      ind.baseBatchesPerDay * eWork * runFrac * input.planetMultiplier * brake;
    const inputs: Partial<Record<ResourceId, number>> = {};
    const outputs: Partial<Record<ResourceId, number>> = {};
    for (const [r, q] of Object.entries(recipe.inputs)) {
      inputs[r as ResourceId] = (q as number) * batches;
    }
    for (const [r, q] of Object.entries(recipe.outputs)) {
      outputs[r as ResourceId] = (q as number) * batches;
    }
    flows.push({
      buildingId: ind.buildingId,
      inputs,
      outputs,
      potential: batches,
      workforceU,
      limiting,
    });
  }

  // 2. Consommation de survie de la population (nourriture en priorité
  //    food_1 → food_3, médecine med_1 → med_3 [TUNE]).
  const per1000 = input.population / 1_000;
  const popNeeds = {
    food: POP_NEEDS_PER_1000_PER_DAY.food * per1000,
    water: POP_NEEDS_PER_1000_PER_DAY.water * per1000,
    medicine: POP_NEEDS_PER_1000_PER_DAY.medicine * per1000,
  };

  // 3. Point fixe : partage des intrants à sec au prorata des demandes.
  const frac = new Map<string, number>(flows.map((f) => [f.buildingId, 1]));
  for (let iter = 0; iter < 8; iter++) {
    // Arrivages par ressource au facteur courant.
    const inflow: Partial<Record<ResourceId, number>> = {};
    const demand: Partial<Record<ResourceId, number>> = {};
    for (const f of flows) {
      const k = frac.get(f.buildingId)!;
      for (const [r, q] of Object.entries(f.outputs)) {
        inflow[r as ResourceId] = (inflow[r as ResourceId] ?? 0) + (q as number) * k;
      }
      for (const [r, q] of Object.entries(f.inputs)) {
        demand[r as ResourceId] = (demand[r as ResourceId] ?? 0) + (q as number);
      }
    }
    let changed = false;
    for (const f of flows) {
      let allowed = 1;
      for (const [r, q] of Object.entries(f.inputs)) {
        const res = r as ResourceId;
        if ((q as number) <= EMPTY) continue;
        if ((input.stocks[res] ?? 0) > EMPTY) continue; // stock à puiser
        const totalDemand = demand[res] ?? 0;
        const available = inflow[res] ?? 0;
        allowed = Math.min(
          allowed,
          totalDemand > EMPTY ? available / totalDemand : 0,
        );
      }
      const current = frac.get(f.buildingId)!;
      const next = Math.min(1, Math.max(0, allowed));
      if (Math.abs(next - current) > 1e-6) {
        frac.set(f.buildingId, Math.min(current, next));
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 4. Débits nets.
  const stockRates: Partial<Record<ResourceId, number>> = {};
  const depositRates: Partial<Record<ResourceId, number>> = {};
  const industries: IndustryRate[] = [];
  for (const f of flows) {
    const k = frac.get(f.buildingId)!;
    let limiting = f.limiting;
    if (k < 1 - 1e-6 && f.potential > EMPTY) {
      const starving = Object.entries(f.inputs).find(
        ([r, q]) =>
          (q as number) > EMPTY && (input.stocks[r as ResourceId] ?? 0) <= EMPTY,
      );
      if (starving) limiting = `input:${starving[0]}`;
    }
    for (const [r, q] of Object.entries(f.outputs)) {
      stockRates[r as ResourceId] =
        (stockRates[r as ResourceId] ?? 0) + (q as number) * k;
    }
    for (const [r, q] of Object.entries(f.inputs)) {
      stockRates[r as ResourceId] =
        (stockRates[r as ResourceId] ?? 0) - (q as number) * k;
    }
    if (f.fromDeposit) {
      const out = (f.outputs[f.fromDeposit] ?? 0) * k;
      depositRates[f.fromDeposit] =
        (depositRates[f.fromDeposit] ?? 0) - out;
    }
    industries.push({
      buildingId: f.buildingId,
      effBatchesPerDay: f.potential * k,
      workforceU: f.workforceU,
      limiting,
    });
  }

  // Consommation de survie : puise si stock > 0 OU arrivage suffisant.
  const consumeFamily = (
    family: readonly ResourceId[],
    needPerDay: number,
  ): number => {
    let served = 0;
    for (const res of family) {
      if (served >= needPerDay - EMPTY) break;
      const stockLeft = input.stocks[res] ?? 0;
      const inflowRate = Math.max(0, stockRates[res] ?? 0);
      if (stockLeft > EMPTY || inflowRate > EMPTY) {
        const take = Math.min(
          needPerDay - served,
          stockLeft > EMPTY ? needPerDay - served : inflowRate,
        );
        stockRates[res] = (stockRates[res] ?? 0) - take;
        served += take;
      }
    }
    return served;
  };

  const popConsumption = {
    food: consumeFamily(FOOD_RESOURCES, popNeeds.food),
    water: consumeFamily(['water'], popNeeds.water),
    medicine: consumeFamily(MEDICINE_RESOURCES, popNeeds.medicine),
  };

  return {
    stockRates,
    depositRates,
    industries,
    popConsumption,
    popNeeds,
    storageU,
  };
}

/** Seuils de recalcul du frein §3.3b (constantes par morceaux). */
export const STORAGE_EDGE_FRACTIONS = [0.7, 0.85, 1.0] as const;
