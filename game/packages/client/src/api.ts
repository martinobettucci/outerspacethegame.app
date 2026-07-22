/** @spec All declarations and algorithms in this file implement: docs/DAT.md §2/§4/§5; docs/BACKLOG.md §P1–§P4. */
/**
 * Client API — toutes les requêtes passent par /api (proxy Vite en dev).
 * Les erreurs serveur sont typées et remontées aux écrans (états d'erreur
 * explicites, CLAUDE.md §4).
 */
import type {
  Archetype,
  BuildingKey,
  PlanetIntel,
  TechNodeKey,
} from '@atg/shared';

export interface ApiError {
  status: number;
  error: string;
  message?: string;
}

async function call<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = await res.json();
    } catch {
      /* réponse sans corps */
    }
    const err: ApiError = {
      status: res.status,
      error: payload.error ?? `http_${res.status}`,
      message: payload.message,
    };
    throw err;
  }
  return (await res.json()) as T;
}

export interface Me {
  player: { id: string; displayName: string; politics: Archetype };
  planets: { id: string; name: string }[];
}

export interface StargateView {
  id: string;
  aBodyId: string;
  bBodyId: string;
  ownerId: string;
  status: string;
  tollResource: string | null;
  tollAmount: number;
}

export interface DerelictView {
  id: string;
  x: number;
  y: number;
  name: string;
  hullCategory: string;
  hullSize: string | null;
}

export interface JunkFieldView {
  id: string;
  x: number;
  y: number;
  amountT: number;
}

export interface GalaxyBody {
  id: string;
  bodyType: 'planet' | 'star' | 'black_hole';
  name: string;
  x: number;
  y: number;
  size: 's' | 'm' | 'l' | null;
  climate: string | null;
  quality: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isStarter: boolean;
  starClass: string | null;
  starFuelType: string | null;
  /** Étoile en flare (≤ 5 % du stock initial — la seule jauge, GB §22). */
  flaring: boolean;
  /** Monde annihilé par supernova (cendre). */
  annihilated: boolean;
  /** W5 : rayon du champ climatique d'une étoile (pc), sinon null. */
  starFieldPc: number | null;
  owned: boolean;
}

export interface PlanetBuilding {
  id: string;
  key: BuildingKey;
  level: number;
  tileIndex: number | null;
  status: 'constructing' | 'active' | 'demolishing' | 'retooling';
  completesAt: string | null;
  recipe: string | null;
  workforce: number;
  runPct: number;
  effBatchesPerDay: number | null;
  workforceOptimal: number;
  workforceU: number | null;
  limiting: string | null;
  landing: 'self' | 'everyone' | null;
  dwellHours: number | null;
  reservedForSelf: number | null;
  visibility: 'public' | 'private' | null;
  marketSlots: (MarketSlotView | AmmSlotRaw | null)[] | null;
}

