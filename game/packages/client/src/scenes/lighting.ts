/**
 * Passe de lumière 2D WebGL — exigence moteur ASSET_PIPELINE §3 :
 * chaque sprite a `X.bump.gif` (relief) et `X.light.gif` (sources
 * émissives : pixels blancs, intensité = luminosité).
 *
 * v1 de la passe (micro-prototype validant le choix PixiJS, P0.4) :
 * 1. PROPAGATION : les sources des light maps deviennent des halos
 *    ADDITIFS qui débordent sur le terrain et les sprites voisins ;
 * 2. RELIEF : un filtre WebGL par bâtiment échantillonne sa bump map
 *    (normale par gradient) et l'éclaire par les sources voisines
 *    (jusqu'à 4, coordonnées UV locales) + une lumière ambiante.
 * Référence d'acceptation : docs/design/prototypes/06.
 */
import { Filter, GlProgram, Sprite, Texture } from 'pixi.js';

export interface LightSource {
  /** Position en coordonnées locales du sprite (0..1 en UV). */
  u: number;
  v: number;
  /** Intensité 0..1 (luminosité × alpha de la light map). */
  intensity: number;
  /** Couleur RGB (0..1). */
  color: [number, number, number];
}

/**
 * Extrait les sources émissives d'une light map (canvas décodé).
 * Binning en cellules 16 px puis fusion : ≤ maxLights sources.
 */
export function extractLights(
  canvas: HTMLCanvasElement,
  maxLights = 3,
): LightSource[] {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return [];
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const CELL = 16;
  const cells = new Map<
    string,
    { x: number; y: number; w: number; r: number; g: number; b: number }
  >();
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]! / 255;
      if (a < 0.1) continue;
      const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / (3 * 255);
      const w = lum * a;
      if (w < 0.35) continue;
      const key = `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
      const cell = cells.get(key) ?? { x: 0, y: 0, w: 0, r: 0, g: 0, b: 0 };
      cell.x += x * w;
      cell.y += y * w;
      cell.w += w;
      cell.r += (data[i]! / 255) * w;
      cell.g += (data[i + 1]! / 255) * w;
      cell.b += (data[i + 2]! / 255) * w;
      cells.set(key, cell);
    }
  }
  return [...cells.values()]
    .sort((a, b) => b.w - a.w)
    .slice(0, maxLights)
    .map((c) => ({
      u: c.x / c.w / width,
      v: c.y / c.w / height,
      intensity: Math.min(1, c.w / 150),
      color: [c.r / c.w, c.g / c.w, c.b / c.w] as [number, number, number],
    }));
}

/** Texture de halo radial (générée une fois) pour la propagation additive. */
let haloTexture: Texture | null = null;
export function getHaloTexture(): Texture {
  if (haloTexture) return haloTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.20)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  haloTexture = Texture.from(canvas);
  return haloTexture;
}

/** Crée le sprite de halo additif d'une source (propagation lumineuse). */
export function makeHaloSprite(
  light: LightSource,
  radiusPx: number,
): Sprite {
  const halo = new Sprite(getHaloTexture());
  halo.anchor.set(0.5);
  halo.width = radiusPx * 2 * (0.5 + 0.6 * light.intensity);
  halo.height = halo.width * 0.6; // écrasement iso
  halo.tint =
    (Math.round(light.color[0] * 255) << 16) |
    (Math.round(light.color[1] * 255) << 8) |
    Math.round(light.color[2] * 255);
  halo.alpha = 0.3 * light.intensity + 0.1;
  halo.blendMode = 'add';
  return halo;
}

/* ------------------------------------------------------------------ */
/* Filtre de relief bump (WebGL)                                       */
/* ------------------------------------------------------------------ */

const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBumpMap;
uniform vec4 uInputSize;
uniform float uAmbient;
// 4 lumières : xy = UV locale, z = intensité ; couleur à part.
uniform vec4 uLights[4];
uniform vec3 uLightColors[4];

float bumpHeight(vec2 uv) {
  vec4 b = texture(uBumpMap, uv);
  return (b.r + b.g + b.b) / 3.0;
}

void main(void)
{
  vec4 base = texture(uTexture, vTextureCoord);
  if (base.a < 0.01) { finalColor = base; return; }

  // Normale par gradient de la bump map (relief).
  vec2 texel = uInputSize.zw * 2.0;
  float hx = bumpHeight(vTextureCoord + vec2(texel.x, 0.0)) -
             bumpHeight(vTextureCoord - vec2(texel.x, 0.0));
  float hy = bumpHeight(vTextureCoord + vec2(0.0, texel.y)) -
             bumpHeight(vTextureCoord - vec2(0.0, texel.y));
  vec3 N = normalize(vec3(-hx * 2.5, -hy * 2.5, 1.0));

  // Lumière directionnelle clé (ambiance de scène) + sources locales.
  vec3 keyDir = normalize(vec3(-0.4, -0.6, 0.8));
  vec3 lit = vec3(uAmbient + 0.30 * max(0.0, dot(N, keyDir)));

  for (int i = 0; i < 4; i++) {
    float intensity = uLights[i].z;
    if (intensity <= 0.001) continue;
    vec2 toLight = uLights[i].xy - vTextureCoord;
    float dist = length(toLight);
    float falloff = intensity / (1.0 + dist * dist * 18.0);
    vec3 dir = normalize(vec3(toLight, 0.35));
    lit += uLightColors[i] * falloff * (0.4 + 0.6 * max(0.0, dot(N, dir)));
  }

  finalColor = vec4(base.rgb * min(lit, vec3(1.6)), base.a);
}
`;

/** Filtre de relief : bump map + ≤ 4 sources locales + ambiante. */
export function makeBumpFilter(
  bumpTexture: Texture,
  lights: LightSource[],
  ambient = 0.76,
): Filter {
  const uLights = new Float32Array(16);
  const uLightColors = new Float32Array(12);
  lights.slice(0, 4).forEach((l, i) => {
    uLights[i * 4] = l.u;
    uLights[i * 4 + 1] = l.v;
    uLights[i * 4 + 2] = l.intensity;
    uLightColors[i * 3] = l.color[0];
    uLightColors[i * 3 + 1] = l.color[1];
    uLightColors[i * 3 + 2] = l.color[2];
  });
  return new Filter({
    glProgram: new GlProgram({ vertex: VERTEX, fragment: FRAGMENT }),
    resources: {
      bumpUniforms: {
        uAmbient: { value: ambient, type: 'f32' },
        uLights: { value: uLights, type: 'vec4<f32>', size: 4 },
        uLightColors: { value: uLightColors, type: 'vec3<f32>', size: 4 },
      },
      uBumpMap: bumpTexture.source,
    },
  });
}
