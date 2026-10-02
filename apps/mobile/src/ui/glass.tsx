import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { liquidGlass, type LiquidGlassOptions } from './liquidGlass';

/**
 * Liquid Glass for the functional layer only (HIG): tab bar, headers, the SI input, sidebar and
 * sheets. Content (cards, lists) stays on plain solid surfaces.
 * iOS 26: Apple's real Liquid Glass. Other phones: system blur. Web: frosted glass, plus rim
 * refraction in Chromium when `refraction` is set (a web approximation).
 * Falls back to a solid surface when the person asks for reduced transparency.
 */
export function GlassSurface({
  radius,
  refraction,
  flat,
  tint,
  style,
  children,
  ...rest
}: ViewProps & {
  radius: number;
  refraction?: boolean | LiquidGlassOptions;
  /** Edge-to-edge bars (headers): no drop shadow, just the material. */
  flat?: boolean;
  /** Stained-glass tint (a translucent colour) laid over the material. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { c, scheme } = useTheme();
  const reduced = useReducedTransparency();
  const ref = useRef<View>(null);
  const dark = scheme === 'dark';
  const frosted = 'blur(24px) saturate(1.7)';
  const [backdrop, setBackdrop] = useState(frosted);

  // Refraction needs the element's size for its displacement map; the resulting filter is applied
  // through the style below so re-renders keep it.
  useEffect(() => {
    if (Platform.OS !== 'web' || reduced || !refraction) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.offsetWidth) return;
    const handle = liquidGlass(el, { scale: -64, chroma: 4, blur: 14, saturate: 1.7, fallbackBlur: 24, ...(typeof refraction === 'object' ? refraction : {}), apply: false });
    setBackdrop(handle.backdrop);
    return () => {
      handle.destroy();
      setBackdrop(frosted);
    };
  }, [reduced, !!refraction]);

  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };
  const fill = tint ?? (dark ? 'rgba(28,28,30,0.72)' : 'rgba(255,255,255,0.74)');
  const edge = dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)';

  if (reduced) {
    return (
      <View {...rest} style={[shape, { backgroundColor: c.surface, borderWidth: flat ? 0 : 1, borderColor: c.border }, style]}>
        {children}
      </View>
    );
  }

  if (Platform.OS === 'web') {
    const highlight = dark
      ? 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.07)'
      : 'inset 0 1px 1px rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.55)';
    const drop = dark ? '0 12px 36px rgba(0,0,0,0.5)' : '0 12px 36px rgba(20,20,30,0.14), 0 1px 3px rgba(20,20,30,0.08)';
    // Rim highlight sits on the material layer; the drop shadow on the outer shape.
    const material = { backgroundColor: fill, backdropFilter: backdrop, WebkitBackdropFilter: backdrop, boxShadow: flat ? 'none' : highlight } as unknown as ViewStyle;
    const shadow = { boxShadow: flat ? 'none' : drop } as unknown as ViewStyle;
    // zIndex 0 makes the surface its own stacking layer and -1 keeps the material underneath every
    // child, including ones the browser doesn't position (text inputs), so typed text stays visible.
    return (
      <View ref={ref} {...rest} style={[shape, shadow, { zIndex: 0 }, style]}>
        {/* Its own corner radius too: Chrome doesn't always clip a blurred layer to its parent's
            rounded corners (e.g. when the app is scaled up on big screens). */}
        <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1, borderRadius: radius }, material]} />
        {children}
      </View>
    );
  }

  // Native: Apple's Liquid Glass on iOS 26+.
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView {...rest} glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} isInteractive tintColor={tint} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  // Older iOS: system chrome blur. Android: a near-opaque bar (blur is costly there).
  const blur = Platform.OS === 'ios';
  return (
    <View {...rest} style={[shape, { borderWidth: flat ? 0 : 1, borderColor: edge, backgroundColor: blur ? (tint ?? 'transparent') : dark ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.96)' }, style]}>
      {blur ? (
        <BlurView intensity={80} tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : null}
      {children}
    </View>
  );
}

/** Honours "Reduce transparency" (iOS setting / browser media query). */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
      setReduced(mq.matches);
      const on = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener?.('change', on);
      return () => mq.removeEventListener?.('change', on);
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
