import type { ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { icon3d } from './icons3d';
import { useSoftShadow } from './layout';
import { InSection, Press, Row, T } from './primitives';

/**
 * The desktop page style (Home first, then every tab): content sits in white section cards with a
 * thin border, a barely-there shadow, and a header of a small 3D icon, a title, a subtitle and an
 * action. Cards inside a section draw a thin border instead of a fill (see Card).
 */

/** A bordered block inside a section (the section itself is the white card). */
export const innerBlock = (c: ReturnType<typeof useTheme>['c']): ViewStyle => ({ borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: space.md });

/** A small 3D icon (falls back to the plain emoji). Used sparingly, where it adds personality. */
export function Icon3D({ emoji, size }: { emoji: string; size: number }) {
  const src = icon3d(emoji);
  return src ? (
    <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
  ) : (
    <T v="body" style={{ fontSize: size * 0.8, lineHeight: size }}>
      {emoji}
    </T>
  );
}

/**
 * One section: a white card with an optional icon, title, subtitle and action on the right.
 * `fill` makes it take the full height of its column, for lists that scroll inside it.
 */
export function Section({
  icon,
  title,
  subtitle,
  right,
  children,
  fill,
  style,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const shadow = useSoftShadow();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, padding: space.lg, gap: space.lg }, fill ? { flex: 1, minHeight: 0 } : null, shadow, style]}>
      <Row gap={space.md}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v={subtitle ? 'subtitle' : 'section'} accessibilityRole="header" numberOfLines={1}>
            {title}
          </T>
          {subtitle ? (
            <T v="small" tone="secondary" numberOfLines={1}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right}
      </Row>
      <InSection.Provider value={true}>{fill ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : children}</InSection.Provider>
    </View>
  );
}

/** A plain text link with a chevron, e.g. "See all ›". */
export function LinkAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Row gap={2}>
        <T v="smallMedium" tone="secondary">
          {label}
        </T>
        <ChevronRight size={14} color={c.textSecondary} />
      </Row>
    </Press>
  );
}

/** Heading of a block inside a section, with an optional link or note on the right. */
export function SubHeader({ title, action, note }: { title: string; action?: { label: string; onPress: () => void }; note?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
      <T v="section" accessibilityRole="header">
        {title}
      </T>
      {action ? (
        <LinkAction label={action.label} onPress={action.onPress} />
      ) : note ? (
        <T v="caption" tone="tertiary">
          {note}
        </T>
      ) : null}
    </Row>
  );
}
