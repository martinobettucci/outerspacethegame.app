/**
 * Carte galaxie — GB §17 : champ d'étoiles three.js stylé 3D, navigation
 * 2D (pan/zoom), corps en pixel-sprites (DESIGN_SYSTEM §11.3), brouillard
 * de guerre côté serveur (seuls les corps visibles arrivent).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Globe2, Sun, CircleDot, Rocket, Send, Radar } from 'lucide-react';
import { api, type ApiError, type GalaxyBody, type ShipView } from '../api.js';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import {
  BLACK_HOLE_SPRITE,
  loadSpriteCanvas,
  planetSprite,
  starSprite,
} from './assets.ts';

/** Taille visuelle des sprites en unités-monde (pc) — lisibilité carte. */
const SPRITE_PC: Record<string, number> = { s: 10, m: 16, l: 24, star: 44 };

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  meshes: Map<string, THREE.Mesh>;
  dispose: () => void;
}

export function GalaxyMap() {
  const { setView } = useAppState();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const [bodies, setBodies] = useState<GalaxyBody[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<GalaxyBody | null>(null);
  const [ships, setShips] = useState<ShipView[]>([]);
  const [selectedShip, setSelectedShip] = useState<ShipView | null>(null);
  const [targeting, setTargeting] = useState<
    | { kind: 'ship'; shipId: string }
    | { kind: 'probe'; planetId: string }
    | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const targetingRef = useRef<typeof targeting>(null);
  targetingRef.current = targeting;
  const shipsRef = useRef<ShipView[]>([]);
  shipsRef.current = ships;
  const [labels, setLabels] = useState<
    { id: string; name: string; x: number; y: number; owned: boolean }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .galaxy()
        .then((r) => !cancelled && setBodies(r.bodies))
        .catch(() => !cancelled && setError(true));
      api
        .fleet()
        .then((r) => !cancelled && setShips(r.ships))
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !bodies) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color('#060810'));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Centre de la vue : barycentre des corps possédés (ou de tous).
    const owned = bodies.filter((b) => b.owned);
    const anchor = owned[0] ?? bodies[0];
    const cx = anchor ? anchor.x : 0;
    const cy = anchor ? anchor.y : 0;

    const viewHalf = 120; // ±120 pc visibles au départ
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera(
      -viewHalf * aspect,
      viewHalf * aspect,
      viewHalf,
      -viewHalf,
      0.1,
      1000,
    );
    camera.position.set(cx, cy, 100);
    camera.lookAt(cx, cy, 0);

    // Fond : poussière d'étoiles décorative + profondeur violette.
    const starCount = 2200;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = cx + (Math.random() - 0.5) * 2400;
      positions[i * 3 + 1] = cy + (Math.random() - 0.5) * 2400;
      positions[i * 3 + 2] = -50 - Math.random() * 40;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x8a93b8, size: 1.4, sizeAttenuation: false }),
    );
    scene.add(dust);

    const nebGeo = new THREE.CircleGeometry(700, 48);
    const neb = new THREE.Mesh(
      nebGeo,
      new THREE.MeshBasicMaterial({
        color: 0x2a1b52,
        transparent: true,
        opacity: 0.35,
      }),
    );
    neb.position.set(cx - 180, cy + 140, -60);
    scene.add(neb);

    const meshes = new Map<string, THREE.Mesh>();

    // Sprites des corps (première frame des stubs GIF).
    for (const body of bodies) {
      const spritePath =
        body.bodyType === 'star'
          ? starSprite(body.starFuelType ?? 'cold')
          : body.bodyType === 'black_hole'
            ? BLACK_HOLE_SPRITE
            : planetSprite(body.climate ?? 'temperate', body.size ?? 's');
      const sizePc =
        body.bodyType === 'planet'
          ? SPRITE_PC[body.size ?? 's']!
          : SPRITE_PC.star!;
      const geo = new THREE.PlaneGeometry(sizePc, sizePc);
      const mat = new THREE.MeshBasicMaterial({ transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(body.x, body.y, body.bodyType === 'star' ? -5 : 0);
      mesh.userData.bodyId = body.id;
      scene.add(mesh);
      meshes.set(body.id, mesh);
      void loadSpriteCanvas(spritePath).then((canvas) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter; // identité pixel-sprite
        mat.map = tex;
        mat.needsUpdate = true;
      });
      // Anneau de possession (bleu = soi, DESIGN_SYSTEM sémantique).
      if (body.owned) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(sizePc * 0.62, sizePc * 0.7, 40),
          new THREE.MeshBasicMaterial({ color: 0x3e6bc7, side: THREE.DoubleSide }),
        );
        ring.position.set(body.x, body.y, 1);
        scene.add(ring);
      }
    }

    // Navigation 2D : pan à la souris, zoom à la molette.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const el = renderer.domElement;
    const worldPerPixel = () =>
      (camera.right - camera.left) / (el.clientWidth * camera.zoom);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const wpp = worldPerPixel();
      camera.position.x -= (e.clientX - lastX) * wpp;
      camera.position.y += (e.clientY - lastY) * wpp;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      camera.zoom = Math.min(8, Math.max(0.15, camera.zoom * factor));
      camera.updateProjectionMatrix();
    };
    // Flotte : marqueurs + lignes de transit, mis à jour chaque frame.
    const fleetGroup = new THREE.Group();
    scene.add(fleetGroup);
    const shipMeshes = new Map<string, THREE.Mesh>();
    const transitLines = new Map<string, THREE.Line>();
    const syncFleet = () => {
      const now = Date.now();
      const current = new Set<string>();
      // Éventail des vaisseaux stationnés au même point (lisibilité + clic).
      const seenAt = new Map<string, number>();
      for (const ship of shipsRef.current) {
        current.add(ship.id);
        let mesh = shipMeshes.get(ship.id);
        if (!mesh) {
          const isProbe = ship.hullCategory === 'probe';
          mesh = new THREE.Mesh(
            new THREE.CircleGeometry(isProbe ? 2.6 : 4, 3),
            new THREE.MeshBasicMaterial({
              color: isProbe ? 0x6ec6e8 : 0xd9cf4a,
            }),
          );
          mesh.userData.shipId = ship.id;
          fleetGroup.add(mesh);
          shipMeshes.set(ship.id, mesh);
        }
        let px = ship.x;
        let py = ship.y;
        if (!ship.mission) {
          const key = `${Math.round(px)}:${Math.round(py)}`;
          const idx = seenAt.get(key) ?? 0;
          seenAt.set(key, idx + 1);
          const angle = idx * 2.4;
          px += 9 * Math.cos(angle);
          py += 9 * Math.sin(angle);
        }
        if (ship.mission) {
          const t0 = new Date(ship.mission.departedAt).getTime();
          const t1 = new Date(ship.mission.arrivesAt).getTime();
          const f = Math.min(1, Math.max(0, (now - t0) / Math.max(1, t1 - t0)));
          px = ship.mission.originX + (ship.mission.destX - ship.mission.originX) * f;
          py = ship.mission.originY + (ship.mission.destY - ship.mission.originY) * f;
          let line = transitLines.get(ship.id);
          if (!line) {
            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(ship.mission.originX, ship.mission.originY, 2),
              new THREE.Vector3(ship.mission.destX, ship.mission.destY, 2),
            ]);
            line = new THREE.Line(
              geo,
              new THREE.LineDashedMaterial({ color: 0x6e96e8, dashSize: 4, gapSize: 3 }),
            );
            line.computeLineDistances();
            fleetGroup.add(line);
            transitLines.set(ship.id, line);
          }
        } else {
          const line = transitLines.get(ship.id);
          if (line) {
            fleetGroup.remove(line);
            transitLines.delete(ship.id);
          }
        }
        mesh.position.set(px, py, 3);
      }
      for (const [id, mesh] of shipMeshes) {
        if (!current.has(id)) {
          fleetGroup.remove(mesh);
          shipMeshes.delete(id);
          const line = transitLines.get(id);
          if (line) fleetGroup.remove(line);
          transitLines.delete(id);
        }
      }
    };

    const raycaster = new THREE.Raycaster();
    const worldAt = (e: MouseEvent): { x: number; y: number } => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector3(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
        0,
      );
      ndc.unproject(camera);
      return { x: ndc.x, y: ndc.y };
    };
    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const bodyHits = raycaster.intersectObjects([...meshes.values()]);
      const bodyHit = bodyHits[0]?.object.userData.bodyId as string | undefined;

      // Mode ciblage : le clic désigne la destination.
      const targetingNow = targetingRef.current;
      if (targetingNow) {
        const dest = bodyHit
          ? { bodyId: bodyHit }
          : worldAt(e);
        const done = (msg: string) => {
          setNotice(msg);
          setTargeting(null);
          void api.fleet().then((r) => setShips(r.ships));
        };
        if (targetingNow.kind === 'ship') {
          api
            .moveShip(targetingNow.shipId, dest)
            .then((r) =>
              done(
                `${t.galaxy.departed} ${t.galaxy.eta} ${new Date(r.arrivesAt).toLocaleString('en-US')} · ${r.fuelBurned} u ${t.galaxy.fuelCost}`,
              ),
            )
            .catch((err: ApiError) =>
              done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
            );
        } else {
          const coords = 'bodyId' in dest ? worldAt(e) : dest;
          api
            .launchProbe(targetingNow.planetId, coords)
            .then((r) =>
              done(
                `${t.galaxy.probeLaunched} ${t.galaxy.eta} ${new Date(r.arrivesAt).toLocaleString('en-US')}`,
              ),
            )
            .catch((err: ApiError) =>
              done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
            );
        }
        return;
      }

      const shipHits = raycaster.intersectObjects([...shipMeshes.values()]);
      const shipHit = shipHits[0]?.object.userData.shipId as string | undefined;
      if (shipHit) {
        setSelectedShip(shipsRef.current.find((s) => s.id === shipHit) ?? null);
        setSelected(null);
        return;
      }
      setSelectedShip(null);
      setSelected(bodyHit ? (bodies.find((b) => b.id === bodyHit) ?? null) : null);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('click', onClick);

    // Boucle de rendu + projection des labels DOM.
    let raf = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      syncFleet();
      renderer.render(scene, camera);
      const next: { id: string; name: string; x: number; y: number; owned: boolean }[] = [];
      for (const body of bodies) {
        v.set(body.x, body.y, 0).project(camera);
        if (v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
        next.push({
          id: body.id,
          name: body.name,
          x: ((v.x + 1) / 2) * el.clientWidth,
          y: ((1 - v.y) / 2) * el.clientHeight,
          owned: body.owned,
        });
      }
      setLabels((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const dispose = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClick);
      renderer.dispose();
      mount.removeChild(el);
    };
    sceneRef.current = { renderer, scene, camera, meshes, dispose };
    return dispose;
  }, [bodies]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 'var(--space-6)', color: 'var(--danger-500)' }}>
        {t.errors.generic}
      </div>
    );
  }
  if (!bodies) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
        {t.status.loading}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} data-testid="galaxy-canvas" />
      {/* Labels projetés */}
      {labels.map((l) => (
        <span
          key={l.id}
          style={{
            position: 'absolute',
            left: l.x,
            top: l.y + 26,
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: l.owned ? 'var(--primary-300)' : 'var(--text-secondary)',
            pointerEvents: 'none',
            textShadow: '0 1px 3px #060810',
          }}
        >
          {l.name}
        </span>
      ))}
      {notice && (
        <p
          role="status"
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-overlay)',
            borderRadius: 'var(--radius-chip)',
            padding: '5px 16px',
            fontSize: 12,
            maxWidth: '70%',
          }}
        >
          {notice}
        </p>
      )}
      {selectedShip && (
        <aside
          aria-label={selectedShip.name}
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            width: 260,
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--elevation-raised)',
            padding: 'var(--space-4)',
            display: 'grid',
            gap: 'var(--space-3)',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rocket size={16} color="var(--accent-400)" aria-hidden />
            <h2 style={{ fontSize: 15 }}>
              {selectedShip.name}
              <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 6 }}>
                {selectedShip.hullCategory}
                {selectedShip.hullSize ? ` ${selectedShip.hullSize.toUpperCase()}` : ''}
              </span>
            </h2>
          </header>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            {selectedShip.status}
            {selectedShip.mission &&
              ` — ${t.galaxy.eta} ${new Date(selectedShip.mission.arrivesAt).toLocaleString('en-US')}`}
            {Object.entries(selectedShip.fuel).map(
              ([type, u]) => ` · ${Math.floor(u)} u ${type}`,
            )}
          </p>
          {['docked', 'hovering', 'idle'].includes(selectedShip.status) && (
            <button
              type="button"
              onClick={() => {
                setTargeting({ kind: 'ship', shipId: selectedShip.id });
                setNotice(t.galaxy.sendHint);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--primary-400)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <Send size={14} aria-hidden /> {t.galaxy.sendShip}
            </button>
          )}
        </aside>
      )}
      {bodies.length === 0 && (
        <p
          style={{
            position: 'absolute',
            inset: 'auto 0 40% 0',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          {t.galaxy.emptyHint}
        </p>
      )}
      {selected && (
        <aside
          aria-label={selected.name}
          style={{
            position: 'absolute',
            right: 16,
            top: 16,
            width: 280,
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--elevation-raised)',
            padding: 'var(--space-4)',
            display: 'grid',
            gap: 'var(--space-3)',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selected.bodyType === 'planet' ? (
              <Globe2 size={18} color="var(--accent-400)" aria-hidden />
            ) : selected.bodyType === 'star' ? (
              <Sun size={18} color="var(--warning-500)" aria-hidden />
            ) : (
              <CircleDot size={18} color="var(--violet-500)" aria-hidden />
            )}
            <h2 style={{ fontSize: 16 }}>{selected.name}</h2>
          </header>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '4px 12px',
              margin: 0,
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            <dt>Type</dt>
            <dd style={{ margin: 0 }}>
              {selected.bodyType === 'planet'
                ? `Planet ${selected.size?.toUpperCase() ?? ''} · ${selected.climate ?? ''} · ${selected.quality ?? ''}`
                : selected.bodyType === 'star'
                  ? `${t.galaxy.star} · ${selected.starClass?.toUpperCase()} · ${selected.starFuelType} ${t.galaxy.fuel}`
                  : t.galaxy.blackHole}
            </dd>
            <dt>Position</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
              {selected.x.toFixed(0)} · {selected.y.toFixed(0)} pc
            </dd>
            {selected.ownerName && (
              <>
                <dt>Owner</dt>
                <dd style={{ margin: 0 }}>
                  {selected.owned ? t.galaxy.yourWorld : selected.ownerName}
                </dd>
              </>
            )}
          </dl>
          {selected.bodyType === 'star' && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--warning-500)' }}>
              {t.galaxy.starWarning}
            </p>
          )}
          {selected.owned && (
            <button
              type="button"
              onClick={() => {
                setTargeting({ kind: 'probe', planetId: selected.id });
                setNotice(t.galaxy.probeHint);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--violet-500)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <Radar size={14} aria-hidden /> {t.galaxy.launchProbe}
            </button>
          )}
          {selected.owned && (
            <button
              type="button"
              onClick={() => setView({ kind: 'planet', planetId: selected.id })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--primary-400)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <Rocket size={14} aria-hidden /> {t.galaxy.openPlanet}
            </button>
          )}
          {!selected.owned && selected.bodyType === 'planet' && selected.ownerId && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.ping(selected.id);
                  setNotice(t.galaxy.pingSent);
                } catch (err) {
                  setNotice((err as ApiError).message ?? t.errors.generic);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--accent-400)',
                color: '#0D0D0D',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <Radar size={14} aria-hidden /> {t.galaxy.ping}
            </button>
          )}
          {!selected.owned && selected.bodyType === 'planet' && !selected.ownerId && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.galaxy.foreignPlanet}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
