/**
 * RNG déterministe seedé — utilisé UNIQUEMENT aux moments de génération
 * (roll de planète, ouverture de pod, scatter de sortie de porte…).
 * Le jeu vivant est intégralement déterministe sans RNG (DG §1, canon).
 *
 * Implémentation : hash 128 bits (cyrb128) → générateur sfc32, en
 * arithmétique entière 32 bits — bit-identique sur tout moteur JS.
 * Chaque tirage est adressé par (seed, label, index) : reproductible et
 * ré-évaluable sans état partagé.
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

/**
 * Flux déterministe de nombres dans [0, 1) pour un couple (seed, label).
 * Deux flux de labels différents sont indépendants.
 */
export class SeededStream {
  private next: () => number;

  constructor(seed: string, label: string) {
    const [a, b, c, d] = cyrb128(`${seed}::${label}`);
    this.next = sfc32(a, b, c, d);
    // Échauffement : disperse les états initiaux corrélés.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniforme [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniforme [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier uniforme dans [min, max] inclus. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Tirage pondéré : retourne l'indice choisi dans `weights`. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  /** Mélange de Fisher-Yates (copie). */
  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}

/**
 * Tirage ponctuel adressé (seed, label) → [0, 1) — pour les valeurs uniques
 * type scatter de porte : hash(shipId, arrivalTick) (DG §9.3).
 */
export function seededFloat(seed: string, label: string): number {
  return new SeededStream(seed, label).float();
}
