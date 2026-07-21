/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Isometric planet view”; GAME_BOOK.md §17/§26; docs/ASSET_PIPELINE.md §2–§4; docs/DESIGN_SYSTEM.md §9. */
/**
 * Chargement des sprites du contrat d'assets (docs/ASSET_PIPELINE.md §4).
 * - GIF animés : décodés par pixi.js/gif (GifSource mis en cache par URL) ;
 * - companions `X.bump.gif` / `X.light.gif` : décodés en canvas (frame 1)
 *   pour la passe de lumière (scenes/lighting.ts).
 * Échange d'art sans code : remplacer le fichier au même chemin.
 */
import { GifSource } from 'pixi.js/gif';

const cache = new Map<string, Promise<HTMLCanvasElement>>();

export function spriteUrl(path: string): string {
  return `/game-assets/${path}`;
}

/** Charge une image (première frame pour un GIF) dans un canvas. */
export function loadSpriteCanvas(path: string): Promise<HTMLCanvasElement> {
  const url = spriteUrl(path);
  let entry = cache.get(url);
  if (!entry) {
    entry = new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas 2d indisponible'));
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error(`sprite introuvable : ${url}`));
      img.src = url;
    });
    cache.set(url, entry);
  }
  return entry;
}

export function planetSprite(climate: string, size: string): string {
  return `planets/planet_${climate}_${size}.gif`;
}

export function starSprite(fuelType: string): string {
  return `stars/star_${fuelType}.gif`;
}

export const BLACK_HOLE_SPRITE = 'stars/blackhole.gif';

export function buildingSprite(key: string, level: number): string {
  return `buildings/building_${key}_l${level}.gif`;
}

export function bumpMapOf(spritePath: string): string {
  return spritePath.replace(/\.gif$/, '.bump.gif');
}

export function lightMapOf(spritePath: string): string {
  return spritePath.replace(/\.gif$/, '.light.gif');
}

/**
 * Charge un GIF animé en GifSource. Le CACHE porte sur l'ArrayBuffer ;
 * chaque appel parse une GifSource NEUVE : la cascade destroy() du plateau
 * (options truthy → destroyData) peut alors détruire la source du sprite
 * sans corrompre celle des reconstructions suivantes.
 */
const gifBufferCache = new Map<string, Promise<ArrayBuffer>>();
export async function loadGifSource(path: string): Promise<GifSource> {
  const url = spriteUrl(path);
  let entry = gifBufferCache.get(url);
  if (!entry) {
    entry = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`GIF introuvable : ${url}`);
      return res.arrayBuffer();
    });
    gifBufferCache.set(url, entry);
  }
  return GifSource.from(await entry);
}

export function buildingClimateOverlay(
  key: string,
  level: number,
  climate: 'hot' | 'cold',
): string {
  return `buildings/building_${key}_l${level}.ov.${climate}.gif`;
}

export function cardArt(buildingKey: string): string {
  return `cards/card_building_${buildingKey}.png`;
}

/**
 * Sprite d'une ressource (stub `res_<id>.gif`, contrat ASSET_PIPELINE).
 * Les noms de fichiers correspondent 1:1 aux ResourceId. Échange d'art
 * sans code : remplacer le fichier au même chemin.
 */
export function resourceArt(resource: string): string {
  return `resources/res_${resource}.gif`;
}
