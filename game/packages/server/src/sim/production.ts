/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Industry”/“Efficiency engine” and §P2.pop; GAME_BOOK.md §9/§10; DESIGN_GUIDE.md §3.2-v2/§3.3/§3.3b/§3.4/§6. */
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
  jobsOptimal,
  MEDICINE_RESOURCES,
  OXYGEN_PER_1000_PER_DAY,
  POP_NEEDS_PER_1000_PER_DAY,
  RECIPES,
  REPAIR_STEEL_H_T_PER_HP,
  REPAIR_STEEL_T_PER_HP,
  storageBrake,
  TRACE_MINING_T_PER_DAY,
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
  /** Gouvernance G ; 0 est le verrou explicite d'un monde sauvage. */
  planetMultiplier: number;
  /** Population totale (fallback de compatibilité des charges démographiques). */
  population: number;
  /**
   * v2 (DG §3.2-v2 b) : têtes pondérées pour les rations de SURVIE (actifs 1×,
   * enfants/seniors 0,6×). Absent = population brute (compat v1).
   */
  weightedHeadsCount?: number;
  /**
   * v2 : têtes pondérées pour la médecine OPTIONNELLE (C 1,25×, A 1×,
   * S 1,5×). Absent = weightedHeadsCount puis population brute (compat).
   */
  medicineWeightedHeadsCount?: number;
  /** v2 : la population respire l'oxygène AU STOCK (climat hostile). */
  breathesOxygen?: boolean;
  /** Cap de stockage total (franchise + dépôts). */
  storageCapT: number;
  /** Réserves AMM (T) — physiques, comptées au cap, non dépensables. */
  pooledT?: number;
  /** Stocks matérialisés (T). */
  stocks: Partial<Record<ResourceId, number>>;
  /** Gisements matérialisés (T restants). */
  deposits: Partial<Record<ResourceId, number>>;
  industries: IndustryState[];
  /**
   * Besoins de loitering des coques du propriétaire en survol (GB §7 :
   * « drains that planet's stock ») — T/jour par fuel_x (1 u = 1 T).
   */
  hoverFuelNeeds?: Partial<Record<ResourceId, number>>;
  /**
   * Besoins de SURVIE des équipages du propriétaire en survol (GB §7,
   * DG §3.5 — 0.01 T/j/tête sur les familles food et water).
   */
  hoverSurvivalNeeds?: { food: number; water: number };
  /** Acier de RÉPARATION des coques à quai (DG §8.7) — T/jour. */
  repairSteelNeeds?: number;
}

export interface RatesResult {
  /** Débit net par ressource (T/jour) — peut être négatif. */
  stockRates: Partial<Record<ResourceId, number>>;
  /** Débit (négatif) par gisement (T/jour). */
  depositRates: Partial<Record<ResourceId, number>>;
  industries: IndustryRate[];
  /** Consommation effective ; la médecine reste hors survie/horloges. */
  popConsumption: { food: number; water: number; medicine: number; oxygen: number };
  /** Besoins théoriques (pour les saturations). */
  popNeeds: { food: number; water: number; medicine: number; oxygen: number };
  /** Drain de loitering SERVI par le stock, par fuel_x (T/jour). */
  hoverConsumption: Partial<Record<ResourceId, number>>;
  /** Survie d'équipage en survol SERVIE par le stock (T/jour). */
  hoverSurvivalConsumption: { food: number; water: number };
  /** Acier de réparation SERVI par le stock (T/jour). */
  repairSteelConsumption: number;
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
  // Les réserves AMM comptent dans le cap (DG §3.3b) : elles occupent le
  // stockage physique sans être dépensables par la production.
  const totalStock =
    Object.values(input.stocks).reduce((s, v) => s + (v ?? 0), 0) +
    (input.pooledT ?? 0);
  const storageU = input.storageCapT > 0 ? totalStock / input.storageCapT : 1;
  const brake = storageBrake(storageU);

