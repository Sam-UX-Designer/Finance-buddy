import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { liquidGlass, type LiquidGlassOptions } from './liquidGlass';

/**
 * The floating "functional layer" material (tab bar, sticky headers, sidebar).
 * - iOS 26+: Apple's real Liquid Glass (expo-glass-effect).
 * - Other phones: system blur.
 * - Web: frosted glass, plus rim refraction in Chromium when `refraction` is set (approximation).
 * Falls back to a solid surface when the person has asked for reduced transparency.
 */
export function GlassSurface({
  radius,
  refraction,
  flat,
  style,
  children,
  ...rest
}: ViewProps & {
  radius: number;
  refraction?: boolean | LiquidGlassOptions;
  /** Edge-to-edge bars (headers): no drop shadow, just the material. */
  flat?: boolean;
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
  if (reduced) {
    return (
      <View {...rest} style={[shape, { backgroundColor: c.surface, borderWidth: flat ? 0 : 1, borderColor: c.border }, style]}>
        {children}
      </View>
    );
  }
  if (Platform.OS === 'web') {
    const highlight = dark
      ? 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 0 1px rgba(255,255,255,0.08)'
      : 'inset 0 1px 1px rgba(255,255,255,0.95), inset 0 0 0 1px rgba(255,255,255,0.5)';
    const drop = dark ? '0 12px 36px rgba(0,0,0,0.5)' : '0 12px 36px rgba(20,20,30,0.14), 0 1px 3px rgba(20,20,30,0.08)';
    const web = { backdropFilter: backdrop, WebkitBackdropFilter: backdrop, boxShadow: flat ? 'none' : `${highlight}, ${drop}` } as unknown as ViewStyle;
    return (
      <View ref={ref} {...rest} style={[shape, { backgroundColor: dark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.74)' }, web, style]}>
        {children}
      </View>
    );
  }
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView {...rest} glassEffectStyle="regular" colorScheme={dark ? 'dark' : 'light'} isInteractive style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View {...rest} style={[shape, { borderWidth: flat ? 0 : 1, borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }, style]}>
      <BlurView intensity={80} tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {children}
    </View>
  );
}

/** Honours "Reduce transparency" (iOS setting / browser media query). */
function useReducedTransparency(): boolean {
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
