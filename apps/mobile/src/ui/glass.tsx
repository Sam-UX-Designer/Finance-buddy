import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { liquidGlass, type LiquidGlassOptions } from './liquidGlass';

/**
 * Glass for the whole app, following the HIG split between layers:
 * - `bar`  (functional layer: tab bar, headers, input, sidebar, sheets) = Liquid Glass.
 *          iOS 26: Apple's real Liquid Glass. Other phones: system blur. Web: frosted glass, plus rim
 *          refraction in Chromium when `refraction` is set (a web approximation).
 * - `card` (content layer: cards and tiles) = a thin frosted material, so content stays legible.
 * - `pill` (small controls such as chips) = translucent glass without blur, cheap to draw in lists.
 * Everything falls back to solid surfaces when the person asks for reduced transparency.
 */
export type GlassVariant = 'bar' | 'card' | 'pill';

export function GlassSurface({
  radius,
  variant = 'bar',
  refraction,
  flat,
  tint,
  style,
  children,
  ...rest
}: ViewProps & {
  radius: number;
  variant?: GlassVariant;
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
  const frosted = variant === 'card' ? 'blur(20px) saturate(1.8)' : 'blur(24px) saturate(1.7)';
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
  const fill = tint ?? fillFor(variant, dark);
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
    const drop =
      variant === 'pill'
        ? ''
        : variant === 'card'
          ? dark
            ? ', 0 10px 30px rgba(0,0,0,0.35)'
            : ', 0 10px 30px rgba(40,50,90,0.08), 0 1px 2px rgba(40,50,90,0.06)'
          : dark
            ? ', 0 12px 36px rgba(0,0,0,0.5)'
            : ', 0 12px 36px rgba(20,20,30,0.14), 0 1px 3px rgba(20,20,30,0.08)';
    const web = {
      backdropFilter: variant === 'pill' ? undefined : backdrop,
      WebkitBackdropFilter: variant === 'pill' ? undefined : backdrop,
      boxShadow: flat ? 'none' : `${highlight}${drop}`,
    } as unknown as ViewStyle;
    return (
      <View ref={ref} {...rest} style={[shape, { backgroundColor: fill }, web, style]}>
        {children}
      </View>
    );
  }

  // Native: Apple's Liquid Glass for the functional layer on iOS 26+.
  if (variant === 'bar' && Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView {...rest} glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} isInteractive tintColor={tint} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  // iOS: system blur materials. Android: translucent surfaces (blur in scrolling lists is costly there).
  const blur = Platform.OS === 'ios' && variant !== 'pill';
  return (
    <View {...rest} style={[shape, { borderWidth: flat ? 0 : 1, borderColor: edge, backgroundColor: blur ? (tint ?? 'transparent') : fillFor(variant, dark, true) }, style]}>
      {blur ? (
        <BlurView
          intensity={variant === 'card' ? 55 : 80}
          tint={variant === 'card' ? (dark ? 'systemThinMaterialDark' : 'systemThinMaterialLight') : dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {children}
    </View>
  );
}

/** Material tint per layer. `opaque` is used where there's no blur behind it. */
function fillFor(variant: GlassVariant, dark: boolean, opaque = false): string {
  if (variant === 'bar') return dark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.74)';
  if (variant === 'card') return dark ? `rgba(30,30,36,${opaque ? 0.82 : 0.48})` : `rgba(255,255,255,${opaque ? 0.86 : 0.62})`;
  return dark ? 'rgba(255,255,255,0.08)' : `rgba(255,255,255,${opaque ? 0.85 : 0.6})`;
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