  // 1. Potentiel de chaque industrie.
  const flows: Flow[] = [];
  for (const ind of input.industries) {
    // v2 (chunk BB) : l'optimum dérive avec la population totale
    // (DG §3.2-v2 e — le « point qui shifte »).
    const optimal = jobsOptimal(ind.key, ind.level, input.population);
    const workforceU = optimal > 0 ? ind.workforce / optimal : 0;
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
      // Minage de trace : 2 T/jour, EXEMPT d'efficacité (DG §3.3), mais
      // jamais d'activité sur un monde sauvage (planetMultiplier = 0).
      const rate = isTrace
        ? TRACE_MINING_T_PER_DAY * runFrac * brake * (input.planetMultiplier > 0 ? 1 : 0)
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

  // 2. Consommation de la population. Survie : têtes pondérées C/S ×0,6.
  //    Médecine OPTIONNELLE : pondération distincte C 1,25× / A 1× / S 1,5×.
  //    Les familles se consomment en cascade (food_1→3, med_1→3).
  const survivalPer1000 =
    (input.weightedHeadsCount ?? input.population) / 1_000;
  const medicinePer1000 =
    (input.medicineWeightedHeadsCount ??
      input.weightedHeadsCount ??
      input.population) /
    1_000;
  const popNeeds = {
    food: POP_NEEDS_PER_1000_PER_DAY.food * survivalPer1000,
    water: POP_NEEDS_PER_1000_PER_DAY.water * survivalPer1000,
    medicine: POP_NEEDS_PER_1000_PER_DAY.medicine * medicinePer1000,
    oxygen: input.breathesOxygen
      ? OXYGEN_PER_1000_PER_DAY * survivalPer1000
      : 0,
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

  // Consommations de la population : puise si stock > 0 OU arrivage suffisant.
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
    oxygen:
      popNeeds.oxygen > EMPTY ? consumeFamily(['oxygen'], popNeeds.oxygen) : 0,
  };

  // Drain de loitering des coques en survol (GB §7) : après les consommations
  // de la population, même règle « puise si stock > 0 OU arrivage ».
  const hoverConsumption: Partial<Record<ResourceId, number>> = {};
  for (const [res, need] of Object.entries(input.hoverFuelNeeds ?? {})) {
    if ((need ?? 0) <= EMPTY) continue;
    hoverConsumption[res as ResourceId] = consumeFamily(
      [res as ResourceId],
      need as number,
    );
  }
  // Survie des équipages en survol (GB §7) : APRÈS la population (priorité
  // canon), mêmes familles que la survie au sol.
  const hoverSurvivalConsumption = {
    food: consumeFamily(FOOD_RESOURCES, input.hoverSurvivalNeeds?.food ?? 0),
    water: consumeFamily(['water'], input.hoverSurvivalNeeds?.water ?? 0),
  };
  // Acier de réparation des coques à quai (DG §8.7) — même règle.
  // W9g : payable en steel LÉGER OU LOURD (léger d'abord ; le lourd
  // couvre le manque au barème dense 0,05 T/HP). La consommation est
  // NORMALISÉE en équivalent steel_l pour le tout-ou-rien de rebase.
  const repairNeedL = input.repairSteelNeeds ?? 0;
  const repairLServed = consumeFamily(['steel_l'], repairNeedL);
  const repairShortfallL = repairNeedL - repairLServed;
  const repairHServed =
    repairShortfallL > EMPTY
      ? consumeFamily(
          ['steel_h'],
          repairShortfallL * (REPAIR_STEEL_H_T_PER_HP / REPAIR_STEEL_T_PER_HP),
        )
      : 0;
  const repairSteelConsumption =
    repairLServed +
    repairHServed * (REPAIR_STEEL_T_PER_HP / REPAIR_STEEL_H_T_PER_HP);

  return {
    stockRates,
    depositRates,
    industries,
    popConsumption,
    popNeeds,
    hoverConsumption,
    hoverSurvivalConsumption,
    repairSteelConsumption,
    storageU,
  };
}

/** Seuils de recalcul du frein §3.3b (constantes par morceaux). */
export const STORAGE_EDGE_FRACTIONS = [0.7, 0.85, 1.0] as const;
