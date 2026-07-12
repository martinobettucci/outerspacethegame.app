/**
 * Vue planète isométrique — GB §17 : grille de tuiles iso PixiJS (décision
 * P0.4), sprites 512×256 posés sur les tuiles, overlays climat, main de
 * cartes en bas. Micro-prototype fondateur du choix Pixi ; la passe de
 * lumière bump/light arrive au chunk suivant du renderer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ArrowLeft, Users, Database, Mountain } from 'lucide-react';
import type { BuildingKey } from '@atg/shared';
import { api, type ApiError, type PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import { CardHand, type CardAction } from '../components/CardHand.tsx';
import { EfficiencyCurve } from '../components/EfficiencyCurve.tsx';
import {
  buildingClimateOverlay,
  buildingSprite,
  loadSpriteCanvas,
} from './assets.ts';

const TILE_W = 148;
const TILE_H = 74;

const CLIMATE_TILE_FILL: Record<string, number> = {
  temperate: 0x14351f,
  hot: 0x3a1a12,
  cold: 0x12283a,
  poison: 0x243a12,
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
  const [selectedCard, setSelectedCard] = useState<BuildingKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedCardRef = useRef<BuildingKey | null>(null);
  selectedCardRef.current = selectedCard;

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
        await api.build(planetId, card, tileIndex);
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
        background: '#060810',
        resizeTo: mount,
        antialias: true,
        preference: 'webgl',
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

    board.removeChildren().forEach((c) => c.destroy({ children: true }));

    const positions = tileGridPositions(planet.tiles);
    const byTile = new Map(
      planet.buildings
        .filter((b) => b.tileIndex !== null)
        .map((b) => [b.tileIndex as number, b]),
    );

    // Halo d'ambiance sous l'île (profondeur violette du design system).
    const halo = new Graphics();
    halo.ellipse(0, (isoY(positions.length, positions.length) / positions.length) * 1.2, 340, 150);
    halo.fill({ color: 0x2a1b52, alpha: 0.35 });
    board.addChild(halo);

    const fill = CLIMATE_TILE_FILL[planet.climate] ?? CLIMATE_TILE_FILL.temperate!;

    positions.forEach(({ col, row }, index) => {
      const x = isoX(col, row);
      const y = isoY(col, row);
      const tile = new Graphics();
      tile.poly([
        0, -TILE_H / 2,
        TILE_W / 2, 0,
        0, TILE_H / 2,
        -TILE_W / 2, 0,
      ]);
      tile.fill({ color: fill });
      tile.stroke({ color: 0x24314f, width: 1.5 });
      tile.position.set(x, y);
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointertap', () => {
        if (selectedCardRef.current && !byTile.has(index)) void placeAt(index);
      });
      tile.on('pointerover', () => {
        tile.tint = selectedCardRef.current && !byTile.has(index) ? 0xd9cf4a : 0x9db4e8;
      });
      tile.on('pointerout', () => {
        tile.tint = 0xffffff;
      });
      board.addChild(tile);

      const building = byTile.get(index);
      if (building) {
        const container = new Container();
        container.position.set(x, y);
        board.addChild(container);
        void loadSpriteCanvas(buildingSprite(building.key, building.level)).then(
          (canvas) => {
            const sprite = new Sprite(Texture.from(canvas));
            sprite.anchor.set(0.5, 0.72);
            sprite.width = TILE_W * 1.06;
            sprite.height = (TILE_W * 1.06) / 2;
            sprite.alpha = building.status === 'constructing' ? 0.55 : 1;
            container.addChild(sprite);
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
          },
        );
      }
    });

    // Centre le plateau.
    const cols = Math.ceil(Math.sqrt(planet.tiles));
    const centerX = isoX(cols - 1, 0) / 2 + isoX(0, Math.ceil(planet.tiles / cols) - 1) / 2;
    const centerY = isoY(cols - 1, Math.ceil(planet.tiles / cols) - 1) / 2;
    board.position.set(
      app.screen.width / 2 - centerX,
      app.screen.height / 2 - centerY - 20,
    );
  }, [planet, pixiReady, placeAt]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 'var(--space-6)', color: 'var(--danger-500)' }}>
        {error}
      </div>
    );
  }
  if (!planet) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
        {t.status.loading}
      </div>
    );
  }

  const usedTiles = planet.buildings.filter((b) => b.tileIndex !== null).length;

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', height: '100%' }}>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} data-testid="planet-canvas" />

        {/* Bandeau d'en-tête planète */}
        <header
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--elevation-raised)',
            padding: '8px 14px',
          }}
        >
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
        </header>

        {selectedCard && (
          <p
            style={{
              position: 'absolute',
              top: 70,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-overlay)',
              border: '1px solid var(--accent-400)',
              borderRadius: 'var(--radius-chip)',
              padding: '4px 14px',
              fontSize: 12,
              color: 'var(--accent-200)',
            }}
          >
            {t.planet.selectCardHint}
          </p>
        )}
        {notice && (
          <p
            role="status"
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-overlay)',
              borderRadius: 'var(--radius-chip)',
              padding: '4px 14px',
              fontSize: 12,
            }}
          >
            {notice}
          </p>
        )}

        {/* Panneau stats (droite) */}
        <aside
          style={{
            position: 'absolute',
            right: 16,
            top: 16,
            bottom: 12,
            width: 300,
            overflowY: 'auto',
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--elevation-raised)',
            padding: 'var(--space-4)',
            display: 'grid',
            gap: 'var(--space-4)',
            alignContent: 'start',
          }}
        >
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
                  .filter(([, v]) => v > 0)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([res, qty]) => (
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
                        {qty.toFixed(0)} T
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      <CardHand
        planet={planet}
        selectedCard={selectedCard}
        onAction={async (action: CardAction) => {
          if (action.kind === 'unlock') {
            try {
              await api.unlock(planetId, action.node);
              setNotice(t.planet.unlockSuccess);
              await refresh();
            } catch (err) {
              setNotice((err as ApiError).message ?? t.errors.generic);
            }
          } else {
            setSelectedCard((c) => (c === action.building ? null : action.building));
          }
        }}
      />
    </div>
  );
}
