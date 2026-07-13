/**
 * Carte galaxie — GB §17 : champ d'étoiles three.js stylé 3D, navigation
 * 2D (pan/zoom), corps en pixel-sprites (DESIGN_SYSTEM §11.3), brouillard
 * de guerre côté serveur (seuls les corps visibles arrivent).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Globe2,
  Sun,
  CircleDot,
  Rocket,
  Send,
  Radar,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Users,
  Flag,
  Fuel,
  Lock,
  Telescope,
} from 'lucide-react';
import {
  ALL_RESOURCE_IDS,
  canFitColonyKit,
  COLONY_MIN_SETTLERS,
  containersUsed,
  FUEL_TRANSFER_RADIUS_PC,
} from '@atg/shared';
import { api, type ApiError, type GalaxyBody, type ShipView } from '../api.js';
import type { PlanetIntel } from '@atg/shared';
import { t } from '../i18n/en.js';
import { useAppState } from '../state.tsx';
import { FleetOperations } from '../components/FleetOperations.tsx';
import { OperationTimer } from '../components/OperationTimer.tsx';
import {
  BLACK_HOLE_SPRITE,
  loadSpriteCanvas,
  planetSprite,
  starSprite,
} from './assets.ts';
import '../styles/scenes.css';

/** Taille visuelle des sprites en unités-monde (pc) — lisibilité carte. */
const SPRITE_PC: Record<string, number> = { s: 10, m: 16, l: 24, star: 44 };

