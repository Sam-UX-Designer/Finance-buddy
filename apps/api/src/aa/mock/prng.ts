/** Small deterministic PRNG (mulberry32) so mock data is stable across runs. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...parts: (string | number)[]): () => number {
  return rng(hashSeed(parts.join('|')));
}

export const between = (r: () => number, min: number, max: number) => min + r() * (max - min);
export const intBetween = (r: () => number, min: number, max: number) => Math.floor(between(r, min, max + 1));
export const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
