import { forwardRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

/** Browsers draw their own focus ring inside our bordered fields; the field border shows focus instead. */
export const webInputReset = (Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}) as TextStyle;
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { Press, Row, T } from './primitives';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'hero';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon: Icon,
  style,
  size = 'lg',
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'md' | 'sm';
  accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const bg = { primary: c.primary, secondary: c.surfaceMuted, outline: 'transparent', ghost: 'transparent', danger: c.negativeSoft, hero: c.heroButton }[variant];
  const fg = { primary: c.primaryText, secondary: c.text, outline: c.text, ghost: c.text, danger: c.negative, hero: c.heroText }[variant];
  const height = size === 'lg' ? 52 : size === 'md' ? 44 : 36;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        {
          height,
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space.lg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: c.border,
          flexDirection: 'row',
          gap: space.sm,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={fg} strokeWidth={2} /> : null}
          <T v={size === 'sm' ? 'smallMedium' : 'bodySemibold'} color={fg}>
            {label}
          </T>
        </>
      )}
    </Press>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  dot,
  size = 22,
  tint,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  dot?: boolean;
  size?: number;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={[{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon size={size} color={tint ?? c.text} strokeWidth={1.8} />
      {dot ? <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: c.negative, borderWidth: 1.5, borderColor: c.bg }} /> : null}
    </Press>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        height: 34,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        backgroundColor: selected ? c.primary : c.surface,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
      }}
    >
      {icon}
      <T v="smallMedium" color={selected ? c.primaryText : c.text}>
        {label}
      </T>
    </Press>
  );
}

export function ChipRow<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.xl }} style={{ marginHorizontal: -space.xl, flexGrow: 0 }}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => onChange(o.key)} />
      ))}
    </ScrollView>
  );
}

/** Segmented control — used only where it saves navigation (Plan: Goals / Forecast / Budget). */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { c } = useTheme();
  return (
    <Row gap={space.sm} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? c.surface : c.surfaceMuted,
              borderWidth: 1,
              borderColor: selected ? c.text : 'transparent',
            }}
          >
            <T v={selected ? 'bodySemibold' : 'bodyMedium'} tone={selected ? 'primary' : 'secondary'}>
              {o.label}
            </T>
          </Press>
        );
      })}
    </Row>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps & { label?: string; prefix?: ReactNode; error?: string | null; hint?: string }>(
  function TextField({ label, prefix, error, hint, style, ...rest }, ref) {
    const { c } = useTheme();
    const [focused, setFocused] = useState(false);
    return (
      <View style={{ gap: 6 }}>
        {label ? (
          <T v="smallMedium" tone="secondary">
            {label}
          </T>
        ) : null}
        <Row
          style={{
            minHeight: 52,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.negative : focused ? c.text : c.border,
            backgroundColor: c.surface,
            paddingHorizontal: space.lg,
            gap: space.sm,
          }}
        >
          {prefix}
          <TextInput
            ref={ref}
            placeholderTextColor={c.textTertiary}
            {...rest}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: c.text, paddingVertical: 14 }, webInputReset, style]}
          />
        </Row>
        {error ? (
          <T v="caption" tone="negative" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : hint ? (
          <T v="caption" tone="tertiary">
            {hint}
          </T>
        ) : null}
      </View>
    );
  },
);

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      scaleTo={1}
      style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? c.positive : c.surfacePressed, padding: 3, justifyContent: 'center' }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </Press>
  );
}
