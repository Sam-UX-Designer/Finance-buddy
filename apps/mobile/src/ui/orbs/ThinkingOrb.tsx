import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import type { OrbFrame } from './engine/core';
import { resolvePreset, type OrbSize, type OrbState } from './presets';

export type { OrbState } from './presets';

/**
 * Animated "thinking" orbs: dotted 3D spheres in black and white ink, from Jakub Antalik's
 * thinking-orbs (MIT, see ./LICENSE). The engine works out every dot for a moment in time; this
 * draws them with react-native-svg so phones and the web show the same picture.
 *
 * Dots are grouped by ink shade into a few SVG paths, so each frame is a handful of shapes
 * however many dots it has. Reduce Motion shows one still frame.
 */

/** Ink shades the dots are grouped into (one path each). */
const SHADES = 16;
/** Phones redraw at most 30 times a second; the web every frame. */
const MIN_FRAME_MS = Platform.OS === 'web' ? 0 : 1000 / 30;
/** The moment shown with Reduce Motion on (same as the original). */
const STILL_T = 0.6;

/**
 * Hand-tuned design for a display size; the drawing is scaled to fit. The 64 design (the one with
 * the connecting lines and woven strands) still reads clearly down to about 36px.
 */
const presetFor = (px: number): OrbSize => (px >= 36 ? 64 : px >= 26 ? 32 : 20);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const n = (v: number) => Math.round(v * 100) / 100;

interface Layer {
  key: string;
  d: string;
  color: string;
  opacity: number;
  /** Stroke width for the lines between dots ("connecting"); dots are filled. */
  width?: number;
}

/** Paper ink: 0 is the darkest dot. On dark backgrounds it's mirrored, so near dots read bright. */
const ink = (shade: number, dark: boolean) => {
  const g = Math.round((dark ? 1 - shade : shade) * 255);
  return `rgb(${g},${g},${g})`;
};

/** One frame as SVG paths: lines first, then dots from far to near. */
function toLayers(frame: OrbFrame, dark: boolean): Layer[] {
  const lines = new Map<string, { d: string[]; shade: number; a: number; w: number }>();
  for (const l of frame.lines) {
    const shade = Math.round(clamp01(l.white) * SHADES) / SHADES;
    const a = Math.round((l.a ?? 1) * 10) / 10;
    const w = Math.round(l.w * 10) / 10;
    const key = `${shade}|${a}|${w}`;
    const g = lines.get(key) ?? { d: [], shade, a, w };
    g.d.push(`M${n(l.x1)} ${n(l.y1)}L${n(l.x2)} ${n(l.y2)}`);
    lines.set(key, g);
  }
  const dots = new Map<string, { d: string[]; shade: number; a: number; z: number; count: number }>();
  for (const dot of frame.dots) {
    const shade = Math.round(clamp01(dot.white) * SHADES) / SHADES;
    const a = Math.round((dot.a ?? 1) * 10) / 10;
    const key = `${shade}|${a}`;
    const g = dots.get(key) ?? { d: [], shade, a, z: 0, count: 0 };
    const r = n(dot.r);
    // A circle as two arcs, so many dots share one path.
    g.d.push(`M${n(dot.x - dot.r)} ${n(dot.y)}a${r} ${r} 0 1 0 ${n(2 * dot.r)} 0a${r} ${r} 0 1 0 ${n(-2 * dot.r)} 0`);
    g.z += dot.z;
    g.count += 1;
    dots.set(key, g);
  }
  const out: Layer[] = [];
  for (const [key, g] of lines) out.push({ key: `l${key}`, d: g.d.join(''), color: ink(g.shade, dark), opacity: g.a, width: g.w });
  // Far shades first so near dots sit on top, as in the original's depth sort.
  const sorted = [...dots.entries()].sort((x, y) => x[1].z / x[1].count - y[1].z / y[1].count);
  for (const [key, g] of sorted) out.push({ key: `d${key}`, d: g.d.join(''), color: ink(g.shade, dark), opacity: g.a });
  return out;
}

/** Seconds on one clock shared by every orb, so orbs on screen together move in step. */
const now = () => (globalThis.performance?.now() ?? Date.now()) / 1000;

export function ThinkingOrb({ state = 'working', size = 32, label }: { state?: OrbState; size?: number; label?: string }) {
  const { scheme, reduceMotion } = useTheme();
  const preset = presetFor(size);
  const { frame, speed, opts } = resolvePreset(state, preset);
  const [t, setT] = useState(now);

  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let last = 0;
    const loop = (ms: number) => {
      if (ms - last >= MIN_FRAME_MS) {
        last = ms;
        setT(now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const dark = scheme === 'dark';
  const layers = useMemo(() => toLayers(frame(preset, reduceMotion ? STILL_T : t * speed, opts), dark), [frame, preset, t, speed, opts, dark, reduceMotion]);

  return (
    <View
      style={{ width: size, height: size }}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      aria-hidden={label ? undefined : true}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${preset} ${preset}`}>
        {layers.map((l) =>
          l.width ? <Path key={l.key} d={l.d} stroke={l.color} strokeOpacity={l.opacity} strokeWidth={l.width} fill="none" /> : <Path key={l.key} d={l.d} fill={l.color} fillOpacity={l.opacity} />,
        )}
      </Svg>
    </View>
  );
}
