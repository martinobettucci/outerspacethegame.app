/**
 * Client API — toutes les requêtes passent par /api (proxy Vite en dev).
 * Les erreurs serveur sont typées et remontées aux écrans (états d'erreur
 * explicites, CLAUDE.md §4).
 */
import type {
  Archetype,
  BuildingKey,
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
  owned: boolean;
}

export interface PlanetBuilding {
  id: string;
  key: BuildingKey;
  level: number;
  tileIndex: number | null;
  status: 'constructing' | 'active' | 'demolishing';
  completesAt: string | null;
  recipe: string | null;
  workforce: number;
  runPct: number;
  effBatchesPerDay: number | null;
  workforceU: number | null;
  limiting: string | null;
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
  popCap: number;
  illness: number;
  planetEfficiency: number;
  storageUsedT: number;
  storageCapT: number;
  storageU: number;
  workforceAssigned: number;
  workforceAssignable: number;
  stock: Record<string, { amount: number; ratePerDay: number }>;
  deposits: {
    resource: string;
    remainingT: number;
    initialT: number;
    ratePerDay: number;
    dryAt: string | null;
  }[];
  buildings: PlanetBuilding[];
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
  fuel: Record<string, number>;
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
  galaxy: () => call<{ bodies: GalaxyBody[] }>('GET', '/galaxy'),
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
  launchProbe: (planetId: string, dest: { x: number; y: number }) =>
    call<{ probeId: string; arrivesAt: string }>(
      'POST',
      `/planets/${planetId}/probes`,
      dest,
    ),
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
    settings: { workforce?: number; runPct?: number },
  ) =>
    call<{ ok: true }>(
      'PATCH',
      `/planets/${planetId}/buildings/${buildingId}`,
      settings,
    ),
};
