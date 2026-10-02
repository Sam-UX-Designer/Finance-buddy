// The shipped tunings for the six states Finance Buddy uses, copied from
// thinking-orbs (presets.ts). `count`/`size` are multipliers over the base
// profiles; `speed` multiplies the shared clock. Resolved once per
// (state, size) pair and cached, so the draw loop sees plain numbers.

import type { ModeFrame } from './engine/core';
import { frameBraid } from './engine/braid';
import { frameGlobe, frameRubik, frameWave } from './engine/lattice';
import { frameOrbits } from './engine/orbits';
import { BASE_PROFILES, scaleCounts, scaleRadii, type ModeOpts } from './engine/profiles';
import { frameWeb } from './engine/web';

/**
 * - `working`    particles on tilted orbits
 * - `searching`  a scan line sweeps a dotted globe
 * - `solving`    bands scramble, then click back solved
 * - `listening`  a wave rolls through the rings
 * - `connecting` a constellation wires itself
 * - `weaving`    three strands plait around the sphere
 */
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving';

/** Hand-tuned sizes in px: 64 (avatar), 32 (compact, interpolated upstream) and 20 (inline with text). */
export type OrbSize = 64 | 32 | 20;

type ModeKey = 'orbits' | 'globe' | 'rubik' | 'wave' | 'web' | 'braid';

const STATE_TO_MODE: Record<OrbState, ModeKey> = {
  working: 'orbits',
  searching: 'globe',
  solving: 'rubik',
  listening: 'wave',
  connecting: 'web',
  weaving: 'braid',
};

const FRAMES: Record<ModeKey, ModeFrame> = { orbits: frameOrbits, globe: frameGlobe, rubik: frameRubik, wave: frameWave, web: frameWeb, braid: frameBraid };

interface Preset {
  speed: number;
  count: number;
  size: number;
  extra?: ModeOpts;
}

const PRESETS: Record<ModeKey, Record<OrbSize, Preset>> = {
  orbits: {
    64: { speed: 1.885, count: 1, size: 1 },
    32: { speed: 2.9072, count: 0.4251, size: 1.6849 },
    20: { speed: 3.9, count: 0.238, size: 2.4 },
  },
  globe: {
    64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } },
    32: { speed: 2.3803, count: 0.1839, size: 1.4769, extra: { scanMul: 4.2301, dimBase: 0.45 } },
    20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } },
  },
  rubik: {
    64: { speed: 1.82, count: 0.35, size: 1.05 },
    32: { speed: 1.8964, count: 0.1537, size: 1.4951 },
    20: { speed: 1.95, count: 0.088, size: 1.9 },
  },
  wave: {
    64: { speed: 4.388, count: 0.341, size: 1 },
    32: { speed: 4.1512, count: 0.169, size: 1.3232 },
    20: { speed: 3.998, count: 0.105, size: 1.6 },
  },
  web: {
    64: { speed: 3.315, count: 1.35, size: 0.95 },
    32: { speed: 5.0104, count: 0.4942, size: 1.2571 },
    20: { speed: 6.63, count: 0.25, size: 1.52 },
  },
  braid: {
    64: { speed: 1.625, count: 0.5, size: 1 },
    32: { speed: 2.2234, count: 0.2056, size: 1.2011 },
    20: { speed: 2.75, count: 0.1125, size: 1.36 },
  },
};

export interface Resolved {
  frame: ModeFrame;
  speed: number;
  opts: ModeOpts;
}

const cache = new Map<string, Resolved>();

/** A (state, size) pair's geometry function, clock speed and fully scaled options. */
export function resolvePreset(state: OrbState, size: OrbSize): Resolved {
  const key = `${state}-${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mode = STATE_TO_MODE[state];
  const preset = PRESETS[mode][size];
  let opts: ModeOpts = { ...BASE_PROFILES[mode] };
  if (preset.count !== 1) opts = scaleCounts(opts, preset.count);
  if (preset.size !== 1) opts = scaleRadii(opts, preset.size);
  if (preset.extra) opts = { ...opts, ...preset.extra };
  const resolved: Resolved = { frame: FRAMES[mode], speed: preset.speed, opts };
  cache.set(key, resolved);
  return resolved;
}
