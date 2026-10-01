import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typeScale, type TypeVariant } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'positive' | 'negative' | 'warning' | 'loan' | 'info' | 'heroSecondary';

export function toneColor(c: Palette, tone: Tone): string {
  switch (tone) {
    case 'primary':
      return c.text;
    case 'secondary':
      return c.textSecondary;
    case 'tertiary':
      return c.textTertiary;
    case 'inverse':
      return c.heroText;
    case 'heroSecondary':
      return c.heroTextSecondary;
    case 'positive':
      return c.positive;
    case 'negative':
      return c.negative;
    case 'warning':
      return c.warning;
    case 'loan':
      return c.loan;
    case 'info':
      return c.info;
  }
}

export interface TProps extends TextProps {
  v?: TypeVariant;
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/** Typography primitive bound to the type scale and semantic colours. */
export function T({ v = 'body', tone = 'primary', color, align, style, ...rest }: TProps) {
  const { c } = useTheme();
  return <RNText {...rest} style={[typeScale[v], { color: color ?? toneColor(c, tone), textAlign: align }, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with subtle scale + opacity feedback (Blueprint §19: cards have press feedback). */
/**
 * A long-press handler shared by every pressable inside a region (e.g. Home's cards, where a long
 * press enters edit mode). A long press then never also counts as a tap.
 */
export const LongPressContext = createContext<(() => void) | undefined>(undefined);

export function Press({
  children,
  style,
  scaleTo = 0.98,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const { reduceMotion } = useTheme();
  const regionLongPress = useContext(LongPressContext);
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const to = (v: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 50, bounciness: 0 }).start();
  };
  return (
    <AnimatedPressable
      {...rest}
      onLongPress={rest.onLongPress ?? regionLongPress}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        to(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        to(1);
        rest.onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }], opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Content card: a plain solid surface (glass is kept for bars and controls that float). */
export function Card({ style, children, muted, ...rest }: ViewProps & { muted?: boolean }) {
  const { c } = useTheme();
  return (
    <View {...rest} style={[{ backgroundColor: muted ? c.surfaceMuted : c.surface, borderRadius: radius.lg, padding: space.lg }, style]}>
      {children}
    </View>
  );
}

export function Row({ style, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center', gap: rest.gap ?? 0 }, style]} />;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.divider, marginLeft: inset }} />;
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
      <T v="section" accessibilityRole="header">
        {children}
      </T>
      {action ? (
        <Press onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <T v="smallMedium" tone="secondary">
            {action}
          </T>
        </Press>
      ) : null}
    </Row>
  );
}

export function ProgressBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceMuted, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: color ?? c.info }} />
    </View>
  );
}

export function Badge({ label, tone = 'secondary' }: { label: string; tone?: 'positive' | 'negative' | 'warning' | 'info' | 'loan' | 'secondary' }) {
  const { c } = useTheme();
  const bg = { positive: c.positiveSoft, negative: c.negativeSoft, warning: c.warningSoft, info: c.infoSoft, loan: c.loanSoft, secondary: c.surfaceMuted }[tone];
  const fg = { positive: c.positive, negative: c.negative, warning: c.warning, info: c.info, loan: c.loan, secondary: c.textSecondary }[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
      <T v="captionMedium" color={fg}>
        {label}
      </T>
    </View>
  );
}