export interface ManualOfferView {
  id: string;
  bodyId: string;
  bodyName?: string;
  buyerId: string;
  buyerName?: string;
  shipId: string;
  getResource: string;
  getTons: number;
  giveResource: string;
  giveTons: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface PlanetDocks {
  total: { s: number; m: number; l: number };
  occupied: { s: number; m: number; l: number };
  visitors: number;
  reservedForSelf: number;
  dwellHours: number;
}

export interface MarketSlotView {
  give: string;
  get: string;
  rate: number;
  dailyLimitT: number;
  absoluteLimitT: number;
  whitelist: string[];
  rateUpdatedAtMs: number;
}

export interface AmmSlotView {
  mode: 'amm';
  slotIndex: number;
  x: string;
  y: string;
  rx: number;
  ry: number;
  spot: number;
  lpFeeBp: number;
  houseFeeBp: number;
  dailyLimitT: number;
  absoluteLimitT: number;
  whitelist: string[];
}

/** Slot AMM tel que stocké dans PlanetBuilding.marketSlots (config brute). */
export interface AmmSlotRaw {
  mode: 'amm';
  pool: { x: string; y: string; rx: number; ry: number; seededAtMs: number };
  dailyLimitT: number;
  absoluteLimitT: number;
  whitelist: string[];
}

export interface PlanetDetail {
  id: string;
  name: string;
  x: number;
  y: number;
  size: 's' | 'm' | 'l';
  climate: 'hot' | 'cold' | 'temperate' | 'poison';
  quality: string;
  tiles: number;
  isStarter: boolean;
  population: number;
  pyramid: { children: number; actives: number; seniors: number };
  clockDeadlines: Partial<Record<'water' | 'food', string>>;
  popCap: number;
  illness: number;
  demographics: {
    employedActives: number;
    employmentRate: number;
    unemploymentRate: number;
    consumingIdleShare: number;
    meanEfficiency: number;
    residentialLevel: number;
    clinicLevel: number;
    clinicReduction: number;
    effectiveIllness: number;
    localRhos: { food: number; water: number; oxygen: number | null };
    efficiencyModulator: number;
    lifeModulator: number;
    growthModulator: number;
    birthsPerDay: number;
  };
  survivalForecasts: Record<
    'water' | 'food' | 'oxygen',
    {
      family: 'water' | 'food' | 'oxygen';
      amountT: number;
      ratePerDay: number;
      dryAt: string | null;
      deathAt: string | null;
      state: 'stable' | 'projected' | 'countdown';
      instantDeath: boolean;
    } | null
  >;
  planetEfficiency: number;
  storageUsedT: number;
  storageCapT: number;
  storageU: number;
  workforceAssigned: number;
  workforceAssignable: number;
  colonizedAt: string | null;
  graceUntil: string | null;
  stock: Record<string, { amount: number; ratePerDay: number }>;
  deposits: {
    resource: string;
    remainingT: number;
    initialT: number;
    ratePerDay: number;
    dryAt: string | null;
  }[];
  buildings: PlanetBuilding[];
  docks: PlanetDocks | null;
  /** Entrepôt de véhicules (GB §9) : balances par taille, séparées. */
  vehicles: {
    capacity: { s: number; m: number; l: number };
    stored: { s: number; m: number; l: number };
  };
  triadNudge: boolean | null;
  governance: {
    required: number;
    max: number;
    governors: {
      id: string;
      role: string;
      rarity: string;
      people: string;
      archetype: string;
    }[];
    personalShipParked: boolean;
    g: number;
    fullyGoverned: boolean;
  };
  tech: {
    available: TechNodeKey[];
    maxLevel: Record<string, number>;
    unlocked: TechNodeKey[];
    maskAllowed: TechNodeKey[];
    governingArchetypes: Archetype[];
  };
}

export interface ShipView {
  id: string;
  hullCategory: string;
  hullSize: string | null;
  name: string;
  x: number;
  y: number;
  status: string;
  dockedBodyId: string | null;
  hoverBodyId: string | null;
  cargo: Record<string, number>;
  containers: number;
  settlers: number;
  settlerManifest: { children: number; actives: number; seniors: number };
  settlersPax: number;
  colonyKit: boolean;
  establishesAt: string | null;
  /** Redéploiement warehouse→quai en cours (ISO), sinon null. */
  retrievesAt: string | null;
  autoTrade: { resource: string; belowT: number; buyT: number }[];
  probeLevel: number;
  harvestRig: boolean;
  harvestingStarId: string | null;
  /** Coque (GB §27) : HP évalués, max, usure/jour (péage, plancher 1). */
  hull: { hp: number; maxHp: number; wearPerDay: number };
  shields: { hot: boolean; cold: boolean; radio: boolean };
  /** W5 : morphose d'adaptation en cours (coque immobilisée). */
  morphingShield: string | null;
  morphCompletesAt: string | null;
  /** W6 : accessoires montés et upgrades {slot: niveau}. */
  accessories: string[];
  upgrades: Record<string, number>;
  /** W9b : actifs de conversion en cours {itemKey: état}. */
  conversions: Record<
    string,
    {
      runPct: number;
      direction: string;
      processEndsAtMs?: number;
      startedAtMs: number;
      /** W9e jump_primer : boost armé jusqu'à cet instant. */
      boostUntilMs?: number;
      /** W9e cryo : réveil (10 min) en cours. */
      waking?: boolean;
    }
  >;
  installingItem: string | null;
  installCompletesAt: string | null;
  /** W8c/d : hôte suivi (amarrage ou escorte d'un Crusader). */
  followShipId: string | null;
  /** W8e : fiche de bord du Crusader (null pour les autres coques). */
  crusader: {
    stock: Record<string, number>;
    items: Record<string, number>;
    pop: { children: number; actives: number; seniors: number } | null;
  } | null;
  junkCollector: boolean;
  claimRig: boolean;
  claimingTargetId: string | null;
  claimsAt: string | null;
  /** Réservoir évalué à la lecture (mono-type v1). */
  fuel: Record<string, number>;
  fuelType: string;
  /** W2 : moteur figé au build (null : sonde/personnelle). */
  engineType: string | null;
  /** W3 : transfert ancré en cours (sonde donneuse). */
  transfer: {
    targetId: string;
    fuelType: string;
    unitsPlanned: number;
    endsAt: string | null;
  } | null;
  /** W3 : sonde ancrée à cette coque (receveur), sinon null. */
  anchoredProbeId: string | null;
  fuelRatePerDay: number;
  fuelAsOf: string | null;
  tankU: number;
  survival: { food: number; water: number; ratePerDay: number };
  crewCount: number;
  fleeArmed: boolean;
  mission: {
    originX: number;
    originY: number;
    destX: number;
    destY: number;
    destBodyId: string | null;
    departedAt: string;
    arrivesAt: string;
  } | null;
}

export const api = {
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    politics: Archetype;
  }) =>
    call<{ playerId: string; starterPlanetId: string }>(
      'POST',
      '/auth/register',
      input,
    ),
  login: (input: { email: string; password: string }) =>
    call<{ playerId: string }>('POST', '/auth/login', input),
  logout: () => call<{ ok: true }>('POST', '/auth/logout'),
  me: () => call<Me>('GET', '/me'),
  galaxy: () =>
    call<{
      bodies: GalaxyBody[];
      junkFields: JunkFieldView[];
      derelicts: DerelictView[];
      stargates: StargateView[];
    }>('GET', '/galaxy'),
  planet: (id: string) => call<PlanetDetail>('GET', `/planets/${id}`),
  unlock: (planetId: string, node: TechNodeKey) =>
    call<{ ok: true }>('POST', `/planets/${planetId}/unlock`, { node }),
  build: (
    planetId: string,
    building: BuildingKey,
    tileIndex: number | null,
    recipe: string | null,
  ) =>
    call<{ buildingId: string; completesAt: string }>(
      'POST',
      `/planets/${planetId}/build`,
      { building, tileIndex, recipe },
    ),
  levelUp: (planetId: string, buildingId: string) =>
    call<{ newLevel: number; completesAt: string }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/levelup`,
    ),
  demolish: (planetId: string, buildingId: string) =>
    call<{ refunded: Record<string, number>; completesAt: string }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/demolish`,
    ),
  fleet: () => call<{ ships: ShipView[] }>('GET', '/fleet'),
  moveShip: (shipId: string, dest: { bodyId: string } | { x: number; y: number }) =>
    call<{ arrivesAt: string; fuelBurned: number; distancePc: number }>(
      'POST',
      `/ships/${shipId}/move`,
      dest,
    ),
  /** Construit une sonde — elle reste en SURVOL du monde (2026-07-20). */
  buildProbe: (planetId: string) =>
    call<{ probeId: string }>('POST', `/planets/${planetId}/probes`),
  /** Scoop stellaire d'une sonde (plein contre 10 HP de coque). */
  scoopProbe: (shipId: string) =>
    call<{ destroyed: boolean; hp: number; fuelUnits: number }>(
      'POST',
      `/ships/${shipId}/scoop`,
    ),
  /** W6 : items d'un monde (inventaire + fabrications en cours). */
  planetItems: (planetId: string) =>
    call<{
      items: { itemKey: string; count: number }[];
      capacity: number;
      fabricating: { itemKey: string; completesAt: string }[];
    }>('GET', `/planets/${planetId}/items`),
  /** W6 : fabrique un item non-fongible (bâtiment hôte actif). */
  fabricateItem: (planetId: string, itemKey: string) =>
    call<{ completesAt: string }>('POST', `/planets/${planetId}/items`, {
      itemKey,
    }),
  /** W6 : installe un item sur une coque ENTREPOSÉE de ce monde. */
  installItem: (shipId: string, itemKey: string) =>
    call<{ completesAt: string }>('POST', `/ships/${shipId}/install`, {
      itemKey,
    }),
  /** W8c : amarrage / escorte / appareillage au Crusader. */
  dockCrusader: (shipId: string, crusaderId: string) =>
    call<{ docked: true }>('POST', `/ships/${shipId}/dock-crusader`, {
      crusaderId,
    }),
  hoverCrusader: (shipId: string, crusaderId: string) =>
    call<{ hovering: true }>('POST', `/ships/${shipId}/hover-crusader`, {
      crusaderId,
    }),
  undockCrusader: (shipId: string) =>
    call<{ status: string }>('POST', `/ships/${shipId}/undock-crusader`, {}),
  /** W8e : fabrication d'un item À BORD du Crusader (usinage d'office). */
  fabricateAboard: (crusaderId: string, itemKey: string) =>
    call<{ completesAt: string }>('POST', `/ships/${crusaderId}/fabricate`, {
      itemKey,
    }),
  /** W8e : construction d'une coque À BORD du Crusader. */
  buildShipAboard: (
    crusaderId: string,
    input: { category: string; size: string; name: string; engine?: string },
  ) =>
    call<{ completesAt: string; cost: Record<string, number>; engine: string }>(
      'POST',
      `/ships/${crusaderId}/build-ship`,
      input,
    ),
  /** W9b : règle/lance un ACTIF de conversion (pas de 5 %). */
  setConversion: (
    shipId: string,
    input: {
      itemKey: string;
      runPct: number;
      direction?: 'forward' | 'reverse';
      /** W9e : durée (h-jeu) — charge du jump_primer, stase cryo L2. */
      hours?: number;
      /** W9e kedge_winch : cible du halage. */
      target?: { x: number; y: number };
    },
  ) =>
    call<{
      state: {
        runPct: number;
        processEndsAtMs?: number;
        boostUntilMs?: number;
      } | null;
    }>('POST', `/ships/${shipId}/conversion`, input),
  /** W3 : ancre une sonde L3 et lance le transfert (règlement au bord). */
  anchorTransfer: (probeId: string, input: { toShipId: string; units: number }) =>
    call<{ endsAt: string; unitsPlanned: number; fuelType: string }>(
      'POST',
      `/ships/${probeId}/anchor-transfer`,
      input,
    ),
  /** W3 : annule un transfert ancré (règlement pro-rata). */
  anchorCancel: (probeId: string) =>
    call<{ moved: number; fuelType: string }>(
      'POST',
      `/ships/${probeId}/anchor-cancel`,
    ),
  /** Expédie la PREMIÈRE sonde disponible en survol de ce monde. */
  launchProbe: (planetId: string, dest: { x: number; y: number }) =>
    call<{ probeId: string; arrivesAt: string }>(
      'POST',
      `/planets/${planetId}/probes/send`,
      dest,
    ),
  land: (shipId: string) =>
    call<{ bodyId: string }>('POST', `/ships/${shipId}/land`),
  undock: (shipId: string) =>
    call<{ bodyId: string }>('POST', `/ships/${shipId}/undock`),
  warehouse: (shipId: string) =>
    call<{ bodyId: string; crewReleased: number }>(
      'POST',
      `/ships/${shipId}/warehouse`,
    ),
  retrieve: (shipId: string) =>
    call<{ readyAt: string }>('POST', `/ships/${shipId}/retrieve`),
  transferCargo: (
    shipId: string,
    input: { resource: string; tons: number; direction: 'load' | 'unload' },
  ) =>
    call<{ cargo: Record<string, number> }>(
      'POST',
      `/ships/${shipId}/cargo`,
      input,
    ),
  setMarketSlot: (
    planetId: string,
    buildingId: string,
    input: {
      slotIndex: number;
      give: string;
      get: string;
      rate: number;
      dailyLimitT?: number;
      absoluteLimitT?: number;
      whitelist?: string[];
    },
  ) =>
    call<{ slots: MarketSlotView[] }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/market-slot`,
      input,
    ),
  markets: (bodyId: string) =>
    call<{
      markets: {
        buildingId: string;
        level: number;
        slots: (
          | (MarketSlotView & { slotIndex: number; payableStockT: number })
          | AmmSlotView
        )[];
      }[];
    }>('GET', `/bodies/${bodyId}/markets`),
  seedAmmPool: (
    planetId: string,
    buildingId: string,
    input: {
      slotIndex: number;
      x: string;
      y: string;
      depositX: number;
      depositY: number;
      dailyLimitT?: number;
      absoluteLimitT?: number;
      whitelist?: string[];
    },
  ) =>
    call<{ slots: unknown[] }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/amm`,
      input,
    ),
  ammLiquidity: (
    planetId: string,
    buildingId: string,
    input:
      | { action: 'add'; slotIndex: number; tonsX: number }
      | { action: 'remove'; slotIndex: number; pct: number },
  ) =>
    call<{ slots: unknown[] }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/amm-liquidity`,
      input,
    ),
  setFleePolicy: (shipId: string, armed: boolean) =>
    call<{ ok: true }>('POST', `/ships/${shipId}/flee-policy`, { armed }),
  retoolBuilding: (planetId: string, buildingId: string, recipe: string) =>
    call<{ instant: boolean; completesAt: string | null }>(
      'POST',
      `/planets/${planetId}/buildings/${buildingId}/retool`,
      { recipe },
    ),
  ammRoute: (
    planetId: string,
    input: { shipId: string; give: string; get: string; giveT: number },
  ) =>
    call<{
      gotT: number;
      gotResource: string;
      midResource: string | null;
      legs: { give: string; gaveT: number; got: string; gotT: number }[];
    }>('POST', `/planets/${planetId}/amm-route`, input),
  ammTrade: (
    marketBuildingId: string,
    input: { slotIndex: number; shipId: string; give: string; giveT: number },
  ) =>
    call<{
      gaveT: number;
      gotT: number;
      gotResource: string;
      lpFeeT: number;
      houseFeeT: number;
      spotAfter: number;
    }>('POST', `/markets/${marketBuildingId}/amm-trade`, input),
  trade: (marketBuildingId: string, input: { slotIndex: number; shipId: string; giveT: number }) =>
    call<{ gaveT: number; gotT: number; gotResource: string }>(
      'POST',
      `/markets/${marketBuildingId}/trade`,
      input,
    ),
  setInnateOffers: (
    planetId: string,
    offers: { sell: string; want: string; price: number; keepFloorT: number }[],
  ) =>
    call<{ offers: unknown[] }>('POST', `/planets/${planetId}/innate-offers`, {
      offers,
    }),
  innateOffers: (bodyId: string) =>
    call<{
      offers: {
        offerIndex: number;
        sell: string;
        want: string;
        price: number;
        keepFloorT: number;
        availableT: number;
      }[];
    }>('GET', `/bodies/${bodyId}/innate-offers`),
  innateTrade: (
    bodyId: string,
    input: { offerIndex: number; shipId: string; buyT: number },
  ) =>
    call<{ boughtT: number; paidT: number; paidResource: string }>(
      'POST',
      `/bodies/${bodyId}/innate-trade`,
      input,
    ),
  buildShip: (
    planetId: string,
    input: {
      category: 'combat' | 'cargo' | 'civil';
      size: 's' | 'm' | 'l';
      name: string;
      /** W2 : moteur figé au build (défaut serveur = étoile natale). */
      engine?: 'cold' | 'hot' | 'gas';
    },
  ) =>
    call<{ completesAt: string; cost: Record<string, number>; engine: string }>(
      'POST',
      `/planets/${planetId}/ships`,
      input,
    ),
  npcs: () =>
    call<{
      npcs: {
        id: string;
        people: string;
        role: string;
        rarity: string;
        statRolls: Record<string, number>;
        boundHostType: string | null;
        boundHostId: string | null;
        accountBoundUntil: string | null;
      }[];
    }>('GET', '/npcs'),
  assignCrew: (shipId: string, npcId: string) =>
    call<{ ok: true }>('POST', `/ships/${shipId}/crew`, { npcId }),
  fitColonyKit: (shipId: string) =>
    call<{ cost: Record<string, number> }>('POST', `/ships/${shipId}/colony-kit`),
  transferSettlers: (
    shipId: string,
    input: {
      children: number;
      actives: number;
      seniors: number;
      direction: 'embark' | 'disembark';
    },
  ) =>
    call<{
      settlers: number;
      manifest: { children: number; actives: number; seniors: number };
    }>('POST', `/ships/${shipId}/settlers`, input),
  colonize: (shipId: string) =>
    call<{ completesAt: string; bodyId: string }>(
      'POST',
      `/ships/${shipId}/colonize`,
    ),
  bodyIntel: (bodyId: string) =>
    call<{ intel: PlanetIntel }>('GET', `/bodies/${bodyId}/intel`),
  podPrices: () =>
    call<{
      censusTakenAt: string;
      prices: Record<string, number>;
      eligibility: {
        eligible: boolean;
        minAccountAgeDays: number;
        eligibleAt: string;
      };
    }>(
      'GET',
      '/pods/prices',
    ),
  openPod: (input: { planetId: string; resource: string }) =>
    call<{
      npc: {
        id: string;
        people: string;
        role: string;
        rarity: string;
        statRolls: Record<string, number>;
        accountBoundUntil: string;
      };
      paid: { resource: string; tons: number };
    }>('POST', '/pods/open', input),
  latestCensus: () =>
    call<{
      perDay: number;
      census: { takenAt: string; totals: Record<string, number> } | null;
    }>('GET', '/census/latest'),
  setAutoTrade: (
    shipId: string,
    rules: { resource: string; belowT: number; buyT: number }[],
  ) => call<{ ok: boolean }>('POST', `/ships/${shipId}/auto-trade`, { rules }),
  dump: (shipId: string, resource: string, tons: number) =>
    call<{ dumped: number; sunk: boolean }>('POST', `/ships/${shipId}/dump`, {
      resource,
      tons,
    }),
  stargateProposals: () =>
    call<{
      incoming: {
        id: string;
        fromBodyId: string;
        fromBodyName: string;
        toBodyId: string;
        proposerName: string;
        createdAt: string;
      }[];
      outgoing: {
        id: string;
        fromBodyId: string;
        toBodyId: string;
        toBodyName: string;
        status: string;
      }[];
    }>('GET', '/stargate-proposals'),
  proposeStargate: (fromBodyId: string, toBodyId: string) =>
    call<{ proposalId: string }>('POST', '/stargate-proposals', {
      fromBodyId,
      toBodyId,
    }),
  respondStargateProposal: (proposalId: string, accept: boolean) =>
    call<{ gateId: string | null }>(
      'POST',
      `/stargate-proposals/${proposalId}/respond`,
      { accept },
    ),
  buildStargate: (fromBodyId: string, toBodyId: string) =>
    call<{ gateId: string; completesAt: string }>('POST', '/stargates', {
      fromBodyId,
      toBodyId,
    }),
  setStargateToll: (gateId: string, resource: string | null, amount: number) =>
    call<{ ok: boolean }>('POST', `/stargates/${gateId}/toll`, {
      resource,
      amount,
    }),
  traverse: (shipId: string, gateId: string) =>
    call<{ x: number; y: number; scatterPc: number }>(
      'POST',
      `/ships/${shipId}/traverse`,
      { gateId },
    ),
  claim: (shipId: string, targetId: string) =>
    call<{ claimsAt: string }>('POST', `/ships/${shipId}/claim`, { targetId }),
  collectJunk: (shipId: string) =>
    call<{ collected: number; fieldLeftT: number }>(
      'POST',
      `/ships/${shipId}/collect-junk`,
    ),
  fitShield: (shipId: string, kind: 'hot' | 'cold' | 'radio') =>
    call<{ cost: Record<string, number> }>('POST', `/ships/${shipId}/shield`, {
      kind,
    }),
  startHarvest: (shipId: string, starId: string) =>
    call<{ netPerDay: number; yieldPerDay: number; distancePc: number }>(
      'POST',
      `/ships/${shipId}/harvest`,
      { starId },
    ),
  stopHarvest: (shipId: string) =>
    call<{ ok: boolean }>('POST', `/ships/${shipId}/harvest/stop`),
  provision: (shipId: string) =>
    call<{
      loadedFood: number;
      loadedWater: number;
      food: number;
      water: number;
    }>('POST', `/ships/${shipId}/provision`),
  refuel: (shipId: string, units?: number) =>
    call<{ loaded: number; fuelType: string; units: number }>(
      'POST',
      `/ships/${shipId}/refuel`,
      units !== undefined ? { units } : {},
    ),
  transferFuel: (shipId: string, input: { toShipId: string; units: number }) =>
    call<{ transferred: number; fuelType: string }>(
      'POST',
      `/ships/${shipId}/transfer-fuel`,
      input,
    ),
  shipBuilds: (planetId: string) =>
    call<{
      builds: { category: string; size: string; name: string; completesAt: string }[];
    }>('GET', `/planets/${planetId}/ship-builds`),
  comms: () =>
    call<{
      incoming: { id: string; fromName: string; bodyName: string; createdAt: string }[];
      outgoing: { id: string; status: string; bodyName: string; createdAt: string }[];
      channels: { id: string; withName: string; openedAt: string }[];
    }>('GET', '/comms'),
  ping: (bodyId: string) =>
    call<{ pingId: string }>('POST', '/pings', { bodyId }),
  pingBack: (pingId: string) =>
    call<{ channelId: string }>('POST', `/pings/${pingId}/pingback`),
  messages: (channelId: string) =>
    call<{ messages: { id: string; body: string; authorName: string; mine: boolean; createdAt: string }[] }>(
      'GET',
      `/channels/${channelId}/messages`,
    ),
  postMessage: (channelId: string, body: string) =>
    call<{ ok: true }>('POST', `/channels/${channelId}/messages`, { body }),
  setBuildingSettings: (
    planetId: string,
    buildingId: string,
    settings: {
      workforce?: number;
      runPct?: number;
      landing?: 'self' | 'everyone';
      dwellHours?: number;
      reservedForSelf?: number;
      visibility?: 'public' | 'private';
    },
  ) =>
    call<{ ok: true }>(
      'PATCH',
      `/planets/${planetId}/buildings/${buildingId}`,
      settings,
    ),
  browseWarehouse: (planetId: string) =>
    call<{ public: boolean; stock: { resource: string; amountT: number }[] }>(
      'GET',
      `/planets/${planetId}/warehouse`,
    ),
  createManualOffer: (
    planetId: string,
    bundle: {
      getResource: string;
      getTons: number;
      giveResource: string;
      giveTons: number;
    },
  ) => call<ManualOfferView>('POST', `/planets/${planetId}/manual-offers`, bundle),
  planetManualOffers: (planetId: string) =>
    call<{ offers: ManualOfferView[] }>('GET', `/planets/${planetId}/manual-offers`),
  myManualOffers: () => call<{ offers: ManualOfferView[] }>('GET', '/manual-offers'),
  respondManualOffer: (offerId: string, action: 'accept' | 'decline') =>
    call<{ status: string }>('POST', `/manual-offers/${offerId}/respond`, { action }),
  cancelManualOffer: (offerId: string) =>
    call<{ ok: true }>('POST', `/manual-offers/${offerId}/cancel`),
  installGovernor: (planetId: string, npcId: string) =>
    call<PlanetDetail['governance']>('POST', `/planets/${planetId}/governors`, {
      npcId,
    }),
  previewGovernance: (planetId: string, npcIds: string[]) =>
    call<{
      archetypes: string[];
      maskAllowed: string[];
      maskLost: string[];
      g: number;
      fullyGoverned: boolean;
    }>('POST', `/planets/${planetId}/governors/preview`, { npcIds }),
};
