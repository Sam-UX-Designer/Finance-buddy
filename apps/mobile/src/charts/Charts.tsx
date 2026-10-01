import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Simple, readable line chart (Blueprint §18: charts are never decorative). The line draws in once
 * when data is ready (§19) and respects reduced motion.
 */
export function LineChart({
  values,
  height = 120,
  color,
  showDots = false,
  showEndDot = true,
  fill = true,
  baseline,
  accessibilityLabel,
}: {
  values: number[];
  height?: number;
  color?: string;
  showDots?: boolean;
  showEndDot?: boolean;
  fill?: boolean;
  /** Optional horizontal reference (e.g. safety buffer). */
  baseline?: number;
  accessibilityLabel: string;
}) {
  const { c, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const stroke = color ?? c.positive;
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const gradientId = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;

  const { line, area, points, length, baseY } = useMemo(() => {
    if (width === 0 || values.length < 2) return { line: '', area: '', points: [] as { x: number; y: number }[], length: 0, baseY: null as number | null };
    const pad = 6;
    const all = baseline != null ? [...values, baseline] : values;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const pts = values.map((v, i) => ({
      x: pad + (i / (values.length - 1)) * (width - pad * 2),
      y: pad + (1 - (v - min) / span) * (height - pad * 2),
    }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
    return {
      line: d,
      area: `${d} L${pts[pts.length - 1]!.x.toFixed(1)},${height} L${pts[0]!.x.toFixed(1)},${height} Z`,
      points: pts,
      length: len,
      baseY: baseline != null ? pad + (1 - (baseline - min) / span) * (height - pad * 2) : null,
    };
  }, [values, width, height, baseline]);

  useEffect(() => {
    if (!line || reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [line, progress, reduceMotion]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });
  const last = points[points.length - 1];

  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {width > 0 && line ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.18} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {baseY != null ? <Path d={`M0,${baseY} L${width},${baseY}`} stroke={c.warning} strokeWidth={1} strokeDasharray="4 4" /> : null}
          {fill ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
          <AnimatedPath d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${length}`} strokeDashoffset={dashOffset} />
          {showDots ? (
            <G>
              {points.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={stroke} />
              ))}
            </G>
          ) : null}
          {showEndDot && last ? <Circle cx={last.x} cy={last.y} r={3.5} fill={stroke} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

/** Allocation donut. Segments are proportional to values; colours are supplied by the caller. */
export function Donut({ segments, size = 120, thickness = 22, accessibilityLabel }: { segments: { value: number; color: string }[]; size?: number; thickness?: number; accessibilityLabel: string }) {
  const { c } = useTheme();
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceMuted} strokeWidth={thickness} fill="none" />
          {segments.map((s, i) => {
            const len = (s.value / total) * circ;
            const el = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={thickness}
                fill="none"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </G>
      </Svg>
    </View>
  );
}
