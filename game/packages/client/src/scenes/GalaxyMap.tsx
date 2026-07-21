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
  Anchor,
  Lock,
  Shield as ShieldIcon,
  Soup,
  Telescope,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import {
  ALL_RESOURCE_IDS,
  canFitColonyKit,
  COLONY_MIN_SETTLERS,
  containersUsed,
  FUEL_TRANSFER_RADIUS_PC,
  HARVEST_D_MAX_PC,
  harvestYieldPerDay,
  hoverIdleFuelUPerDay,
  HULLS,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import {
  shipRangeRadiiPc,
  telescopeHaloRadiusPc,
} from './rangeOverlays.ts';
import { api, type ApiError, type DerelictView, type GalaxyBody, type JunkFieldView, type ShipView, type StargateView } from '../api.js';
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
  // Niveau de zoom courant (miroir React de camera.zoom) pour les
  // contrôles − / + explicites. La molette ne pilote PLUS le zoom
  // (conflit avec le zoom de page des navigateurs, notamment Edge).
  const [zoomLevel, setZoomLevel] = useState(1);
  const [bodies, setBodies] = useState<GalaxyBody[] | null>(null);
  const [junkFields, setJunkFields] = useState<JunkFieldView[]>([]);
  const [derelicts, setDerelicts] = useState<DerelictView[]>([]);
  const [stargates, setStargates] = useState<StargateView[]>([]);
  const [dumpRes, setDumpRes] = useState('');
  const [dumpTons, setDumpTons] = useState('1');
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
  const [settlerChildren, setSettlerChildren] = useState('40');
  const [settlerActives, setSettlerActives] = useState('120');
  const [settlerSeniors, setSettlerSeniors] = useState('40');
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
  // Halo télescope COSMÉTIQUE (décision 2026-07-20) : sélection d'un
  // monde possédé → lecture du détail (owner-only) → si télescope ACTIF,
  // halo + scanner rotatif au rayon du ciel de CE monde. Le brouillard
  // réel reste l'union serveur de tous les scopes — rien de fonctionnel.
  const [scanHalo, setScanHalo] = useState<{
    x: number;
    y: number;
    radiusPc: number;
  } | null>(null);
  useEffect(() => {
    if (!selected?.owned || selected.bodyType !== 'planet') {
      setScanHalo(null);
      return;
    }
    let cancelled = false;
    api
      .planet(selected.id)
      .then((d) => {
        if (cancelled) return;
        const tele = d.buildings.find(
          (b) => b.key === 'telescope' && b.status === 'active',
        );
        setScanHalo(
          tele
            ? {
                x: selected.x,
                y: selected.y,
                radiusPc: telescopeHaloRadiusPc(tele.level),
              }
            : null,
        );
      })
      .catch(() => !cancelled && setScanHalo(null));
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

  // Formulaire de route (meilleure exécution, GB §13).
  const [routeGive, setRouteGive] = useState('ore');
  const [routeGet, setRouteGet] = useState('water');
  // Jambe d'entrée choisie par carte AMM (clé buildingId:slotIndex).
  const [ammGiveByKey, setAmmGiveByKey] = useState<Record<string, string>>({});
  // Canal manuel (GB §9) : warehouse public browsable À QUAI seulement.
  const [warehouse, setWarehouse] = useState<
    Awaited<ReturnType<typeof api.browseWarehouse>> | null
  >(null);
  const [myOffers, setMyOffers] = useState<
    Awaited<ReturnType<typeof api.myManualOffers>>['offers']
  >([]);
  const [offerGet, setOfferGet] = useState('');
  const [offerGetT, setOfferGetT] = useState('1');
  const [offerGive, setOfferGive] = useState('water');
  const [offerGiveT, setOfferGiveT] = useState('1');
  const refreshManual = (bodyId: string) => {
    api
      .browseWarehouse(bodyId)
      .then((r) => setWarehouse(r))
      .catch(() => setWarehouse(null));
    api
      .myManualOffers()
      .then((r) => setMyOffers(r.offers))
      .catch(() => setMyOffers([]));
  };
  useEffect(() => {
    if (!dockedAt) {
      setWarehouse(null);
      setMyOffers([]);
      return;
    }
    let cancelled = false;
    api
      .browseWarehouse(dockedAt)
      .then((r) => !cancelled && setWarehouse(r))
      .catch(() => !cancelled && setWarehouse(null));
    api
      .myManualOffers()
      .then((r) => !cancelled && setMyOffers(r.offers))
      .catch(() => !cancelled && setMyOffers([]));
    return () => {
      cancelled = true;
    };
  }, [dockedAt]);

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
          setJunkFields((current) =>
            JSON.stringify(current) === JSON.stringify(r.junkFields ?? [])
              ? current
              : (r.junkFields ?? []),
          );
          setDerelicts((current) =>
            JSON.stringify(current) === JSON.stringify(r.derelicts ?? [])
              ? current
              : (r.derelicts ?? []),
          );
          setStargates((current) =>
            JSON.stringify(current) === JSON.stringify(r.stargates ?? [])
              ? current
              : (r.stargates ?? []),
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
    // Zoom molette RETIRÉ volontairement : les navigateurs (Edge en tête)
    // détournent la molette pour le zoom de page — conflit ingérable. Le
    // zoom passe désormais par les boutons − / + et le clavier.
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
        setZoomLevel(camera.zoom);
      } else if (event.key === '-' || event.key === '_') {
        camera.zoom = Math.max(0.15, camera.zoom * 0.9);
        camera.updateProjectionMatrix();
        setZoomLevel(camera.zoom);
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
      // Scanner du halo télescope (cosmétique) : rotation continue du
      // secteur — retrouvé par nom, l'objet vit dans un effet séparé.
      const scanSweep = scene.getObjectByName('tele-scan-sweep');
      if (scanSweep && !reduceMotion) scanSweep.rotation.z = -elapsed * 0.8;
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

  // Halo télescope + scanner rotatif (cosmétique — décision 2026-07-20).
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !scanHalo) return;
    const { scene } = refs;
    const r = scanHalo.radiusPc;
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      disposables.push(geo, mat);
      return new THREE.Mesh(geo, mat);
    };
    // Voile discret + liseré : « subtil mais visible ».
    const fill = mk(
      new THREE.CircleGeometry(r, 96),
      new THREE.MeshBasicMaterial({
        color: 0x6e96e8,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      }),
    );
    const rim = mk(
      new THREE.RingGeometry(r * 0.985, r, 96),
      new THREE.MeshBasicMaterial({
        color: 0x8fb2f2,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    // Secteur de balayage (rotation dans la boucle de rendu par nom).
    const sweep = mk(
      new THREE.CircleGeometry(r, 48, 0, Math.PI / 6),
      new THREE.MeshBasicMaterial({
        color: 0x9dbcff,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    sweep.name = 'tele-scan-sweep';
    for (const [obj, z] of [
      [fill, 0.4],
      [rim, 0.5],
      [sweep, 0.45],
    ] as const) {
      obj.position.set(scanHalo.x, scanHalo.y, z);
      scene.add(obj);
    }
    return () => {
      scene.remove(fill, rim, sweep);
      disposables.forEach((d) => d.dispose());
    };
  }, [scanHalo, bodies]);

  // Cercles d'autonomie du vaisseau sélectionné (décision 2026-07-20) :
  // pointillés ROUGE = panne sèche (0,95 × autonomie), VERT =
  // aller-retour (0,45 ×). personal/probe : pas de conso → pas de cercle.
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !selectedShip) return;
    const hull =
      HULLS[
        `${selectedShip.hullCategory}_${selectedShip.hullSize}` as `${HullCategory}_${HullSize}`
      ];
    // W1 multi-fuel : l'autonomie compte TOUS les slots du réservoir.
    const fuelUnits = Object.values(selectedShip.fuel).reduce(
      (s, v) => s + Math.max(0, v ?? 0),
      0,
    );
    const radii = shipRangeRadiiPc(fuelUnits, hull?.burnUPerPc ?? 0);
    if (!radii) return;
    const { scene } = refs;
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
    const circle = (radius: number, color: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0),
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        dashSize: Math.max(2, radius * 0.03),
        gapSize: Math.max(1.4, radius * 0.02),
        depthWrite: false,
      });
      disposables.push(geo, mat);
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      line.position.set(selectedShip.x, selectedShip.y, 0.6);
      return line;
    };
    const maxLine = circle(radii.oneWay, 0xf24141);
    const returnLine = circle(radii.roundTrip, 0x2fb544);
    scene.add(maxLine, returnLine);
    return () => {
      scene.remove(maxLine, returnLine);
      disposables.forEach((d) => d.dispose());
    };
  }, [selectedShip, bodies]);

  // Pilote le zoom depuis les contrôles − / + et le curseur : agit sur la
  // caméra LIVE (sceneRef, même objet que la boucle de rendu) et met à jour
  // le miroir React. Bornes identiques au clavier (0.15 – 8).
  const ZOOM_MIN = 0.15;
  const ZOOM_MAX = 8;
  const applyZoom = (next: number) => {
    const cam = sceneRef.current?.camera;
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    setZoomLevel(clamped);
    if (cam) {
      cam.zoom = clamped;
      cam.updateProjectionMatrix();
    }
  };

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
        <span>Drag to pan · zoom with the controls</span>
      </div>
      <div className="galaxy-zoom" role="group" aria-label="Galaxy zoom">
        <button
          type="button"
          className="galaxy-zoom__btn"
          aria-label="Zoom out"
          onClick={() => applyZoom(zoomLevel * 0.8)}
        >
          −
        </button>
        <input
          className="galaxy-zoom__slider"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={zoomLevel}
          aria-label="Zoom level"
          onChange={(e) => applyZoom(Number(e.target.value))}
        />
        <button
          type="button"
          className="galaxy-zoom__btn"
          aria-label="Zoom in"
          onClick={() => applyZoom(zoomLevel * 1.25)}
        >
          +
        </button>
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
            } else if (kind === 'wreck' && !targeting) {
              // Radar d'épaves : l'option localise (les coordonnées sont
              // dans le libellé du panneau vaisseau le plus proche) — la
              // réclamation se fait DEPUIS une coque à ≤ 1 pc.
              setSelected(null);
              setSelectedShip(null);
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
          {!targeting && derelicts.length > 0 && (
            <optgroup label="Wrecks">
              {derelicts.map((wreck) => (
                <option key={wreck.id} value={`wreck:${wreck.id}`}>
                  {wreck.name} († {wreck.hullCategory} {wreck.hullSize ?? ''})
                </option>
              ))}
            </optgroup>
          )}
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
              {selectedShip.fuelRatePerDay > 0 ? (
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--success-500, #238C33)' }}>
                  +{selectedShip.fuelRatePerDay.toFixed(1)} {t.galaxy.fuelPerDay} · {t.galaxy.harvesting}
                </span>
              ) : selectedShip.fuelRatePerDay < 0 ? (
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
          {!['personal', 'probe'].includes(selectedShip.hullCategory) && (
            <details
              style={{
                background: 'var(--bg-overlay)',
                borderRadius: 'var(--radius-card-sm, 10px)',
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <summary style={{ cursor: 'pointer', color: 'var(--text-primary)' }}>
                {t.galaxy.autoTradeTitle}
              </summary>
              <p style={{ margin: '6px 0', color: 'var(--text-secondary)' }}>
                {t.galaxy.autoTradeHint}
              </p>
              <form
                style={{ display: 'grid', gap: 6 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const rules: { resource: string; belowT: number; buyT: number }[] = [];
                  for (let i = 0; i < 3; i++) {
                    const res = String(data.get(`atRes${i}`) ?? '');
                    const below = Number(data.get(`atBelow${i}`) ?? 0);
                    const buy = Number(data.get(`atBuy${i}`) ?? 0);
                    if (res && buy > 0) rules.push({ resource: res, belowT: below, buyT: buy });
                  }
                  api
                    .setAutoTrade(selectedShip.id, rules)
                    .then(() => {
                      setNotice(t.galaxy.autoTradeApplied);
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.autoTradeRefused} — ${err.message ?? err.error}`,
                      ),
                    );
                }}
              >
                {[0, 1, 2].map((i) => {
                  const rule = selectedShip.autoTrade[i];
                  return (
                    <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select
                        aria-label={`Auto-trade resource ${i + 1}`}
                        name={`atRes${i}`}
                        defaultValue={rule?.resource ?? ''}
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
                        <option value="">—</option>
                        {ALL_RESOURCE_IDS.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Auto-trade below ${i + 1}`}
                        name={`atBelow${i}`}
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={rule?.belowT ?? ''}
                        placeholder="below T"
                        style={{
                          width: 70,
                          background: 'var(--bg-overlay)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 6px',
                          fontSize: 12,
                        }}
                      />
                      <input
                        aria-label={`Auto-trade buy ${i + 1}`}
                        name={`atBuy${i}`}
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={rule?.buyT ?? ''}
                        placeholder="buy T"
                        style={{
                          width: 70,
                          background: 'var(--bg-overlay)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '4px 6px',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  );
                })}
                <button
                  type="submit"
                  style={{
                    background: 'var(--bg-overlay)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--stroke-subtle)',
                    borderRadius: 'var(--radius-button)',
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    justifySelf: 'start',
                  }}
                >
                  {t.galaxy.autoTradeApply}
                </button>
              </form>
            </details>
          )}
          {selectedShip.hull.maxHp > 0 && (
            <section
              aria-label={t.galaxy.hullTitle}
              style={{
                display: 'grid',
                gap: 4,
                background: 'var(--bg-overlay)',
                borderRadius: 'var(--radius-card-sm, 10px)',
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldIcon size={14} aria-hidden />
                <strong>
                  {t.galaxy.hullTitle} — {selectedShip.hull.hp.toFixed(1)}/
                  {selectedShip.hull.maxHp} HP
                </strong>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--bg-sunken, #101018)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (selectedShip.hull.hp / selectedShip.hull.maxHp) * 100)}%`,
                    height: '100%',
                    background:
                      selectedShip.hull.wearPerDay > 0
                        ? 'var(--danger-500, #F24141)'
                        : 'var(--success-500, #238C33)',
                  }}
                />
              </div>
              {selectedShip.hull.wearPerDay > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--warning-400, #D9CF4A)',
                  }}
                >
                  −{selectedShip.hull.wearPerDay.toFixed(1)} HP/day ·{' '}
                  {t.galaxy.hullWearing}
                </span>
              )}
              {selectedShip.hull.wearPerDay < 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--success-500, #238C33)',
                  }}
                >
                  +{(-selectedShip.hull.wearPerDay).toFixed(1)} HP/day ·{' '}
                  {t.galaxy.hullRepairing}
                </span>
              )}
            </section>
          )}
          {['cargo', 'combat'].includes(selectedShip.hullCategory) &&
            selectedShip.crewCount === 0 &&
            (() => {
              // Tout hull équipable embarque un pilote libre (les coques
              // civiles ont le leur dans la section settlers) — l'horloge
              // de survie (GB §6) suit l'équipage.
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
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                      )
                  }
                  style={{
                    background: 'var(--bg-overlay)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--stroke-subtle)',
                    borderRadius: 'var(--radius-button)',
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    justifySelf: 'start',
                  }}
                >
                  {t.galaxy.assignPilot} ({freePilot.rarity})
                </button>
              ) : null;
            })()}
          {selectedShip.hullCategory === 'probe' &&
            ['hovering', 'idle'].includes(selectedShip.status) && (
              <button
                type="button"
                onClick={() =>
                  api
                    .scoopProbe(selectedShip.id)
                    .then((r) => {
                      setNotice(
                        r.destroyed
                          ? t.galaxy.scoopDestroyed
                          : `${t.galaxy.scooped} (${r.hp} HP)`,
                      );
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.scoopRefused} — ${err.message ?? err.error}`,
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
                <Fuel size={14} aria-hidden /> {t.galaxy.scoopStar}
              </button>
            )}
          {selectedShip.crewCount > 0 && (
            <section
              aria-label={t.galaxy.survivalTitle}
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
                <Users size={13} aria-hidden /> {t.galaxy.survivalTitle} —{' '}
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {selectedShip.crewCount} crew · {selectedShip.survival.food.toFixed(2)}{' '}
                  food / {selectedShip.survival.water.toFixed(2)} water T{' '}
                  {t.galaxy.survivalStores}
                </span>
              </strong>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {selectedShip.survival.ratePerDay < 0
                  ? `${selectedShip.survival.ratePerDay.toFixed(2)} T/d · ${t.galaxy.survivalDraining}`
                  : t.galaxy.survivalIdle}
              </span>
              <span
                style={{
                  color: selectedShip.fleeArmed
                    ? 'var(--success-500, #238C33)'
                    : 'var(--danger-300, #F24141)',
                }}
              >
                {selectedShip.fleeArmed ? t.galaxy.fleeArmed : t.galaxy.fleeDisarmed}
              </span>
              <button
                type="button"
                onClick={() =>
                  api
                    .setFleePolicy(selectedShip.id, !selectedShip.fleeArmed)
                    .then(() => {
                      setNotice(t.galaxy.fleeUpdated);
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(`${t.errors.generic} ${err.message ?? ''}`),
                    )
                }
                style={{
                  background: 'var(--bg-overlay)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--stroke-subtle)',
                  borderRadius: 'var(--radius-button)',
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  justifySelf: 'start',
                }}
              >
                {selectedShip.fleeArmed
                  ? t.galaxy.fleeToggleDisarm
                  : t.galaxy.fleeToggleArm}
              </button>
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
              {['hovering', 'idle', 'stranded'].includes(selectedShip.status) &&
                Object.keys(selectedShip.cargo).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      aria-label="Dump resource"
                      value={dumpRes}
                      onChange={(e) => setDumpRes(e.target.value)}
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
                      {Object.keys(selectedShip.cargo).map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Dump tons"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={dumpTons}
                      onChange={(e) => setDumpTons(e.target.value)}
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
                          .dump(
                            selectedShip.id,
                            dumpRes || Object.keys(selectedShip.cargo)[0]!,
                            Number(dumpTons),
                          )
                          .then((r) => {
                            setNotice(r.sunk ? t.galaxy.dumpedSunk : t.galaxy.dumped);
                            void refreshShips();
                          })
                          .catch((err: ApiError) =>
                            setNotice(
                              `${t.galaxy.dumpRefused} — ${err.message ?? err.error}`,
                            ),
                          )
                      }
                      style={{
                        background: 'var(--bg-overlay)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t.galaxy.dump}
                    </button>
                  </div>
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
                m.slots.map((s) => {
                  if ('mode' in s) {
                    // Pool AMM (GB §13) : jambe au choix, produit constant.
                    const key = `${m.buildingId}:${s.slotIndex}`;
                    const give = ammGiveByKey[key] ?? s.x;
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'grid',
                          gap: 4,
                          background: 'var(--bg-overlay)',
                          borderRadius: 'var(--radius-button)',
                          padding: 8,
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          AMM {s.x.replace('_', ' ')} ⇄ {s.y.replace('_', ' ')} ·{' '}
                          {s.rx}/{s.ry} {t.galaxy.tons} · spot {s.spot} ·{' '}
                          {s.lpFeeBp}+{s.houseFeeBp} bp
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            aria-label={`${t.galaxy.ammGiveLeg} ${s.x} ${s.y}`}
                            value={give}
                            onChange={(e) =>
                              setAmmGiveByKey((cur) => ({
                                ...cur,
                                [key]: e.target.value,
                              }))
                            }
                            style={{
                              background: 'var(--bg-raised)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--stroke-subtle)',
                              borderRadius: 'var(--radius-button)',
                              padding: '4px 6px',
                              fontSize: 12,
                            }}
                          >
                            {[s.x, s.y].map((r) => (
                              <option key={r} value={r}>
                                {r.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`${t.galaxy.ammTrade} ${s.x} ${s.y}`}
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
                                .ammTrade(m.buildingId, {
                                  slotIndex: s.slotIndex,
                                  shipId: selectedShip.id,
                                  give,
                                  giveT: Number(tradeT),
                                })
                                .then((r) => {
                                  setNotice(
                                    `${t.galaxy.marketTraded} +${r.gotT.toFixed(2)} ${t.galaxy.tons} ${r.gotResource.replace('_', ' ')} · spot ${r.spotAfter.toFixed(3)}`,
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
                            {t.galaxy.ammTrade}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
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
                      {s.give.replace('_', ' ')} → {s.get.replace('_', ' ')} @{' '}
                      {s.rate}
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
                  );
                }),
              )}
              {markets.some((m) => m.slots.some((s) => 'mode' in s)) && (
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-button)',
                    padding: 8,
                  }}
                >
                  <span style={{ color: 'var(--accent-200)', fontSize: 12 }}>
                    {t.galaxy.routeTitle}
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      aria-label={t.galaxy.ammGiveLeg}
                      value={routeGive}
                      onChange={(e) => setRouteGive(e.target.value)}
                      style={{
                        background: 'var(--bg-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                      }}
                    >
                      {ALL_RESOURCE_IDS.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t.galaxy.routeGet}
                      value={routeGet}
                      onChange={(e) => setRouteGet(e.target.value)}
                      style={{
                        background: 'var(--bg-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--stroke-subtle)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 6px',
                        fontSize: 12,
                      }}
                    >
                      {ALL_RESOURCE_IDS.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${t.galaxy.routeGo} ${t.galaxy.tons}`}
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
                          .ammRoute(selectedShip.dockedBodyId!, {
                            shipId: selectedShip.id,
                            give: routeGive,
                            get: routeGet,
                            giveT: Number(tradeT),
                          })
                          .then((r) => {
                            setNotice(
                              `${t.galaxy.routeDone} — +${r.gotT.toFixed(2)} ${t.galaxy.tons} ${r.gotResource.replace('_', ' ')} (${
                                r.midResource
                                  ? `${t.galaxy.routeVia} ${r.midResource.replace('_', ' ')}, ${r.legs.length}× frais`
                                  : t.galaxy.routeDirect
                              })`,
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
                        background: 'var(--accent-400)',
                        color: '#0D0D0D',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t.galaxy.routeGo}
                    </button>
                  </div>
                </div>
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
              <span
                role="group"
                aria-label={`${t.galaxy.settlersManifest}: C ${selectedShip.settlerManifest.children}, A ${selectedShip.settlerManifest.actives}, S ${selectedShip.settlerManifest.seniors}`}
                style={{
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: 5,
                }}
              >
                <span>{t.galaxy.settlersManifest}</span>
                <span>· C {selectedShip.settlerManifest.children}</span>
                <span>· A {selectedShip.settlerManifest.actives}</span>
                <span>· S {selectedShip.settlerManifest.seniors}</span>
              </span>
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
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[
                          {
                            key: 'children',
                            short: 'C',
                            label: t.planet.statsChildren,
                            value: settlerChildren,
                            set: setSettlerChildren,
                          },
                          {
                            key: 'actives',
                            short: 'A',
                            label: t.planet.statsActives,
                            value: settlerActives,
                            set: setSettlerActives,
                          },
                          {
                            key: 'seniors',
                            short: 'S',
                            label: t.planet.statsSeniors,
                            value: settlerSeniors,
                            set: setSettlerSeniors,
                          },
                        ].map((cohort) => (
                          <label
                            key={cohort.key}
                            style={{ display: 'grid', gap: 2, fontSize: 10 }}
                          >
                            <span>{cohort.short} · {cohort.label}</span>
                            <input
                              aria-label={`${t.galaxy.settlersLabel} — ${cohort.label}`}
                              type="number"
                              min={0}
                              step={1}
                              value={cohort.value}
                              onChange={(e) => cohort.set(e.target.value)}
                              style={{
                                width: 72,
                                background: 'var(--bg-raised)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--stroke-subtle)',
                                borderRadius: 'var(--radius-button)',
                                padding: '4px 6px',
                                fontSize: 12,
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(['embark', 'disembark'] as const).map((direction) => (
                        <button
                          key={direction}
                          type="button"
                          onClick={() =>
                            api
                              .transferSettlers(selectedShip.id, {
                                children: Number(settlerChildren),
                                actives: Number(settlerActives),
                                seniors: Number(settlerSeniors),
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
          {dockedAt &&
            warehouse &&
            warehouse.public &&
            !bodies.find((b) => b.id === dockedAt)?.owned && (
              <section
                aria-label={t.galaxy.warehouseTitle}
                style={{ display: 'grid', gap: 6, fontSize: 12 }}
              >
                <strong style={{ color: 'var(--accent-200)' }}>
                  {t.galaxy.warehouseTitle}
                </strong>
                <div
                  style={{
                    display: 'grid',
                    gap: 2,
                    maxHeight: 120,
                    overflowY: 'auto',
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-button)',
                    padding: 8,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {warehouse.stock.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {t.galaxy.warehouseEmpty}
                    </span>
                  )}
                  {warehouse.stock.map((s) => (
                    <span key={s.resource}>
                      {s.resource.replace('_', ' ')} · {s.amountT} {t.galaxy.tons}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 2, flex: 1 }}>
                      <span>{t.galaxy.offerGet}</span>
                      <select
                        aria-label={t.galaxy.offerGet}
                        value={offerGet}
                        onChange={(e) => setOfferGet(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">—</option>
                        {warehouse.stock.map((s) => (
                          <option key={s.resource} value={s.resource}>
                            {s.resource.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 2, width: 72 }}>
                      <span>{t.galaxy.tons}</span>
                      <input
                        aria-label={`${t.galaxy.offerGet} ${t.galaxy.tons}`}
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={offerGetT}
                        onChange={(e) => setOfferGetT(e.target.value)}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 2, flex: 1 }}>
                      <span>{t.galaxy.offerGive}</span>
                      <select
                        aria-label={t.galaxy.offerGive}
                        value={offerGive}
                        onChange={(e) => setOfferGive(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        {ALL_RESOURCE_IDS.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 2, width: 72 }}>
                      <span>{t.galaxy.tons}</span>
                      <input
                        aria-label={`${t.galaxy.offerGive} ${t.galaxy.tons}`}
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={offerGiveT}
                        onChange={(e) => setOfferGiveT(e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!offerGet}
                    onClick={() =>
                      api
                        .createManualOffer(dockedAt, {
                          getResource: offerGet,
                          getTons: Number(offerGetT),
                          giveResource: offerGive,
                          giveTons: Number(offerGiveT),
                        })
                        .then(() => {
                          setNotice(t.galaxy.offerSent);
                          refreshManual(dockedAt);
                        })
                        .catch((err: ApiError) =>
                          setNotice(
                            `${t.galaxy.offerRefused} — ${err.message ?? err.error}`,
                          ),
                        )
                    }
                    style={{
                      background: offerGet ? 'var(--accent-400)' : 'var(--bg-overlay)',
                      color: offerGet ? '#0D0D0D' : 'var(--text-disabled)',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      padding: '6px 10px',
                      cursor: offerGet ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {t.galaxy.offerSend}
                  </button>
                </div>
                {myOffers
                  .filter((o) => o.bodyId === dockedAt && o.status === 'open')
                  .map((o) => (
                    <div
                      key={o.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        background: 'var(--bg-overlay)',
                        borderRadius: 'var(--radius-button)',
                        padding: '4px 8px',
                      }}
                    >
                      <span>
                        {o.getTons} {t.galaxy.tons} {o.getResource.replace('_', ' ')} ←{' '}
                        {o.giveTons} {t.galaxy.tons} {o.giveResource.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        aria-label={`${t.galaxy.offerCancel} ${o.getResource}`}
                        onClick={() =>
                          api
                            .cancelManualOffer(o.id)
                            .then(() => refreshManual(dockedAt))
                            .catch(() => undefined)
                        }
                        style={{
                          background: 'transparent',
                          color: 'var(--danger-300, #F24141)',
                          border: '1px solid var(--stroke-subtle)',
                          borderRadius: 'var(--radius-button)',
                          padding: '2px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {t.galaxy.offerCancel}
                      </button>
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
          {(() => {
            const cellOf = (v: number) => Math.floor(v / 0.5);
            const field = junkFields.find(
              (f) =>
                cellOf(f.x) === cellOf(selectedShip.x) &&
                cellOf(f.y) === cellOf(selectedShip.y),
            );
            if (!field || !['hovering', 'idle', 'stranded'].includes(selectedShip.status))
              return null;
            return (
              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  background: 'var(--bg-overlay)',
                  borderRadius: 'var(--radius-card-sm, 10px)',
                  padding: '8px 10px',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--warning-400, #D9CF4A)' }}>
                  {t.galaxy.junkFieldHere} — {field.amountT.toFixed(1)} T ·{' '}
                  {t.galaxy.junkHazard} −{(field.amountT * 0.5).toFixed(1)} HP/day
                </span>
                {selectedShip.junkCollector && (
                  <button
                    type="button"
                    onClick={() =>
                      api
                        .collectJunk(selectedShip.id)
                        .then(() => {
                          setNotice(t.galaxy.junkCollected);
                          void refreshShips();
                        })
                        .catch((err: ApiError) =>
                          setNotice(
                            `${t.galaxy.collectRefused} — ${err.message ?? err.error}`,
                          ),
                        )
                    }
                    style={{
                      background: 'var(--success-500)',
                      color: '#0D0D0D',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      justifySelf: 'start',
                    }}
                  >
                    {t.galaxy.collectJunk}
                  </button>
                )}
              </div>
            );
          })()}
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
          {selectedShip.status === 'docked' &&
            !['personal', 'probe'].includes(selectedShip.hullCategory) &&
            selectedShip.dockedBodyId &&
            bodies.some(
              (b) => b.id === selectedShip.dockedBodyId && b.owned,
            ) && (
              <button
                type="button"
                onClick={() =>
                  api
                    .warehouse(selectedShip.id)
                    .then(() => {
                      setNotice(t.galaxy.warehouseDone);
                      void refreshShips();
                      void refreshNpcs(); // l'équipage LIBÉRÉ redevient assignable
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.warehouseRefused} — ${err.message ?? err.error}`,
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
                <WarehouseIcon size={14} aria-hidden /> {t.galaxy.warehouseAction}
              </button>
            )}
          {selectedShip.status === 'warehoused' &&
            (selectedShip.retrievesAt ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--warning-500)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              >
                {t.galaxy.retrieving} —{' '}
                {new Date(selectedShip.retrievesAt).toLocaleTimeString('en-US')}
              </p>
            ) : (
              <>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                >
                  {t.galaxy.warehousedHint}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    api
                      .retrieve(selectedShip.id)
                      .then(() => {
                        setNotice(t.galaxy.retrieveStarted);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.retrieveRefused} — ${err.message ?? err.error}`,
                        ),
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
                  <WarehouseIcon size={14} aria-hidden /> {t.galaxy.retrieve}
                </button>
              </>
            ))}
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
          {selectedShip.crewCount > 0 &&
            !['personal', 'probe'].includes(selectedShip.hullCategory) &&
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
                      .provision(selectedShip.id)
                      .then(() => {
                        setNotice(t.galaxy.provisioned);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.provisionRefused} — ${err.message ?? err.error}`,
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
                  <Soup size={14} aria-hidden /> {t.galaxy.provision}
                </button>
              );
            })()}
          {selectedShip.status === 'docked' &&
            !selectedShip.harvestRig &&
            !['personal', 'probe'].includes(selectedShip.hullCategory) &&
            selectedShip.dockedBodyId &&
            bodies.some(
              (b) => b.id === selectedShip.dockedBodyId && b.owned,
            ) && (
              <button
                type="button"
                onClick={() =>
                  api
                    .fitHarvestRig(selectedShip.id)
                    .then(() => {
                      setNotice(t.galaxy.rigFitted);
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.rigRefused} — ${err.message ?? err.error}`,
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
                <Sun size={14} aria-hidden /> {t.galaxy.fitHarvestRig}
              </button>
            )}
          {selectedShip.status === 'docked' &&
            selectedShip.hullCategory !== 'probe' &&
            selectedShip.dockedBodyId &&
            bodies.some(
              (b) => b.id === selectedShip.dockedBodyId && b.owned,
            ) &&
            (
              [
                ['hot', t.galaxy.fitShieldHot],
                ['cold', t.galaxy.fitShieldCold],
                ['radio', t.galaxy.fitShieldRadio],
              ] as const
            )
              .filter(([kind]) => !selectedShip.shields[kind])
              .map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    api
                      .fitShield(selectedShip.id, kind)
                      .then(() => {
                        setNotice(t.galaxy.shieldFitted);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.shieldRefused} — ${err.message ?? err.error}`,
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
                  <ShieldIcon size={14} aria-hidden /> {label}
                </button>
              ))}
          {selectedShip.status === 'docked' &&
            !selectedShip.junkCollector &&
            !['personal', 'probe'].includes(selectedShip.hullCategory) &&
            selectedShip.dockedBodyId &&
            bodies.some(
              (b) => b.id === selectedShip.dockedBodyId && b.owned,
            ) && (
              <button
                type="button"
                onClick={() =>
                  api
                    .fitJunkCollector(selectedShip.id)
                    .then(() => {
                      setNotice(t.galaxy.collectorFitted);
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.collectorRefused} — ${err.message ?? err.error}`,
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
                <Package size={14} aria-hidden /> {t.galaxy.fitJunkCollector}
              </button>
            )}
          {selectedShip.status === 'docked' &&
            !selectedShip.claimRig &&
            !['personal', 'probe'].includes(selectedShip.hullCategory) &&
            selectedShip.dockedBodyId &&
            bodies.some(
              (b) => b.id === selectedShip.dockedBodyId && b.owned,
            ) && (
              <button
                type="button"
                onClick={() =>
                  api
                    .fitClaimRig(selectedShip.id)
                    .then(() => {
                      setNotice(t.galaxy.claimRigFitted);
                      void refreshShips();
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.claimRigRefused} — ${err.message ?? err.error}`,
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
                <Anchor size={14} aria-hidden /> {t.galaxy.fitClaimRig}
              </button>
            )}
          {selectedShip.status === 'idle' &&
            selectedShip.harvestRig &&
            !selectedShip.harvestingStarId &&
            (() => {
              const near = bodies
                .filter((b) => b.bodyType === 'star')
                .map((b) => ({
                  b,
                  d: Math.hypot(b.x - selectedShip.x, b.y - selectedShip.y),
                }))
                .filter(({ d }) => d < HARVEST_D_MAX_PC)
                .sort((a, z) => a.d - z.d)[0];
              if (!near) return null;
              const preview =
                harvestYieldPerDay(near.d) -
                hoverIdleFuelUPerDay(
                  selectedShip.hullCategory,
                  selectedShip.hullSize,
                );
              return (
                <button
                  type="button"
                  onClick={() =>
                    api
                      .startHarvest(selectedShip.id, near.b.id)
                      .then(() => {
                        setNotice(t.galaxy.harvestStarted);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.harvestRefused} — ${err.message ?? err.error}`,
                        ),
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
                  <Sun size={14} aria-hidden /> {t.galaxy.harvest} {near.b.name} (
                  {preview > 0 ? `+${preview.toFixed(1)}` : '—'} u/day)
                </button>
              );
            })()}
          {['hovering', 'idle'].includes(selectedShip.status) &&
            selectedShip.claimRig &&
            !selectedShip.claimingTargetId &&
            (() => {
              const near = derelicts
                .map((w) => ({
                  w,
                  d: Math.hypot(w.x - selectedShip.x, w.y - selectedShip.y),
                }))
                .filter(({ d }) => d <= 1)
                .sort((a, z) => a.d - z.d)[0];
              if (!near) return null;
              return (
                <button
                  type="button"
                  onClick={() =>
                    api
                      .claim(selectedShip.id, near.w.id)
                      .then(() => {
                        setNotice(t.galaxy.claimStarted);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.claimRefused} — ${err.message ?? err.error}`,
                        ),
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
                  <Anchor size={14} aria-hidden /> {t.galaxy.claim} {near.w.name}
                </button>
              );
            })()}
          {selectedShip.claimingTargetId && selectedShip.claimsAt && (
            <p
              style={{
                margin: 0,
                color: 'var(--warning-500)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
            >
              {t.galaxy.claiming} —{' '}
              {new Date(selectedShip.claimsAt).toLocaleTimeString('en-US')}
            </p>
          )}
          {['docked', 'hovering'].includes(selectedShip.status) &&
            (() => {
              const at = selectedShip.dockedBodyId ?? selectedShip.hoverBodyId;
              if (!at) return null;
              const gate = stargates.find(
                (g) =>
                  g.status === 'active' &&
                  (g.aBodyId === at || g.bBodyId === at),
              );
              if (!gate) return null;
              const destId = gate.aBodyId === at ? gate.bBodyId : gate.aBodyId;
              const destName =
                bodies.find((b) => b.id === destId)?.name ?? 'the far side';
              return (
                <button
                  type="button"
                  onClick={() =>
                    api
                      .traverse(selectedShip.id, gate.id)
                      .then(() => {
                        setNotice(t.galaxy.traversed);
                        void refreshShips();
                      })
                      .catch((err: ApiError) =>
                        setNotice(
                          `${t.galaxy.traverseRefused} — ${err.message ?? err.error}`,
                        ),
                      )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    justifyContent: 'center',
                    background: 'var(--accent-500, #23468C)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <Telescope size={14} aria-hidden /> {t.galaxy.traverse} →{' '}
                  {destName}
                  {gate.tollResource && gate.ownerId !== undefined
                    ? ` (${t.galaxy.gateToll} ${gate.tollAmount} ${gate.tollResource.replace('_', ' ')})`
                    : ''}
                </button>
              );
            })()}
          {selectedShip.harvestingStarId && (
            <button
              type="button"
              onClick={() =>
                api
                  .stopHarvest(selectedShip.id)
                  .then(() => {
                    setNotice(t.galaxy.harvestStopped);
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
              <Sun size={14} aria-hidden /> {t.galaxy.harvestStop}
            </button>
          )}
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
          {selected.bodyType === 'star' && selected.flaring && (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: '#ffd7d7',
                background: 'var(--danger-700, #7f1d1d)',
                borderRadius: 'var(--radius-chip)',
                padding: '4px 10px',
              }}
            >
              {t.galaxy.flaring}
            </p>
          )}
          {selected.bodyType === 'planet' && selected.annihilated && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t.galaxy.annihilatedWorld}
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
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.galaxy.intelDeaths} :{' '}
                    {Math.round(intel.data.demographicHistory?.deaths.children ?? 0)}/
                    {Math.round(intel.data.demographicHistory?.deaths.actives ?? 0)}/
                    {Math.round(intel.data.demographicHistory?.deaths.seniors ?? 0)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.galaxy.intelExodus} :{' '}
                    {Math.round(intel.data.demographicHistory?.exodus.children ?? 0)}/
                    {Math.round(intel.data.demographicHistory?.exodus.actives ?? 0)}/
                    {Math.round(intel.data.demographicHistory?.exodus.seniors ?? 0)}
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
            <div style={{ display: 'grid', gap: 6 }}>
              {/* Refonte sondes (2026-07-20) : build → survol du monde ;
                  envoi = PREMIÈRE sonde disponible. */}
              <button
                type="button"
                onClick={() => {
                  void api
                    .buildProbe(selected.id)
                    .then(() => {
                      setNotice(t.galaxy.probeBuilt);
                      void api.fleet().then((r) => setShips(r.ships));
                    })
                    .catch((err: ApiError) =>
                      setNotice(
                        `${t.galaxy.probeBuildFailed} — ${err.message ?? err.error}`,
                      ),
                    );
                }}
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
                <Radar size={14} aria-hidden /> {t.galaxy.buildProbe}
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  ({ships.filter(
                    (s) =>
                      s.hullCategory === 'probe' &&
                      s.status === 'hovering' &&
                      s.hoverBodyId === selected.id,
                  ).length}{' '}
                  {t.galaxy.probesHovering})
                </span>
              </button>
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
            </div>
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