/** Soft procedural plate: atmosphere without a video competing with play. */
function makeNebulaTexture(primary: string, secondary: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'screen';
  const clouds = [
    [0.28, 0.54, 0.42, primary],
    [0.55, 0.42, 0.34, secondary],
    [0.76, 0.62, 0.36, primary],
    [0.48, 0.7, 0.24, secondary],
  ] as const;
  for (const [u, v, radius, color] of clouds) {
    const x = u * canvas.width;
    const y = v * canvas.height;
    const r = radius * canvas.width;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `${color}66`);
    gradient.addColorStop(0.34, `${color}26`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Wispy filaments keep the plate from reading as a flat colored circle.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#b8cfff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const y = 120 + i * 18;
    ctx.beginPath();
    ctx.moveTo(-80, y + Math.sin(i) * 24);
    ctx.bezierCurveTo(190, y - 110, 480, y + 96, 850, y - 40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    gradient.addColorStop(0, 'rgba(255,255,255,.86)');
    gradient.addColorStop(0.16, 'rgba(255,255,255,.28)');
    gradient.addColorStop(0.48, 'rgba(255,255,255,.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  meshes: Map<string, THREE.Mesh>;
  dispose: () => void;
}

export function GalaxyMap() {
  const { setView, refreshMe } = useAppState();
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
  const [cargoRes, setCargoRes] = useState('ore');
  const [cargoTons, setCargoTons] = useState('1');
  const [markets, setMarkets] = useState<
    Awaited<ReturnType<typeof api.markets>>['markets']
  >([]);
  const [tradeT, setTradeT] = useState('1');
  const [settlersN, setSettlersN] = useState('200');
  const [transferTo, setTransferTo] = useState('');
  const [transferUnits, setTransferUnits] = useState('10');
  const [intel, setIntel] = useState<
    { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: PlanetIntel } | null
  >(null);
  useEffect(() => {
    if (!selected || selected.owned || selected.bodyType !== 'planet') {
      setIntel(null);
      return;
    }
    let cancelled = false;
    setIntel({ kind: 'loading' });
    api
      .bodyIntel(selected.id)
      .then((r) => !cancelled && setIntel({ kind: 'ready', data: r.intel }))
      .catch(() => !cancelled && setIntel({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [selected]);
  const [npcs, setNpcs] = useState<
    Awaited<ReturnType<typeof api.npcs>>['npcs']
  >([]);
  const refreshNpcs = () =>
    api
      .npcs()
      .then((r) => setNpcs(r.npcs))
      .catch(() => setNpcs([]));
  useEffect(() => {
    void refreshNpcs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const targetingRef = useRef<typeof targeting>(null);
  targetingRef.current = targeting;
  const selectedRef = useRef<GalaxyBody | null>(null);
  selectedRef.current = selected;
  const selectedShipRef = useRef<ShipView | null>(null);
  selectedShipRef.current = selectedShip;
  const shipsRef = useRef<ShipView[]>([]);
  shipsRef.current = ships;
  const [labels, setLabels] = useState<
    { id: string; name: string; x: number; y: number; owned: boolean }[]
  >([]);

  // Offres du marché local (à quai) + hospitalité innée (à quai OU en
  // survol — l'hospitalité ne demande pas de droit d'atterrissage).
  const dockedAt = selectedShip?.dockedBodyId ?? null;
  const onSiteAt = dockedAt ?? selectedShip?.hoverBodyId ?? null;
  const [innate, setInnate] = useState<
    Awaited<ReturnType<typeof api.innateOffers>>['offers']
  >([]);
  useEffect(() => {
    if (!dockedAt) {
      setMarkets([]);
      return;
    }
    let cancelled = false;
    api
      .markets(dockedAt)
      .then((r) => !cancelled && setMarkets(r.markets))
      .catch(() => !cancelled && setMarkets([]));
    return () => {
      cancelled = true;
    };
  }, [dockedAt]);
  useEffect(() => {
    if (!onSiteAt) {
      setInnate([]);
      return;
    }
    let cancelled = false;
    api
      .innateOffers(onSiteAt)
      .then((r) => !cancelled && setInnate(r.offers))
      .catch(() => !cancelled && setInnate([]));
    return () => {
      cancelled = true;
    };
  }, [onSiteAt]);

  /** Rafraîchit la flotte ET le panneau du vaisseau sélectionné. */
  const refreshShips = () =>
    api
      .fleet()
      .then((r) => {
        setShips(r.ships);
        setSelectedShip((cur) =>
          cur ? (r.ships.find((s) => s.id === cur.id) ?? null) : null,
        );
      })
      .catch(() => undefined);

  const chooseBody = (body: GalaxyBody) => {
    if (!targeting) {
      setSelectedShip(null);
      setSelected(body);
      return;
    }
    const done = (message: string) => {
      setNotice(message);
      setTargeting(null);
      void refreshShips();
    };
    if (targeting.kind === 'ship') {
      void api
        .moveShip(targeting.shipId, { bodyId: body.id })
        .then((result) =>
          done(
            `${t.galaxy.departed} ${t.galaxy.eta} ${new Date(result.arrivesAt).toLocaleString('en-US')} · ${result.fuelBurned} u ${t.galaxy.fuelCost}`,
          ),
        )
        .catch((err: ApiError) =>
          done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
        );
      return;
    }
    void api
      .launchProbe(targeting.planetId, { x: body.x, y: body.y })
      .then((result) =>
        done(
          `${t.galaxy.probeLaunched} ${t.galaxy.eta} ${new Date(result.arrivesAt).toLocaleString('en-US')}`,
        ),
      )
      .catch((err: ApiError) =>
        done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
      );
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .galaxy()
        .then((r) => {
          if (cancelled) return;
          setBodies((current) =>
            current && JSON.stringify(current) === JSON.stringify(r.bodies)
              ? current
              : r.bodies,
          );
        })
        .catch(() => !cancelled && setError(true));
      api
        .fleet()
        .then((r) => {
          if (cancelled) return;
          // Une coque « colonizing » qui disparaît vient d'être convertie
          // en colonie : le rail (me.planets) doit l'apprendre.
          const established = shipsRef.current.some(
            (s) =>
              s.status === 'colonizing' &&
              !r.ships.some((n) => n.id === s.id),
          );
          setShips(r.ships);
          setSelectedShip((current) =>
            current
              ? (r.ships.find((ship) => ship.id === current.id) ?? null)
              : null,
          );
          if (established) void refreshMe();
        })
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshMe]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !bodies) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color('#03050a'));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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

    // Three depth planes: the void should feel vast while labels remain crisp.
    const starLayers: THREE.Points[] = [];
    const addStarLayer = (
      count: number,
      spread: number,
      z: number,
      size: number,
      opacity: number,
    ) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const palette = [
        new THREE.Color('#8ba6d8'),
        new THREE.Color('#f2f4fa'),
        new THREE.Color('#7a62b8'),
        new THREE.Color('#d9cf9b'),
      ];
      for (let i = 0; i < count; i++) {
        positions[i * 3] = cx + (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = cy + (Math.random() - 0.5) * spread;
        positions[i * 3 + 2] = z - Math.random() * 8;
        const c = palette[Math.floor(Math.random() * palette.length)]!;
        const luminosity = 0.45 + Math.random() * 0.55;
        colors[i * 3] = c.r * luminosity;
        colors[i * 3 + 1] = c.g * luminosity;
        colors[i * 3 + 2] = c.b * luminosity;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      starLayers.push(points);
      scene.add(points);
    };
    addStarLayer(1500, 2800, -88, 0.75, 0.62);
    addStarLayer(560, 2100, -72, 1.25, 0.78);
    addStarLayer(120, 1600, -58, 2.1, 0.92);

    const nebulaMaterials: THREE.SpriteMaterial[] = [];
    const addNebula = (
      texture: THREE.Texture,
      x: number,
      y: number,
      w: number,
      h: number,
      opacity: number,
      rotation: number,
    ) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        rotation,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, -78);
      sprite.scale.set(w, h, 1);
      nebulaMaterials.push(material);
      scene.add(sprite);
    };
    const purpleNebula = makeNebulaTexture('#482a86', '#173e78');
    const blueNebula = makeNebulaTexture('#173b70', '#4b2c72');
    addNebula(purpleNebula, cx - 340, cy + 210, 1350, 760, 0.36, -0.18);
    addNebula(blueNebula, cx + 480, cy - 260, 1500, 820, 0.25, 0.32);
    addNebula(purpleNebula, cx + 80, cy + 560, 980, 560, 0.16, 0.8);

    // A near-invisible navigation lattice gives scale without pretending the
    // universe is a neat graph.
    const grid = new THREE.GridHelper(2400, 24, 0x365783, 0x24344f);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(cx, cy, -44);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.055;
    gridMaterial.depthWrite = false;
    scene.add(grid);

    const meshes = new Map<string, THREE.Mesh>();
    const glowTexture = makeGlowTexture();

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

      const auraMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color:
          body.bodyType === 'star'
            ? 0xe8bc69
            : body.owned
              ? 0x3e6bc7
              : 0x6d51a4,
        transparent: true,
        opacity: body.bodyType === 'star' ? 0.34 : body.owned ? 0.25 : 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const aura = new THREE.Sprite(auraMaterial);
      aura.position.set(body.x, body.y, -7);
      aura.scale.set(sizePc * 2.7, sizePc * 2.7, 1);
      aura.userData.baseOpacity = auraMaterial.opacity;
      aura.userData.baseScaleX = aura.scale.x;
      aura.userData.baseScaleY = aura.scale.y;
      scene.add(aura);
      mesh.userData.aura = aura;
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
          new THREE.MeshBasicMaterial({
            color: 0x5790ed,
            transparent: true,
            opacity: 0.86,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          }),
        );
        ring.position.set(body.x, body.y, 1);
        scene.add(ring);

        const echo = new THREE.Mesh(
          new THREE.RingGeometry(sizePc * 0.82, sizePc * 0.845, 48),
          new THREE.MeshBasicMaterial({
            color: 0x3e6bc7,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
          }),
        );
        echo.position.set(body.x, body.y, 0.5);
        scene.add(echo);
      }
    }

    // Navigation 2D : pan à la souris, zoom à la molette.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const el = renderer.domElement;
    el.tabIndex = 0;
    el.setAttribute(
      'aria-label',
      'Interactive galaxy map. Use arrow keys to pan and plus or minus to zoom. When choosing a destination, press Enter or Space to target the map center.',
    );
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
    const targetMapCenter = () => {
      const currentTargeting = targetingRef.current;
      if (!currentTargeting) return false;

      const coords = { x: camera.position.x, y: camera.position.y };
      const done = (message: string) => {
        setNotice(message);
        setTargeting(null);
        void api.fleet().then((result) => setShips(result.ships));
      };
      if (currentTargeting.kind === 'ship') {
        void api
          .moveShip(currentTargeting.shipId, coords)
          .then((result) =>
            done(
              `${t.galaxy.departed} ${t.galaxy.eta} ${new Date(result.arrivesAt).toLocaleString('en-US')} · ${result.fuelBurned} u ${t.galaxy.fuelCost}`,
            ),
          )
          .catch((err: ApiError) =>
            done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
          );
      } else {
        void api
          .launchProbe(currentTargeting.planetId, coords)
          .then((result) =>
            done(
              `${t.galaxy.probeLaunched} ${t.galaxy.eta} ${new Date(result.arrivesAt).toLocaleString('en-US')}`,
            ),
          )
          .catch((err: ApiError) =>
            done(`${t.galaxy.moveFailed} — ${err.message ?? err.error}`),
          );
      }
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const step = worldPerPixel() * 48;
      if (event.key === 'ArrowLeft') camera.position.x -= step;
      else if (event.key === 'ArrowRight') camera.position.x += step;
      else if (event.key === 'ArrowUp') camera.position.y += step;
      else if (event.key === 'ArrowDown') camera.position.y -= step;
      else if (event.key === '+' || event.key === '=') {
        camera.zoom = Math.min(8, camera.zoom * 1.1);
        camera.updateProjectionMatrix();
      } else if (event.key === '-' || event.key === '_') {
        camera.zoom = Math.max(0.15, camera.zoom * 0.9);
        camera.updateProjectionMatrix();
      } else if (
        (event.key === 'Enter' || event.key === ' ') &&
        targetMapCenter()
      ) {
        // The map center acts as a keyboard cursor for free-flight and probes.
      } else if (event.key === 'Escape' && targetingRef.current) {
        setTargeting(null);
      } else return;
      event.preventDefault();
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
            new THREE.CircleGeometry(isProbe ? 2.8 : 4.4, 4),
            new THREE.MeshBasicMaterial({
              color: isProbe ? 0x6ec6e8 : 0xd9cf4a,
              transparent: true,
              opacity: 0.94,
              blending: THREE.AdditiveBlending,
            }),
          );
          mesh.rotation.z = Math.PI / 4;
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
              new THREE.LineDashedMaterial({
                color: 0x8bb5fb,
                dashSize: 4,
                gapSize: 3,
                transparent: true,
                opacity: 0.72,
              }),
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
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('click', onClick);

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = mount.clientWidth;
      const nextHeight = mount.clientHeight;
      if (!nextWidth || !nextHeight) return;
      const nextAspect = nextWidth / nextHeight;
      camera.left = -viewHalf * nextAspect;
      camera.right = viewHalf * nextAspect;
      camera.top = viewHalf;
      camera.bottom = -viewHalf;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    });
    resizeObserver.observe(mount);

    // Boucle de rendu + projection des labels DOM.
    let raf = 0;
    const v = new THREE.Vector3();
    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const tick = () => {
      syncFleet();
      const elapsed = clock.getElapsedTime();
      if (!reduceMotion) {
        nebulaMaterials.forEach((material, index) => {
          material.rotation += (index % 2 === 0 ? 1 : -1) * 0.000025;
        });
        starLayers.forEach((layer, index) => {
          const material = layer.material as THREE.PointsMaterial;
          material.opacity =
            [0.62, 0.78, 0.92][index]! *
            (0.97 + Math.sin(elapsed * (0.22 + index * 0.08) + index) * 0.03);
        });
      }
      for (const [bodyId, mesh] of meshes) {
        const aura = mesh.userData.aura as THREE.Sprite | undefined;
        if (!aura) continue;
        const material = aura.material as THREE.SpriteMaterial;
        const baseOpacity = aura.userData.baseOpacity as number;
        const isSelected = selectedRef.current?.id === bodyId;
        material.opacity = isSelected
          ? baseOpacity * (reduceMotion ? 1.75 : 1.75 + Math.sin(elapsed * 3.2) * 0.16)
          : baseOpacity;
        const scale = isSelected ? 1.14 : 1;
        aura.scale.set(
          aura.userData.baseScaleX as number,
          aura.userData.baseScaleY as number,
          1,
        );
        aura.scale.multiplyScalar(scale);
      }
      for (const mesh of shipMeshes.values()) {
        const selectedNow = selectedShipRef.current?.id === mesh.userData.shipId;
        const pulse = selectedNow && !reduceMotion ? 1 + Math.sin(elapsed * 3) * 0.12 : 1;
        mesh.scale.setScalar(pulse);
      }
      if (!reduceMotion) {
        let routeIndex = 0;
        for (const line of transitLines.values()) {
          (line.material as THREE.LineDashedMaterial).opacity =
            0.66 + Math.sin(elapsed * 2.4 + routeIndex * 0.7) * 0.1;
          routeIndex += 1;
        }
      }
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
      resizeObserver.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('click', onClick);
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if ('geometry' in object) {
          (object as THREE.Mesh).geometry?.dispose?.();
        }
        if ('material' in object) {
          const rawMaterial = (object as THREE.Mesh).material as
            | THREE.Material
            | THREE.Material[];
          const materials: THREE.Material[] = Array.isArray(rawMaterial)
            ? rawMaterial
            : [rawMaterial];
          for (const material of materials) {
            if (!material) continue;
            const map = (material as THREE.MeshBasicMaterial).map;
            if (map) textures.add(map);
            material.dispose();
          }
        }
      });
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      mount.removeChild(el);
    };
    sceneRef.current = { renderer, scene, camera, meshes, dispose };
    return dispose;
  }, [bodies]);

  if (error) {
    return (
      <div role="alert" className="scene-state scene-state--error">
        {t.errors.generic}
      </div>
    );
  }
  if (!bodies) {
    return (
      <div className="scene-state">
        {t.status.loading}
      </div>
    );
  }

  return (
    <div className="galaxy-scene">
      <div ref={mountRef} className="galaxy-canvas" data-testid="galaxy-canvas" />
      <div className="galaxy-scene__readout" aria-hidden="true">
        <span>Deep-space cartography</span>
        <span>Drag to pan · wheel to focus</span>
      </div>
      <label className="galaxy-contact-index">
        <span>{targeting ? 'Choose destination' : 'Contact index'}</span>
        <select
          aria-label={targeting ? 'Choose destination' : 'Galaxy contact index'}
          value={
            targeting
              ? ''
              : selectedShip
                ? `ship:${selectedShip.id}`
                : selected
                  ? `body:${selected.id}`
                  : ''
          }
          onChange={(event) => {
            const [kind, id] = event.target.value.split(':');
            if (kind === 'body') {
              const body = bodies.find((candidate) => candidate.id === id);
              if (body) chooseBody(body);
            } else if (kind === 'ship' && !targeting) {
              setSelected(null);
              setSelectedShip(
                ships.find((candidate) => candidate.id === id) ?? null,
              );
            } else if (!event.target.value && !targeting) {
              setSelected(null);
              setSelectedShip(null);
            }
          }}
        >
          <option value="">
            {targeting ? 'Select a known body…' : 'Select contact…'}
          </option>
          <optgroup label="Known bodies">
            {bodies.map((body) => (
              <option key={body.id} value={`body:${body.id}`}>
                {body.name}
              </option>
            ))}
          </optgroup>
          {!targeting && ships.length > 0 && (
            <optgroup label="Fleet">
              {ships.map((ship) => (
                <option key={ship.id} value={`ship:${ship.id}`}>
                  {ship.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {/* Labels projetés */}
      {labels.map((label) => {
        const body = bodies.find((candidate) => candidate.id === label.id);
        if (!body) return null;
        return (
          <button
            key={label.id}
            type="button"
            className={`galaxy-label${label.owned ? ' galaxy-label--owned' : ''}${
              selected?.id === label.id ? ' galaxy-label--selected' : ''
            }`}
            style={{
              left: label.x,
              top: label.y + 26,
            }}
            aria-label={`${targeting ? 'Target' : 'Inspect'} ${label.name}`}
            aria-pressed={!targeting && selected?.id === label.id}
            onClick={() => chooseBody(body)}
          >
            {label.name}
          </button>
        );
      })}
      {notice && (
        <p role="status" className="galaxy-notice">
          {notice}
        </p>
      )}
      <FleetOperations
        ships={ships}
        bodies={bodies}
        selectedShipId={selectedShip?.id}
        onSelect={(ship) => {
          setSelected(null);
          setSelectedShip(ship);
        }}
      />
      {selectedShip && (
        <aside
          aria-label={selectedShip.name}
          className="galaxy-panel galaxy-panel--ship"
          style={{
            position: 'absolute',
            left: 18,
            top: 18,
            width: 310,
            maxHeight: 'calc(100% - 36px)',
            overflowY: 'auto',
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
            {selectedShip.status === 'stranded' ? (
              <span
                title={t.galaxy.strandedHint}
                style={{
                  background: 'var(--danger-700, #7f1d1d)',
                  color: '#ffd7d7',
                  borderRadius: 'var(--radius-chip)',
                  padding: '2px 10px',
                  fontSize: 11,
                }}
              >
                {t.galaxy.stranded}
              </span>
            ) : (
              selectedShip.status
            )}
          </p>
          {selectedShip.mission && (
            <OperationTimer
              completesAt={selectedShip.mission.arrivesAt}
              label={`${t.galaxy.eta} · ${selectedShip.name}`}
              tone="violet"
            />
          )}
          {!selectedShip.mission && selectedShip.establishesAt && (
            <OperationTimer
              completesAt={selectedShip.establishesAt}
              label={`Colony establishment · ${selectedShip.name}`}
              tone="warning"
            />
          )}
          {selectedShip.tankU > 0 && (
            <section
              aria-label={t.galaxy.fuelTitle}
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'grid',
                gap: 4,
              }}
            >
              <strong
                style={{
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Fuel size={13} aria-hidden /> {t.galaxy.fuelTitle} —{' '}
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {(selectedShip.fuel[selectedShip.fuelType] ?? 0).toFixed(1)}/
                  {selectedShip.tankU} u {selectedShip.fuelType}
                </span>
              </strong>
              <div
                role="progressbar"
                aria-label={t.galaxy.fuelTitle}
                aria-valuemin={0}
                aria-valuemax={selectedShip.tankU}
                aria-valuenow={Math.round(
                  selectedShip.fuel[selectedShip.fuelType] ?? 0,
                )}
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--bg-overlay)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(
                      100,
                      (100 * (selectedShip.fuel[selectedShip.fuelType] ?? 0)) /
                        Math.max(1, selectedShip.tankU),
                    )}%`,
                    background:
                      selectedShip.status === 'stranded'
                        ? 'var(--danger-500, #F24141)'
                        : 'var(--success-500, #238C33)',
                  }}
                />
              </div>
              {selectedShip.fuelRatePerDay < 0 ? (
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warning-400, #D9CF4A)' }}>
                  {selectedShip.fuelRatePerDay.toFixed(1)} {t.galaxy.fuelPerDay}
                </span>
              ) : selectedShip.status === 'hovering' &&
                selectedShip.hoverBodyId &&
                bodies.some(
                  (b) => b.id === selectedShip.hoverBodyId && b.owned,
                ) ? (
                <span>{t.galaxy.fuelServedByPlanet}</span>
              ) : null}
            </section>
          )}
          {selectedShip.containers > 0 && (
            <section
              aria-label={t.galaxy.cargoTitle}
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'grid',
                gap: 4,
              }}
            >
              <strong
                style={{
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Package size={13} aria-hidden /> {t.galaxy.cargoTitle} —{' '}
                {containersUsed(selectedShip.cargo)}/{selectedShip.containers}{' '}
                {t.galaxy.containers}
              </strong>
              {Object.keys(selectedShip.cargo).length === 0 ? (
                <span>{t.galaxy.cargoEmpty}</span>
              ) : (
                Object.entries(selectedShip.cargo).map(([res, tons]) => (
                  <span key={res} style={{ fontFamily: 'var(--font-mono)' }}>
                    {res.replace('_', ' ')} · {tons.toFixed(1)} {t.galaxy.tons}
                  </span>
                ))
              )}
              {selectedShip.status === 'docked' &&
                selectedShip.dockedBodyId &&
                bodies.some(
                  (b) => b.id === selectedShip.dockedBodyId && b.owned,
                ) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      aria-label="Resource"
                      value={cargoRes}
                      onChange={(e) => setCargoRes(e.target.value)}
                      style={{
                        background: 'var(--bg-overlay)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                        maxWidth: 110,
                      }}
                    >
                      {ALL_RESOURCE_IDS.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Tons"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={cargoTons}
                      onChange={(e) => setCargoTons(e.target.value)}
                      style={{
                        width: 58,
                        background: 'var(--bg-overlay)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                      }}
                    />
                    {(['load', 'unload'] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() =>
                          api
                            .transferCargo(selectedShip.id, {
                              resource: cargoRes,
                              tons: Number(cargoTons),
                              direction,
                            })
                            .then(() => {
                              setNotice(t.galaxy.cargoDone);
                              void refreshShips();
                            })
                            .catch((err: ApiError) =>
                              setNotice(
                                `${t.galaxy.cargoFailed} — ${err.message ?? err.error}`,
                              ),
                            )
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background:
                            direction === 'load'
                              ? 'var(--primary-400)'
                              : 'var(--bg-overlay)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {direction === 'load' ? (
                          <ArrowUpFromLine size={11} aria-hidden />
                        ) : (
                          <ArrowDownToLine size={11} aria-hidden />
                        )}
                        {direction === 'load'
                          ? t.galaxy.cargoLoad
                          : t.galaxy.cargoUnload}
                      </button>
                    ))}
                  </div>
                )}
            </section>
          )}
          {selectedShip.status === 'docked' && markets.length > 0 && (
            <section
              aria-label={t.galaxy.marketTitle}
              style={{ display: 'grid', gap: 6, fontSize: 12 }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>
                {t.galaxy.marketTitle}
              </strong>
              {markets.flatMap((m) =>
                m.slots.map((s) => (
                  <div
                    key={`${m.buildingId}:${s.slotIndex}`}
                    style={{
                      display: 'grid',
                      gap: 4,
                      background: 'var(--bg-overlay)',
                      borderRadius: 'var(--radius-button)',
                      padding: 8,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {s.give.replace('_', ' ')} → {s.get.replace('_', ' ')} @ {s.rate}
                      {' · '}
                      {s.payableStockT} {t.galaxy.tons} {t.galaxy.marketStock}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        aria-label={`${t.galaxy.marketTrade} ${s.give}`}
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={tradeT}
                        onChange={(e) => setTradeT(e.target.value)}
                        style={{
                          width: 58,
                          background: 'var(--bg-raised)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 6px',
                          fontSize: 12,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          api
                            .trade(m.buildingId, {
                              slotIndex: s.slotIndex,
                              shipId: selectedShip.id,
                              giveT: Number(tradeT),
                            })
                            .then((r) => {
                              setNotice(
                                `${t.galaxy.marketTraded} +${r.gotT.toFixed(1)} ${t.galaxy.tons} ${r.gotResource.replace('_', ' ')}`,
                              );
                              void refreshShips();
                              void api
                                .markets(selectedShip.dockedBodyId!)
                                .then((rr) => setMarkets(rr.markets))
                                .catch(() => undefined);
                            })
                            .catch((err: ApiError) =>
                              setNotice(
                                `${t.galaxy.marketRefused} — ${err.message ?? err.error}`,
                              ),
                            )
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'var(--accent-400)',
                          color: '#0D0D0D',
                          border: 'none',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 10px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {t.galaxy.marketTrade}
                      </button>
                    </div>
                  </div>
                )),
              )}
            </section>
          )}
          {selectedShip.hullCategory === 'civil' && (
            <section
              aria-label={t.galaxy.settlersLabel}
              style={{ display: 'grid', gap: 6, fontSize: 12 }}
            >
              <strong
                style={{
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Users size={13} aria-hidden /> {t.galaxy.settlersLabel} —{' '}
                {selectedShip.settlers}/{selectedShip.settlersPax}
                {selectedShip.colonyKit && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: 'var(--violet-700)',
                      color: 'var(--accent-200)',
                      borderRadius: 'var(--radius-chip)',
                      padding: '1px 8px',
                      fontSize: 10,
                    }}
                  >
                    {t.galaxy.colonyKit}
                  </span>
                )}
              </strong>
              {selectedShip.status === 'colonizing' && selectedShip.establishesAt && (
                <span style={{ color: 'var(--warning-500)', fontFamily: 'var(--font-mono)' }}>
                  {t.galaxy.colonizing} —{' '}
                  {new Date(selectedShip.establishesAt).toLocaleTimeString('en-US')}
                </span>
              )}
              {selectedShip.status === 'docked' &&
                selectedShip.dockedBodyId &&
                bodies.some((b) => b.id === selectedShip.dockedBodyId && b.owned) && (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        aria-label={t.galaxy.settlersLabel}
                        type="number"
                        min={1}
                        step={1}
                        value={settlersN}
                        onChange={(e) => setSettlersN(e.target.value)}
                        style={{
                          width: 66,
                          background: 'var(--bg-raised)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 6px',
                          fontSize: 12,
                        }}
                      />
                      {(['embark', 'disembark'] as const).map((direction) => (
                        <button
                          key={direction}
                          type="button"
                          onClick={() =>
                            api
                              .transferSettlers(selectedShip.id, {
                                count: Number(settlersN),
                                direction,
                              })
                              .then(() => {
                                setNotice(t.galaxy.settlersMoved);
                                void refreshShips();
                              })
                              .catch((err: ApiError) =>
                                setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                              )
                          }
                          style={{
                            background:
                              direction === 'embark'
                                ? 'var(--primary-400)'
                                : 'var(--bg-overlay)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--stroke-subtle)',
                            borderRadius: 'var(--radius-button)',
                            padding: '4px 8px',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {direction === 'embark' ? t.galaxy.embark : t.galaxy.disembark}
                        </button>
                      ))}
                    </div>
                    {canFitColonyKit({
                      category: selectedShip.hullCategory,
                      size: selectedShip.hullSize,
                    }) &&
                      !selectedShip.colonyKit && (
                        <button
                          type="button"
                          onClick={() =>
                            api
                              .fitColonyKit(selectedShip.id)
                              .then(() => {
                                setNotice(t.galaxy.kitFitted);
                                void refreshShips();
                              })
                              .catch((err: ApiError) =>
                                setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                              )
                          }
                          style={{
                            background: 'var(--violet-500)',
                            color: 'var(--text-primary)',
                            border: 'none',
                            borderRadius: 'var(--radius-button)',
                            padding: '6px 10px',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {t.galaxy.fitColonyKit}
                        </button>
                      )}
                    {(() => {
                      const freePilot = npcs.find(
                        (n) => n.role === 'pilot' && !n.boundHostId,
                      );
                      return freePilot ? (
                        <button
                          type="button"
                          onClick={() =>
                            api
                              .assignCrew(selectedShip.id, freePilot.id)
                              .then(() => {
                                setNotice(t.galaxy.pilotAssigned);
                                void refreshNpcs();
                              })
                              .catch((err: ApiError) =>
                                setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                              )
                          }
                          title={`settler risk −${(
                            (freePilot.statRolls.settler_risk_reduction ?? 0) * 100
                          ).toFixed(1)}%`}
                          style={{
                            background: 'var(--bg-overlay)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--stroke-subtle)',
                            borderRadius: 'var(--radius-button)',
                            padding: '6px 10px',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {t.galaxy.assignPilot} ({freePilot.rarity} · −
                          {((freePilot.statRolls.settler_risk_reduction ?? 0) * 100).toFixed(1)}
                          %)
                        </button>
                      ) : null;
                    })()}
                  </>
                )}
              {selectedShip.status === 'hovering' &&
                selectedShip.hoverBodyId &&
                (() => {
                  const under = bodies.find((b) => b.id === selectedShip.hoverBodyId);
                  const wild =
                    under &&
                    under.bodyType === 'planet' &&
                    !under.ownerId &&
                    under.climate !== 'poison';
                  if (!wild) return null;
                  const ready =
                    selectedShip.colonyKit &&
                    selectedShip.settlers >= COLONY_MIN_SETTLERS;
                  return (
                    <button
                      type="button"
                      disabled={!ready}
                      title={
                        ready
                          ? undefined
                          : `${t.galaxy.colonyKit} + ≥ ${COLONY_MIN_SETTLERS} ${t.galaxy.settlersLabel}`
                      }
                      onClick={() =>
                        api
                          .colonize(selectedShip.id)
                          .then(() => {
                            setNotice(t.galaxy.colonizeStarted);
                            void refreshShips();
                          })
                          .catch((err: ApiError) =>
                            setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                          )
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: 'center',
                        background: ready ? 'var(--accent-400)' : 'var(--bg-overlay)',
                        color: ready ? '#0D0D0D' : 'var(--text-disabled)',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        padding: '8px 12px',
                        cursor: ready ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <Flag size={14} aria-hidden /> {t.galaxy.colonize}
                    </button>
                  );
                })()}
            </section>
          )}
          {innate.length > 0 && onSiteAt && (
            <section
              aria-label={t.galaxy.hospitalityTitle}
              style={{ display: 'grid', gap: 6, fontSize: 12 }}
            >
              <strong style={{ color: 'var(--accent-200)' }}>
                {t.galaxy.hospitalityTitle}
              </strong>
              {innate.map((o) => (
                <div
                  key={o.offerIndex}
                  style={{
                    display: 'grid',
                    gap: 4,
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-button)',
                    padding: 8,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {o.sell.replace('_', ' ')} @ {o.price} {o.want.replace('_', ' ')}/T
                    {' · '}
                    {o.availableT} {t.galaxy.tons} {t.galaxy.hospitalityAvailable}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      aria-label={`${t.galaxy.hospitalityBuy} ${o.sell}`}
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={tradeT}
                      onChange={(e) => setTradeT(e.target.value)}
                      style={{
                        width: 58,
                        background: 'var(--bg-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .innateTrade(onSiteAt, {
                            offerIndex: o.offerIndex,
                            shipId: selectedShip.id,
                            buyT: Number(tradeT),
                          })
                          .then((r) => {
                            setNotice(
                              `${t.galaxy.hospitalityBought} −${r.paidT.toFixed(1)} ${t.galaxy.tons} ${r.paidResource.replace('_', ' ')}`,
                            );
                            void refreshShips();
                            void api
                              .innateOffers(onSiteAt)
                              .then((rr) => setInnate(rr.offers))
                              .catch(() => undefined);
                          })
                          .catch((err: ApiError) =>
                            setNotice(
                              `${t.galaxy.marketRefused} — ${err.message ?? err.error}`,
                            ),
                          )
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'var(--accent-400)',
                        color: '#0D0D0D',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t.galaxy.hospitalityBuy}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {selectedShip.status === 'hovering' && selectedShip.hoverBodyId && (
            <button
              type="button"
              onClick={() =>
                api
                  .land(selectedShip.id)
                  .then(() => {
                    setNotice(t.galaxy.landed);
                    void refreshShips();
                  })
                  .catch((err: ApiError) =>
                    setNotice(`${t.galaxy.landRefused} — ${err.message ?? err.error}`),
                  )
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--success-500)',
                color: '#0D0D0D',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <ArrowDownToLine size={14} aria-hidden /> {t.galaxy.land}
            </button>
          )}
          {selectedShip.status === 'docked' && (
            <button
              type="button"
              onClick={() =>
                api
                  .undock(selectedShip.id)
                  .then(() => {
                    setNotice(t.galaxy.undocked);
                    void refreshShips();
                  })
                  .catch((err: ApiError) =>
                    setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                  )
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
                background: 'var(--bg-overlay)',
                color: 'var(--text-primary)',
                border: '1px solid var(--stroke-subtle)',
                borderRadius: 'var(--radius-button)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <ArrowUpFromLine size={14} aria-hidden /> {t.galaxy.undock}
            </button>
          )}
          {selectedShip.tankU > 0 &&
            ['docked', 'hovering', 'stranded'].includes(selectedShip.status) &&
            (() => {
              const siteId =
                selectedShip.dockedBodyId ?? selectedShip.hoverBodyId;
              const ownSite =
                !!siteId && bodies.some((b) => b.id === siteId && b.owned);
              if (!ownSite) return null;
              return (
                <button
                  type="button"
                  onClick={() =>
                    api
                      .refuel(selectedShip.id)
                      .then(() => {
                        setNotice(t.galaxy.refueled);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.refuelRefused} — ${err.message ?? err.error}`,
                        ),
                      )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    justifyContent: 'center',
                    background: 'var(--bg-overlay)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--stroke-subtle)',
                    borderRadius: 'var(--radius-button)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <Fuel size={14} aria-hidden /> {t.galaxy.refuel}
                </button>
              );
            })()}
          {selectedShip.tankU > 0 &&
            ['docked', 'hovering', 'idle', 'stranded'].includes(
              selectedShip.status,
            ) &&
            (() => {
              const nearby = ships.filter(
                (s) =>
                  s.id !== selectedShip.id &&
                  s.tankU > 0 &&
                  s.fuelType === selectedShip.fuelType &&
                  ['docked', 'hovering', 'idle', 'stranded'].includes(s.status) &&
                  Math.hypot(s.x - selectedShip.x, s.y - selectedShip.y) <=
                    FUEL_TRANSFER_RADIUS_PC,
              );
              if (nearby.length === 0) return null;
              const target = nearby.some((s) => s.id === transferTo)
                ? transferTo
                : nearby[0]!.id;
              return (
                <section
                  aria-label={t.galaxy.transferFuelTitle}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <strong
                    style={{
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Fuel size={13} aria-hidden /> {t.galaxy.transferFuelTitle}
                  </strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      aria-label={t.galaxy.transferTarget}
                      value={target}
                      onChange={(e) => setTransferTo(e.target.value)}
                      style={{
                        background: 'var(--bg-overlay)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                        maxWidth: 120,
                      }}
                    >
                      {nearby.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={t.galaxy.transferUnits}
                      type="number"
                      min={1}
                      step={1}
                      value={transferUnits}
                      onChange={(e) => setTransferUnits(e.target.value)}
                      style={{
                        width: 58,
                        background: 'var(--bg-overlay)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .transferFuel(selectedShip.id, {
                            toShipId: target,
                            units: Number(transferUnits),
                          })
                          .then(() => {
                            setNotice(t.galaxy.transferDone);
                            void refreshShips();
                          })
                          .catch((err: ApiError) =>
                            setNotice(
                              `${t.galaxy.transferRefused} — ${err.message ?? err.error}`,
                            ),
                          )
                      }
                      style={{
                        background: 'var(--accent-500, #D9CF4A)',
                        color: '#0D0D0D',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t.galaxy.transferDo}
                    </button>
                  </div>
                </section>
              );
            })()}
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
          className="galaxy-panel galaxy-panel--body"
          style={{
            position: 'absolute',
            right: 18,
            top: 18,
            width: 318,
            maxHeight: 'calc(100% - 36px)',
            overflowY: 'auto',
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
                ? ['Planet', selected.size?.toUpperCase(), selected.climate, selected.quality]
                    .filter(Boolean)
                    .join(' · ')
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
          {intel?.kind === 'loading' && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.status.loading}
            </p>
          )}
          {intel?.kind === 'error' && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--danger-500, #F24141)' }}>
              {t.galaxy.intelError}
            </p>
          )}
          {intel?.kind === 'ready' && (
            <section
              aria-label={`${t.galaxy.intelBadge}${intel.data.tier}`}
              style={{ display: 'grid', gap: 8, fontSize: 12 }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  justifySelf: 'start',
                  background: 'var(--primary-600)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-chip)',
                  padding: '2px 10px',
                  fontSize: 11,
                }}
              >
                <Telescope size={12} aria-hidden />
                {intel.data.tier >= 4
                  ? t.galaxy.intelDeepSight
                  : `${t.galaxy.intelBadge}${intel.data.tier}`}
              </span>
              {intel.data.tier >= 2 ? (
                <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: 2 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {t.galaxy.intelDevTitle}
                  </strong>
                  <span>
                    {t.galaxy.intelTiles} : {intel.data.tilesUsed}/{intel.data.tiles} ·{' '}
                    {t.galaxy.intelPop} ~
                    {(intel.data.populationEstimate ?? 0).toLocaleString('en-US')}
                  </span>
                  <span>
                    {intel.data.spaceportOpen === null
                      ? t.galaxy.intelNoSpaceport
                      : intel.data.spaceportOpen
                        ? t.galaxy.intelSpaceportOpen
                        : t.galaxy.intelSpaceportClosed}
                  </span>
                  {(intel.data.marketPairs?.length ?? 0) > 0 && (
                    <span>
                      {t.galaxy.intelMarkets} :{' '}
                      {intel.data.marketPairs!
                        .map((p) => `${p.give}→${p.get}`)
                        .join(', ')}
                    </span>
                  )}
                  {(intel.data.innateOffers?.length ?? 0) > 0 && (
                    <span>
                      {t.galaxy.intelOffers} :{' '}
                      {intel.data.innateOffers!
                        .map((o) => `${o.sell}@${o.price} ${o.want}/T`)
                        .join(', ')}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ color: 'var(--text-disabled)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={11} aria-hidden /> {t.galaxy.intelLockedL2}
                </span>
              )}
              {intel.data.tier >= 3 ? (
                <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: 2 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {t.galaxy.intelStratTitle}
                  </strong>
                  <span>
                    {t.galaxy.intelBuildings} :{' '}
                    {(intel.data.buildings?.length ?? 0) === 0
                      ? '—'
                      : intel.data.buildings!
                          .map((b) => `${b.key} L${b.level} (${b.status})`)
                          .join(', ')}
                  </span>
                  <span
                    style={{
                      color:
                        (intel.data.defenseCount ?? 0) > 0
                          ? 'var(--danger-500, #F24141)'
                          : undefined,
                    }}
                  >
                    {t.galaxy.intelDefenses} : {intel.data.defenseCount ?? 0}
                  </span>
                  <span>
                    {t.galaxy.intelDeposits} :{' '}
                    {(intel.data.depositsPresent?.length ?? 0) === 0
                      ? '—'
                      : intel.data.depositsPresent!.join(', ')}
                  </span>
                </div>
              ) : (
                <span style={{ color: 'var(--text-disabled)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={11} aria-hidden /> {t.galaxy.intelLockedL3}
                </span>
              )}
              {intel.data.tier >= 4 ? (
                <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: 2 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {t.galaxy.intelDeepTitle}
                  </strong>
                  <span>
                    {t.galaxy.intelQuality} : {intel.data.quality ?? '—'}
                  </span>
                  {(intel.data.deposits?.length ?? 0) > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {intel.data.deposits!
                        .map(
                          (d) =>
                            `${d.resource} ${Math.round(d.remainingT)}/${Math.round(d.initialT)} T`,
                        )
                        .join(' · ')}
                    </span>
                  )}
                  <span>
                    {t.galaxy.intelDna} :{' '}
                    {(intel.data.techDna?.available ?? []).join(', ') || '—'}
                  </span>
                </div>
              ) : (
                <span style={{ color: 'var(--text-disabled)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={11} aria-hidden /> {t.galaxy.intelLockedL4}
                </span>
              )}
            </section>
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
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color:
                  selected.climate === 'poison'
                    ? 'var(--danger-500)'
                    : 'var(--accent-200)',
              }}
            >
              {selected.climate === 'poison'
                ? t.galaxy.wildPoison
                : t.galaxy.wildColonizable}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
