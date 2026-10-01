/**
 * Liquid glass refraction for the web: a displacement map bends what's behind an element at its rim,
 * with a faint prism fringe. Chromium only; Safari and Firefox get a frosted blur instead.
 *
 * This is a web approximation of Apple's Liquid Glass material (Apple ships the real thing only
 * on its own platforms). Ported from https://github.com/deepika-builds/liquid-glass (MIT).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let uid = 0;
let defs: SVGDefsElement | null = null;
let supportCache: boolean | null = null;

export interface LiquidGlassOptions {
  /** Displacement strength; negative bulges. -60 subtle … -180 dramatic. */
  scale?: number;
  /** Per-channel stagger for the prism fringe; 0 disables. */
  chroma?: number;
  /** Neutral interior inset, as a fraction of the smaller side. */
  border?: number;
  /** Softness of the rim curvature (px). */
  mapBlur?: number;
  /** Backdrop blur inside the glass (px). */
  blur?: number;
  saturate?: number;
  /** Corner radius override (px). Defaults to the element's border radius. */
  radius?: number | null;
  /** Frosted blur where refraction isn't supported (px). */
  fallbackBlur?: number;
  /** Write backdrop-filter onto the element (default). Off when a framework owns the element's style. */
  apply?: boolean;
}

export interface LiquidGlassHandle {
  supported: boolean;
  /** The backdrop-filter value to use. */
  backdrop: string;
  refresh: () => void;
  destroy: () => void;
}

function refractionSupported(): boolean {
  if (supportCache != null) return supportCache;
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  if (isSafari || isFirefox || !CSS.supports('backdrop-filter', 'url(#lg)')) return (supportCache = false);
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    c.getContext('2d')!.getImageData(0, 0, 1, 1);
    return (supportCache = true);
  } catch {
    return (supportCache = false);
  }
}

function ensureDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  // 0×0 keeps it renderable (display:none would break feImage).
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/** Displacement map: red ramp = X, blue ramp = Y; a blurred 50%-gray inset keeps the middle still. */
function makeMap(w: number, h: number, radius: number, border: number, mapBlur: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const gx = ctx.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgb(0,0,0)');
  gx.addColorStop(1, 'rgb(255,0,0)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);
  const gy = ctx.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgb(0,0,0)');
  gy.addColorStop(1, 'rgb(0,0,255)');
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const inset = border * Math.min(w, h);
  ctx.filter = `blur(${mapBlur}px)`;
  ctx.fillStyle = 'rgba(128,128,128,0.93)';
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(radius - inset, 2));
  ctx.fill();
  ctx.filter = 'none';
  return canvas.toDataURL();
}

function buildFilter(id: string, scales: number[]) {
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');
  // Required: the default linearRGB would shift the neutral gray and displace everything.
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const feImage = document.createElementNS(SVG_NS, 'feImage');
  feImage.setAttribute('x', '0');
  feImage.setAttribute('y', '0');
  feImage.setAttribute('result', 'map');
  feImage.setAttribute('preserveAspectRatio', 'none');
  filter.appendChild(feImage);
  const keep = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];
  for (let i = 0; i < 3; i++) {
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'map');
    disp.setAttribute('scale', String(scales[i]));
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'B');
    disp.setAttribute('result', `d${i}`);
    filter.appendChild(disp);
    const cm = document.createElementNS(SVG_NS, 'feColorMatrix');
    cm.setAttribute('in', `d${i}`);
    cm.setAttribute('type', 'matrix');
    cm.setAttribute('values', keep[i]!);
    cm.setAttribute('result', `c${i}`);
    filter.appendChild(cm);
  }
  const b1 = document.createElementNS(SVG_NS, 'feBlend');
  b1.setAttribute('in', 'c0');
  b1.setAttribute('in2', 'c1');
  b1.setAttribute('mode', 'screen');
  b1.setAttribute('result', 'c01');
  filter.appendChild(b1);
  const b2 = document.createElementNS(SVG_NS, 'feBlend');
  b2.setAttribute('in', 'c01');
  b2.setAttribute('in2', 'c2');
  b2.setAttribute('mode', 'screen');
  filter.appendChild(b2);
  ensureDefs().appendChild(filter);
  return { filter, feImage };
}

function resolveRadius(el: HTMLElement, w: number, h: number, override: number | null | undefined): number {
  if (override != null) return override;
  const raw = getComputedStyle(el).borderTopLeftRadius || '0px';
  const v = parseFloat(raw) || 0;
  return raw.trim().endsWith('%') ? (v / 100) * Math.min(w, h) : v;
}

export function liquidGlass(el: HTMLElement, opts: LiquidGlassOptions = {}): LiquidGlassHandle {
  const o = { scale: -112, chroma: 6, border: 0.07, mapBlur: 12, blur: 3, saturate: 1.5, radius: null, fallbackBlur: 16, apply: true, ...opts };
  const setBackdrop = (v: string) => {
    if (!o.apply) return;
    el.style.backdropFilter = v;
    (el.style as unknown as Record<string, string>).webkitBackdropFilter = v;
  };
  if (!refractionSupported()) {
    const frosted = `blur(${o.fallbackBlur}px) saturate(${o.saturate})`;
    setBackdrop(frosted);
    return { supported: false, backdrop: frosted, refresh: () => {}, destroy: () => setBackdrop('') };
  }
  const id = `lg-filter-${++uid}`;
  const parts = buildFilter(id, [o.scale, o.scale + o.chroma, o.scale + 2 * o.chroma]);
  const refresh = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    parts.feImage.setAttribute('href', makeMap(w, h, resolveRadius(el, w, h, o.radius), o.border, o.mapBlur));
    parts.feImage.setAttribute('width', String(w));
    parts.feImage.setAttribute('height', String(h));
  };
  refresh();
  const backdrop = `url(#${id}) blur(${o.blur}px) saturate(${o.saturate})`;
  setBackdrop(backdrop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });
  ro.observe(el);
  return {
    supported: true,
    backdrop,
    refresh,
    destroy: () => {
      ro.disconnect();
      clearTimeout(timer);
      parts.filter.remove();
      setBackdrop('');
    },
  };
}
