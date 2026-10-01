import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface Glow {
  color: string;
  opacity: number;
  /** Centre as a fraction of the screen. */
  x: number;
  y: number;
  /** Radius as a fraction of the longer screen side. */
  r: number;
  /** Drift distance (px) and period (ms). */
  drift: number;
  period: number;
}

// Soft light fields in the app's own SI colours. Content materials (frosted cards) pick these up.
const LIGHT: Glow[] = [
  { color: '#5B9BFF', opacity: 0.34, x: 0.05, y: 0.02, r: 0.62, drift: 46, period: 21000 },
  { color: '#A78BFA', opacity: 0.28, x: 0.98, y: 0.2, r: 0.58, drift: 54, period: 26000 },
  { color: '#5EEAD4', opacity: 0.2, x: 0.02, y: 0.62, r: 0.55, drift: 40, period: 23000 },
  { color: '#FDBA8C', opacity: 0.18, x: 0.95, y: 0.92, r: 0.6, drift: 50, period: 29000 },
];
const DARK: Glow[] = [
  { color: '#2563EB', opacity: 0.34, x: 0.05, y: 0.02, r: 0.62, drift: 46, period: 21000 },
  { color: '#7C3AED', opacity: 0.3, x: 0.98, y: 0.22, r: 0.58, drift: 54, period: 26000 },
  { color: '#0D9488', opacity: 0.2, x: 0.02, y: 0.64, r: 0.55, drift: 40, period: 23000 },
  { color: '#DB2777', opacity: 0.12, x: 0.95, y: 0.92, r: 0.6, drift: 50, period: 29000 },
];

const ND = Platform.OS !== 'web';

/** The backdrop behind every screen: soft colour fields that drift very slowly. */
export function AmbientBackground() {
  const { scheme, reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const dark = scheme === 'dark';
  const glows = dark ? DARK : LIGHT;
  const base = Math.max(width, height);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#050507' : '#F6F7FB', overflow: 'hidden' }]} importantForAccessibility="no-hide-descendants">
      {glows.map((g, i) => (
        <GlowBlob key={i} g={g} size={g.r * base * 2} left={g.x * width} top={g.y * height} still={reduceMotion} />
      ))}
    </View>
  );
}

function GlowBlob({ g, size, left, top, still }: { g: Glow; size: number; left: number; top: number; still: boolean }) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: g.period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        Animated.timing(t, { toValue: 0, duration: g.period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still]);
  const r = size / 2;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: left - r,
        top: top - r,
        width: size,
        height: size,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-g.drift, g.drift] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [g.drift * 0.6, -g.drift * 0.6] }) },
        ],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
            <Stop offset="0.55" stopColor={g.color} stopOpacity={g.opacity * 0.45} />
            <Stop offset="1" stopColor={g.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
