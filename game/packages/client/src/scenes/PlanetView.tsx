/**
 * Vue planète isométrique — GB §17 : grille de tuiles iso PixiJS (décision
 * P0.4), sprites 512×256 posés sur les tuiles, overlays climat, main de
 * cartes en bas. Micro-prototype fondateur du choix Pixi ; la passe de
 * lumière bump/light arrive au chunk suivant du renderer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GifSprite } from 'pixi.js/gif';
import { ArrowLeft, Users, Database, Mountain, BarChart3, Satellite, Store, FlaskConical } from 'lucide-react';
import type { BuildingKey } from '@atg/shared';
import { api, type ApiError, type PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import { ALL_RESOURCE_IDS, BUILDINGS, INNATE_TRADABLE } from '@atg/shared';
import { CardHand, type CardAction } from '../components/CardHand.tsx';
import { EfficiencyCurve } from '../components/EfficiencyCurve.tsx';
import { RecipePicker } from '../components/RecipePicker.tsx';
import { BuildingPanel } from '../components/BuildingPanel.tsx';
import { PlanetStats } from '../components/PlanetStats.tsx';
import {
  buildingClimateOverlay,
  buildingSprite,
  bumpMapOf,
  lightMapOf,
  loadGifSource,
  loadSpriteCanvas,
} from './assets.ts';
import { extractLights, makeBumpFilter, makeHaloSprite } from './lighting.ts';
import '../styles/scenes.css';

const TILE_W = 148;
const TILE_H = 74;

const CLIMATE_TILE_FILL: Record<string, number> = {
  temperate: 0x173b27,
  hot: 0x482218,
  cold: 0x16344a,
  poison: 0x2c4518,
};

const CLIMATE_TILE_EDGE: Record<string, { left: number; right: number; accent: number }> = {
  temperate: { left: 0x0a1e15, right: 0x10291a, accent: 0x57c785 },
  hot: { left: 0x24100c, right: 0x32150f, accent: 0xe86a4a },
  cold: { left: 0x0a1d2b, right: 0x10283a, accent: 0x6ec6e8 },
  poison: { left: 0x17250b, right: 0x20340e, accent: 0x9be84a },
};

const stableNoise = (value: number) => {
  const raw = Math.sin(value * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
};

function tileGridPositions(count: number): { col: number; row: number }[] {
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => ({
    col: i % cols,
    row: Math.floor(i / cols),
  }));
}

const isoX = (col: number, row: number) => ((col - row) * TILE_W) / 2;
const isoY = (col: number, row: number) => ((col + row) * TILE_H) / 2;

export function PlanetView({ planetId }: { planetId: string }) {
  const { setView } = useAppState();
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<Container | null>(null);
  const [planet, setPlanet] = useState<PlanetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<{
    building: BuildingKey;
    recipe: string | null;
  } | null>(null);
  const [recipePickerFor, setRecipePickerFor] = useState<BuildingKey | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [hospSell, setHospSell] = useState('water');
  const [hospWant, setHospWant] = useState('ore');
  const [hospPrice, setHospPrice] = useState('2');
  const [hospFloor, setHospFloor] = useState('10');
  const [hospOffers, setHospOffers] = useState<
    Awaited<ReturnType<typeof api.innateOffers>>['offers']
  >([]);
  const refreshHospitality = useCallback(() => {
    api
      .innateOffers(planetId)
      .then((r) => setHospOffers(r.offers))
      .catch(() => setHospOffers([]));
  }, [planetId]);
  useEffect(() => refreshHospitality(), [refreshHospitality]);
  const [shipBuilds, setShipBuilds] = useState<
    Awaited<ReturnType<typeof api.shipBuilds>>['builds']
  >([]);
  const refreshShipBuilds = useCallback(() => {
    api
      .shipBuilds(planetId)
      .then((r) => setShipBuilds(r.builds))
      .catch(() => setShipBuilds([]));
  }, [planetId]);
  useEffect(() => refreshShipBuilds(), [refreshShipBuilds]);
  const selectedCardRef = useRef<{ building: BuildingKey; recipe: string | null } | null>(null);
  selectedCardRef.current = selectedCard;
  const selectBuildingRef = useRef<(id: string) => void>(() => undefined);
  selectBuildingRef.current = (id: string) => setSelectedBuildingId(id);

  const refresh = useCallback(async () => {
    try {
      setPlanet(await api.planet(planetId));
      setError(null);
    } catch (err) {
      const e = err as ApiError;
      setError(e.error === 'forbidden' ? t.errors.forbidden : t.errors.generic);
    }
  }, [planetId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 4_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const placeAt = useCallback(
    async (tileIndex: number) => {
      const card = selectedCardRef.current;
      if (!card) return;
      try {
        await api.build(planetId, card.building, tileIndex, card.recipe);
        setNotice(t.planet.buildSuccess);
        setSelectedCard(null);
        await refresh();
      } catch (err) {
        const e = err as ApiError;
        setNotice(e.message ?? t.errors.generic);
      }
    },
    [planetId, refresh],
  );

  // Initialisation Pixi — après le premier chargement des données (la div
  // de montage n'existe pas pendant l'état « loading »).
  const hasData = planet !== null;
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !hasData) return;
    let destroyed = false;
    const app = new Application();
    app
      .init({
        background: '#03050a',
        resizeTo: mount,
        antialias: true,
        preference: 'webgl',
        resolution: Math.min(window.devicePixelRatio, 1.75),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        mount.appendChild(app.canvas);
        const board = new Container();
        app.stage.addChild(board);
        appRef.current = app;
        boardRef.current = board;
        setPixiReady(true);
      })
      .catch((err: unknown) => {
        // Jamais d'échec silencieux (CLAUDE.md §18).
        console.error('Échec d\'initialisation du rendu planète :', err);
        setError(t.errors.generic);
      });
    return () => {
      destroyed = true;
      setPixiReady(false);
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        boardRef.current = null;
      }
    };
  }, [hasData]);
  const [pixiReady, setPixiReady] = useState(false);

  // (Re)construit le plateau à chaque rafraîchissement de l'état planète.
  useEffect(() => {
    const app = appRef.current;
    const board = boardRef.current;
    if (!app || !board || !planet || !pixiReady) return;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    board.removeChildren().forEach((c) => c.destroy({ children: true }));

    const positions = tileGridPositions(planet.tiles);
    const byTile = new Map(
      planet.buildings
        .filter((b) => b.tileIndex !== null)
        .map((b) => [b.tileIndex as number, b]),
    );

    // Deep scenery plate. It moves with the diorama but never handles input.
    const starfield = new Graphics();
    for (let i = 0; i < 150; i++) {
      const x = -760 + stableNoise(i + planet.tiles * 13) * 1520;
      const y = -430 + stableNoise(i * 3.7 + planet.population) * 860;
      const radius = 0.35 + stableNoise(i * 8.1) * 1.2;
      const color = i % 11 === 0 ? 0x8c6ac8 : i % 7 === 0 ? 0x6ec6e8 : 0xb9c8e5;
      starfield.circle(x, y, radius);
      starfield.fill({ color, alpha: 0.18 + stableNoise(i * 5.3) * 0.48 });
    }
    board.addChild(starfield);

    const edge =
      CLIMATE_TILE_EDGE[planet.climate] ?? CLIMATE_TILE_EDGE.temperate!;
    const aura = new Graphics();
    aura.ellipse(0, 74, 410, 188);
    aura.fill({ color: 0x2a1b52, alpha: 0.16 });
    aura.ellipse(0, 68, 350, 150);
    aura.fill({ color: edge.accent, alpha: 0.055 });
    aura.ellipse(0, 96, 320, 94);
    aura.fill({ color: 0x000000, alpha: 0.46 });
    board.addChild(aura);

    const motes: {
      graphic: Graphics;
      phase: number;
      speed: number;
      baseX: number;
      baseY: number;
    }[] = [];
    for (let i = 0; i < 26; i++) {
      const mote = new Graphics();
      const radius = 0.6 + stableNoise(i * 4.4) * 1.35;
      mote.circle(0, 0, radius);
      mote.fill({ color: edge.accent, alpha: 0.24 + stableNoise(i * 9.1) * 0.3 });
      const baseX = -390 + stableNoise(i * 6.7) * 780;
      const baseY = -155 + stableNoise(i * 2.9) * 360;
      mote.position.set(baseX, baseY);
      board.addChild(mote);
      motes.push({
        graphic: mote,
        phase: stableNoise(i * 1.7) * Math.PI * 2,
        speed: 0.18 + stableNoise(i * 7.3) * 0.24,
        baseX,
        baseY,
      });
    }

    const fill = CLIMATE_TILE_FILL[planet.climate] ?? CLIMATE_TILE_FILL.temperate!;
    const extrusion = 12;

    // Couche de lumière ADDITIVE (propagation aux tuiles et sprites
    // voisins — ASSET_PIPELINE §3), au-dessus du plateau.
    const lightLayer = new Container();

    positions.forEach(({ col, row }, index) => {
      const x = isoX(col, row);
      const y = isoY(col, row);

      // Apparent depth only: the interactive top diamond and its 148×74
      // geometry stay exactly unchanged for pointer and E2E contracts.
      const cliff = new Graphics();
      cliff.poly([
        -TILE_W / 2, 0,
        0, TILE_H / 2,
        0, TILE_H / 2 + extrusion,
        -TILE_W / 2, extrusion,
      ]);
      cliff.fill({ color: edge.left });
      cliff.poly([
        TILE_W / 2, 0,
        0, TILE_H / 2,
        0, TILE_H / 2 + extrusion,
        TILE_W / 2, extrusion,
      ]);
      cliff.fill({ color: edge.right });
      cliff.stroke({ color: 0x101a2b, width: 1, alpha: 0.82 });
      cliff.position.set(x, y);
      board.addChild(cliff);

      const tile = new Graphics();
      tile.poly([
        0, -TILE_H / 2,
        TILE_W / 2, 0,
        0, TILE_H / 2,
        -TILE_W / 2, 0,
      ]);
      tile.fill({ color: fill });
      tile.stroke({ color: edge.accent, width: 1.1, alpha: 0.32 });
      tile.position.set(x, y);
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointertap', () => {
        const existing = byTile.get(index);
        if (selectedCardRef.current && !existing) void placeAt(index);
        else if (existing) selectBuildingRef.current(existing.id);
      });
      tile.on('pointerover', () => {
        tile.tint = selectedCardRef.current && !byTile.has(index) ? 0xd9cf4a : 0x9db4e8;
      });
      tile.on('pointerout', () => {
        tile.tint = 0xffffff;
      });
      board.addChild(tile);

      // Low-frequency surface variation keeps empty tiles from looking like
      // flat UI diamonds. It is deliberately subtle so props own the scene.
      const surface = new Graphics();
      for (let detailIndex = 0; detailIndex < 7; detailIndex++) {
        const dx = -42 + stableNoise(index * 31 + detailIndex * 5.2) * 84;
        const dy = -17 + stableNoise(index * 17 + detailIndex * 8.4) * 34;
        const r = 0.8 + stableNoise(index * 7 + detailIndex * 11.3) * 2.1;
        surface.circle(dx, dy, r);
        surface.fill({
          color: detailIndex % 3 === 0 ? edge.accent : 0x02050a,
          alpha: detailIndex % 3 === 0 ? 0.07 : 0.12,
        });
      }
      surface.position.set(x, y);
      surface.eventMode = 'none';
      board.addChild(surface);

      const building = byTile.get(index);
      if (building) {
        const container = new Container();
        container.position.set(x, y);
        board.addChild(container);
        const contact = new Graphics();
        contact.ellipse(0, 11, TILE_W * 0.34, TILE_H * 0.22);
        contact.fill({ color: 0x000000, alpha: 0.5 });
        contact.ellipse(0, 6, TILE_W * 0.27, TILE_H * 0.16);
        contact.stroke({ color: edge.accent, width: 1, alpha: 0.18 });
        container.addChild(contact);
        const spritePath = buildingSprite(building.key, building.level);
        // Sprite ANIMÉ (pixi.js/gif) — l'idle fait partie de l'identité
        // (ASSET_PIPELINE §1bis).
        void loadGifSource(spritePath)
          .then(async (source) => {
            const sprite = new GifSprite({ source, autoPlay: !reduceMotion });
            sprite.anchor.set(0.5, 0.72);
            sprite.width = TILE_W * 1.06;
            sprite.height = (TILE_W * 1.06) / 2;
            sprite.alpha = building.status === 'constructing' ? 0.55 : 1;
            container.addChild(sprite);

            // Passe de lumière : bump (relief) + light map (sources).
            try {
              const [bumpCanvas, lightCanvas] = await Promise.all([
                loadSpriteCanvas(bumpMapOf(spritePath)),
                loadSpriteCanvas(lightMapOf(spritePath)),
              ]);
              const lights = extractLights(lightCanvas);
              sprite.filters = [
                makeBumpFilter(Texture.from(bumpCanvas), lights),
              ];
              for (const light of lights) {
                const halo = makeHaloSprite(light, TILE_W * 0.55);
                halo.position.set(
                  x + (light.u - 0.5) * sprite.width,
                  y + (light.v - 0.72) * sprite.height,
                );
                if (building.status !== 'constructing') {
                  lightLayer.addChild(halo);
                }
              }
            } catch {
              // Companions absents : sprite rendu sans passe de lumière —
              // jamais bloquant (contrat de swap).
            }

            if (planet.climate === 'hot' || planet.climate === 'cold') {
              void loadSpriteCanvas(
                buildingClimateOverlay(building.key, building.level, planet.climate),
              )
                .then((ov) => {
                  const overlay = new Sprite(Texture.from(ov));
                  overlay.anchor.set(0.5, 0.72);
                  overlay.width = sprite.width;
                  overlay.height = sprite.height;
                  overlay.alpha = sprite.alpha;
                  container.addChild(overlay);
                })
                .catch(() => undefined); // overlay optionnel
            }
            if (building.status === 'constructing') {
              const ring = new Graphics();
              ring.ellipse(0, 8, TILE_W * 0.4, TILE_H * 0.4);
              ring.stroke({ color: 0xd9cf4a, width: 2, alpha: 0.9 });
              container.addChild(ring);
            }
          })
          .catch((err: unknown) => {
            console.error('Sprite bâtiment introuvable :', spritePath, err);
          });
      }
    });

    // La lumière par-dessus tout (propagation additive).
    board.addChild(lightLayer);

    // Centre le plateau.
    const cols = Math.ceil(Math.sqrt(planet.tiles));
    const centerX = isoX(cols - 1, 0) / 2 + isoX(0, Math.ceil(planet.tiles / cols) - 1) / 2;
    const centerY = isoY(cols - 1, Math.ceil(planet.tiles / cols) - 1) / 2;
    board.position.set(
      app.screen.width / 2 - centerX,
      app.screen.height / 2 - centerY - 20,
    );

    let ambientTime = 0;
    const animateMotes = () => {
      ambientTime += app.ticker.deltaTime / 60;
      motes.forEach((mote, index) => {
        const wave = ambientTime * mote.speed + mote.phase;
        mote.graphic.position.set(
          mote.baseX + Math.sin(wave * 0.7) * (3 + (index % 4)),
          mote.baseY - ((ambientTime * (1.2 + (index % 3) * 0.35)) % 28),
        );
        mote.graphic.alpha = 0.5 + Math.sin(wave) * 0.22;
      });
    };
    if (!reduceMotion) {
      app.ticker.add(animateMotes);
    }
    return () => {
      // The renderer-owning effect is declared before this scenery effect,
      // so unmount may already have destroyed Pixi's ticker. Only detach the
      // callback while this is still the live application; renderer teardown
      // disposes every listener itself.
      if (!reduceMotion && appRef.current === app) {
        app.ticker.remove(animateMotes);
      }
    };
  }, [planet, pixiReady, placeAt]);

  if (error) {
    return (
      <div role="alert" className="scene-state scene-state--error">
        {error}
      </div>
    );
  }
  if (!planet) {
    return (
      <div className="scene-state">
        {t.status.loading}
      </div>
    );
  }

  const usedTiles = planet.buildings.filter((b) => b.tileIndex !== null).length;
  const keyboardPositions = tileGridPositions(planet.tiles);
  const keyboardCols = Math.ceil(Math.sqrt(planet.tiles));
  const keyboardRows = Math.ceil(planet.tiles / keyboardCols);
  const keyboardCenterX =
    isoX(keyboardCols - 1, 0) / 2 + isoX(0, keyboardRows - 1) / 2;
  const keyboardCenterY = isoY(keyboardCols - 1, keyboardRows - 1) / 2;
  const keyboardBuildings = new Map(
    planet.buildings
      .filter((building) => building.tileIndex !== null)
      .map((building) => [building.tileIndex as number, building]),
  );

  return (
    <div className="planet-scene" data-climate={planet.climate}>
      <div className="planet-stage">
        <div ref={mountRef} className="planet-canvas" data-testid="planet-canvas" />
        <div
          className="planet-tile-keyboard-layer"
          role="group"
          aria-label="Planet surface tiles"
        >
          {keyboardPositions.map(({ col, row }, index) => {
            const building = keyboardBuildings.get(index);
            if (!building && !selectedCard) return null;
            const label = building
              ? `Tile ${index + 1} — ${building.key.replace(/_/g, ' ')} L${building.level}`
              : `Tile ${index + 1} — build ${selectedCard!.building.replace(/_/g, ' ')}`;
            return (
              <button
                key={index}
                type="button"
                className="planet-tile-keyboard-target"
                data-occupied={building ? 'true' : 'false'}
                aria-label={label}
                title={label}
                style={{
                  left: `calc(50% + ${isoX(col, row) - keyboardCenterX}px)`,
                  top: `calc(50% + ${isoY(col, row) - keyboardCenterY - 20}px)`,
                }}
                onClick={() => {
                  if (building) setSelectedBuildingId(building.id);
                  else void placeAt(index);
                }}
              >
                <span aria-hidden="true">{index + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Bandeau d'en-tête planète */}
        <header className="planet-plaque">
          <button
            type="button"
            onClick={() => setView({ kind: 'galaxy' })}
            aria-label={t.planet.backToGalaxy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              color: 'var(--primary-300)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <ArrowLeft size={14} aria-hidden /> {t.planet.backToGalaxy}
          </button>
          <h2 style={{ fontSize: 16 }}>{planet.name}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {planet.size.toUpperCase()} · {planet.climate} · {planet.quality} ·{' '}
            {planet.tiles - usedTiles} {t.planet.tilesFree}
          </span>
          {planet.graceUntil && (
            <span
              title={t.planet.graceHint}
              style={{
                background: 'var(--violet-700)',
                color: 'var(--accent-200)',
                borderRadius: 'var(--radius-chip)',
                padding: '2px 10px',
                fontSize: 11,
              }}
            >
              {t.planet.graceBadge}{' '}
              {new Date(planet.graceUntil).toLocaleDateString('en-US')}
            </span>
          )}
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--stroke-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <BarChart3 size={13} aria-hidden /> {t.planet.statsPage}
          </button>
        </header>

        {selectedCard && (
          <p className="planet-placement-hint">
            {t.planet.selectCardHint}
          </p>
        )}
        {notice && (
          <p role="status" className="planet-notice">
            {notice}
          </p>
        )}

        {selectedBuildingId &&
          (() => {
            const b = planet.buildings.find((x) => x.id === selectedBuildingId);
            if (!b) return null;
            return (
              <BuildingPanel
                building={b}
                workforceAssignable={planet.workforceAssignable}
                workforceAssigned={planet.workforceAssigned}
                maxLevelBySeed={planet.tech.maxLevel[b.key] ?? 3}
                onClose={() => setSelectedBuildingId(null)}
                onApply={async (settings) => {
                  try {
                    await api.setBuildingSettings(planetId, b.id, settings);
                    setNotice(t.planet.settingsSaved);
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
                onSaveMarketSlot={async (input) => {
                  try {
                    await api.setMarketSlot(planetId, b.id, input);
                    setNotice(t.planet.marketSlotSaved);
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
                shipBuilds={shipBuilds}
                onBuildShip={async (input) => {
                  try {
                    await api.buildShip(planetId, input);
                    setNotice(t.planet.yardStarted);
                    refreshShipBuilds();
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
                onLevelUp={async () => {
                  try {
                    await api.levelUp(planetId, b.id);
                    setNotice(t.planet.levelUpStarted);
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
                onDemolish={async () => {
                  try {
                    await api.demolish(planetId, b.id);
                    setNotice(t.planet.demolishStarted);
                    setSelectedBuildingId(null);
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
              />
            );
          })()}

        {/* Panneau stats (droite) */}
        <aside className="planet-inspector">
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <Users size={14} color="var(--primary-300)" aria-hidden />
              {t.planet.population} :{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {Math.round(planet.population).toLocaleString('en-US')} /{' '}
                {planet.popCap.toLocaleString('en-US')}
              </strong>
            </span>
            <EfficiencyCurve
              u={planet.population / planet.popCap}
              label={t.planet.efficiency}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <Database size={14} color="var(--primary-300)" aria-hidden />
              {t.planet.storage} :{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {Math.round(planet.storageUsedT)} / {planet.storageCapT} T
              </strong>
            </span>
            <div
              role="progressbar"
              aria-valuenow={Math.round((planet.storageUsedT / planet.storageCapT) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 8,
                borderRadius: 4,
                background: 'var(--bg-overlay)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (planet.storageUsedT / planet.storageCapT) * 100)}%`,
                  height: '100%',
                  background:
                    planet.storageUsedT / planet.storageCapT > 0.7
                      ? 'var(--warning-500)'
                      : 'var(--success-500)',
                }}
              />
            </div>
            <table style={{ fontSize: 12, borderSpacing: 0 }}>
              <caption
                style={{
                  textAlign: 'left',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  paddingBottom: 4,
                }}
              >
                {t.planet.stock}
              </caption>
              <tbody>
                {Object.entries(planet.stock)
                  .filter(([, v]) => v.amount > 0.5 || Math.abs(v.ratePerDay) > 0.01)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([res, v]) => (
                    <tr key={res}>
                      <td style={{ color: 'var(--text-secondary)', paddingRight: 10 }}>
                        {res.replace('_', ' ')}
                      </td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          textAlign: 'right',
                          color: res === 'fuel_cells' ? 'var(--accent-200)' : undefined,
                        }}
                      >
                        {v.amount.toFixed(0)} T
                      </td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          textAlign: 'right',
                          paddingLeft: 8,
                          color:
                            v.ratePerDay > 0.01
                              ? 'var(--success-500)'
                              : v.ratePerDay < -0.01
                                ? 'var(--danger-500)'
                                : 'var(--text-disabled)',
                        }}
                      >
                        {v.ratePerDay > 0 ? '+' : ''}
                        {v.ratePerDay.toFixed(1)}
                        {t.planet.perDay}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <Mountain size={14} color="var(--primary-300)" aria-hidden />
              {t.planet.deposits}
            </span>
            <table style={{ fontSize: 12, borderSpacing: 0 }}>
              <tbody>
                {planet.deposits.map((d) => (
                  <tr key={d.resource}>
                    <td style={{ color: 'var(--text-secondary)', paddingRight: 10 }}>
                      {d.resource.replace('_', ' ')}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                      {Math.round(d.remainingT).toLocaleString('en-US')} T
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        paddingLeft: 8,
                        fontSize: 10,
                        color: d.dryAt ? 'var(--warning-500)' : 'var(--text-disabled)',
                      }}
                    >
                      {d.dryAt
                        ? `${t.planet.dryOn} ${new Date(d.dryAt).toLocaleDateString('en-US')}`
                        : d.ratePerDay < 0
                          ? `${d.ratePerDay}${t.planet.perDay}`
                          : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Infrastructure sans tuile (télescopes, probe pads) : invisible
              sur le plateau iso, donc listée ici — sinon rien n'atteste de
              son existence à l'écran. */}
          <section
            aria-label={t.planet.infrastructure}
            style={{ display: 'grid', gap: 4 }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <Satellite size={14} color="var(--primary-300)" aria-hidden />
              {t.planet.infrastructure}
            </span>
            {planet.buildings.filter((b) => b.tileIndex === null).length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                {t.planet.infrastructureNone}
              </span>
            ) : (
              planet.buildings
                .filter((b) => b.tileIndex === null)
                .map((b) => (
                  <span
                    key={b.id}
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {b.key.replace(/_/g, ' ')} L{b.level} —{' '}
                    <span
                      style={{
                        color:
                          b.status === 'active'
                            ? 'var(--success-500)'
                            : 'var(--warning-500)',
                      }}
                    >
                      {b.status}
                    </span>
                    {b.status === 'active' && b.level < 3 && (
                      <button
                        type="button"
                        aria-label={`${t.planet.levelUp} ${b.key}`}
                        onClick={async () => {
                          try {
                            await api.levelUp(planetId, b.id);
                            setNotice(t.planet.levelUpStarted);
                            await refresh();
                          } catch (err) {
                            setNotice((err as ApiError).message ?? t.errors.generic);
                          }
                        }}
                        style={{
                          background: 'var(--violet-700)',
                          color: 'var(--accent-200)',
                          border: 'none',
                          borderRadius: 'var(--radius-chip)',
                          padding: '1px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {t.planet.levelUp} → L{b.level + 1}
                      </button>
                    )}
                  </span>
                ))
            )}
          </section>

          {/* Programmes (GB §19) : des SAVOIRS par planète, pas des
              bâtiments — colony_program déverrouille le fitting colonie. */}
          <section
            aria-label={t.planet.programs}
            style={{ display: 'grid', gap: 4 }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <FlaskConical size={14} color="var(--primary-300)" aria-hidden />
              {t.planet.programs}
            </span>
            {planet.tech.unlocked.includes('colony_program') ? (
              <span style={{ fontSize: 12, color: 'var(--success-500)' }}>
                {t.planet.programColony} — {t.planet.programUnlocked}
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.unlock(planetId, 'colony_program');
                    setNotice(t.planet.unlockSuccess);
                    await refresh();
                  } catch (err) {
                    setNotice((err as ApiError).message ?? t.errors.generic);
                  }
                }}
                style={{
                  justifySelf: 'start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--violet-500)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {t.planet.unlockFirst} {t.planet.programColony}
              </button>
            )}
          </section>

          {/* Hospitalité (GB §9) : visible seulement sous gouvernance TOUTE
              mercantile — l'UI est une aide, le serveur re-vérifie. */}
          {planet.tech.governingArchetypes.length > 0 &&
            planet.tech.governingArchetypes.every((a) => a === 'mercantile') && (
              <section
                aria-label={t.planet.hospitality}
                style={{ display: 'grid', gap: 6, fontSize: 12 }}
              >
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <Store size={14} color="var(--accent-400)" aria-hidden />
                  {t.planet.hospitality}
                </span>
                <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>
                  {t.planet.hospitalityHint}
                </span>
                {hospOffers.length === 0 ? (
                  <span style={{ color: 'var(--text-disabled)' }}>
                    {t.planet.hospitalityNone}
                  </span>
                ) : (
                  hospOffers.map((o) => (
                    <span key={o.offerIndex} style={{ fontFamily: 'var(--font-mono)' }}>
                      {o.sell.replace('_', ' ')} @ {o.price} {o.want.replace('_', ' ')}/T
                      {' · '}floor {o.keepFloorT} T · {o.availableT} T{' '}
                      {t.galaxy.hospitalityAvailable}
                    </span>
                  ))
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{t.planet.hospitalitySells}</span>
                  <select
                    aria-label={t.planet.hospitalitySells}
                    value={hospSell}
                    onChange={(e) => setHospSell(e.target.value)}
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--stroke-subtle)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--text-primary)',
                      padding: '4px 6px',
                    }}
                  >
                    {INNATE_TRADABLE.map((r) => (
                      <option key={r} value={r}>
                        {r.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <span>{t.planet.hospitalityFor}</span>
                  <select
                    aria-label={t.planet.hospitalityFor}
                    value={hospWant}
                    onChange={(e) => setHospWant(e.target.value)}
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--stroke-subtle)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--text-primary)',
                      padding: '4px 6px',
                    }}
                  >
                    {ALL_RESOURCE_IDS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'grid', gap: 3 }}>
                  <span>{t.planet.hospitalityPrice}</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={hospPrice}
                    onChange={(e) => setHospPrice(e.target.value)}
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--stroke-subtle)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--text-primary)',
                      padding: '4px 8px',
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 3 }}>
                  <span>{t.planet.hospitalityFloor}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={hospFloor}
                    onChange={(e) => setHospFloor(e.target.value)}
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--stroke-subtle)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--text-primary)',
                      padding: '4px 8px',
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.setInnateOffers(planetId, [
                        {
                          sell: hospSell,
                          want: hospWant,
                          price: Number(hospPrice),
                          keepFloorT: Number(hospFloor),
                        },
                      ]);
                      setNotice(t.planet.hospitalityPublished);
                      refreshHospitality();
                    } catch (err) {
                      setNotice((err as ApiError).message ?? t.errors.generic);
                    }
                  }}
                  style={{
                    background: 'var(--accent-400)',
                    color: '#0D0D0D',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t.planet.hospitalityPublish}
                </button>
              </section>
            )}
        </aside>
      </div>

      <CardHand
        planet={planet}
        selectedCard={selectedCard?.building ?? null}
        onAction={async (action: CardAction) => {
          if (action.kind === 'unlock') {
            try {
              await api.unlock(planetId, action.node);
              setNotice(t.planet.unlockSuccess);
              await refresh();
            } catch (err) {
              setNotice((err as ApiError).message ?? t.errors.generic);
            }
          } else if (selectedCard?.building === action.building) {
            setSelectedCard(null);
          } else if (BUILDINGS[action.building].batchesPerDayByLevel) {
            // Une industrie mint exactement une chose : recette d'abord.
            setRecipePickerFor(action.building);
          } else if (!BUILDINGS[action.building].usesTile) {
            // Infrastructure sans tuile : construction immédiate, pas de
            // sélection de tuile (le serveur refuse un tileIndex ici).
            try {
              await api.build(planetId, action.building, null, null);
              setNotice(t.planet.buildSuccess);
              await refresh();
            } catch (err) {
              setNotice((err as ApiError).message ?? t.errors.generic);
            }
          } else {
            setSelectedCard({ building: action.building, recipe: null });
          }
        }}
      />
      {statsOpen && (
        <PlanetStats planet={planet} onClose={() => setStatsOpen(false)} />
      )}
      {recipePickerFor && (
        <RecipePicker
          planet={planet}
          building={recipePickerFor}
          onPick={(recipe) => {
            setSelectedCard({ building: recipePickerFor, recipe });
            setRecipePickerFor(null);
          }}
          onCancel={() => setRecipePickerFor(null)}
        />
      )}
    </div>
  );
}
