import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { formatINR, type CategoryId, type FipDTO, type Paise, type TxnType } from '@moneymate/core';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type TypeVariant } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';
import { Press, Row, T } from './primitives';

/** Soft background tint per category for merchant avatars. */
const CATEGORY_TINT: Partial<Record<CategoryId, keyof Palette>> = {
  food: 'warningSoft',
  groceries: 'positiveSoft',
  shopping: 'infoSoft',
  salary: 'positiveSoft',
  interest: 'positiveSoft',
  cashback: 'positiveSoft',
  investments: 'infoSoft',
  loans: 'loanSoft',
  transfers: 'surfaceMuted',
  rent: 'loanSoft',
  bills: 'infoSoft',
  subscriptions: 'negativeSoft',
  family: 'loanSoft',
};

export function EmojiAvatar({ emoji, categoryId, size = 40 }: { emoji: string; categoryId?: CategoryId; size?: number }) {
  const { c } = useTheme();
  const tint = (categoryId && CATEGORY_TINT[categoryId]) || 'surfaceMuted';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c[tint], alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no">
      <T style={{ fontSize: size * 0.46, lineHeight: size * 0.6 }}>{emoji}</T>
    </View>
  );
}

/** Bank / FIP mark. Uses a monogram in the institution's colour instead of a licensed logo. */
export function FipMark({ fip, size = 36 }: { fip: FipDTO; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: fip.color, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={fip.name}
    >
      <T v="bodySemibold" color="#FFFFFF" style={{ fontSize: size * 0.44, lineHeight: size * 0.56 }}>
        {fip.monogram}
      </T>
    </View>
  );
}

export function IconTile({ icon: Icon, color, bg, size = 40 }: { icon: LucideIcon; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color={color} strokeWidth={1.9} />
    </View>
  );
}

/** Colour and sign for a transaction amount by its financial meaning. */
export function amountStyle(c: Palette, type: TxnType, direction: 'DEBIT' | 'CREDIT'): { color: string; sign: string } {
  if (type === 'TRANSFER') return { color: c.textSecondary, sign: direction === 'DEBIT' ? '−' : '+' };
  if (type === 'LOAN_GIVEN' || type === 'LOAN_REPAID') return { color: c.loan, sign: direction === 'DEBIT' ? '−' : '+' };
  if (type === 'INVESTMENT') return { color: c.text, sign: direction === 'DEBIT' ? '−' : '+' };
  return direction === 'CREDIT' ? { color: c.positive, sign: '+' } : { color: c.negative, sign: '−' };
}

export function TxnAmount({ amount, type, direction, v = 'bodySemibold' }: { amount: Paise; type: TxnType; direction: 'DEBIT' | 'CREDIT'; v?: TypeVariant }) {
  const { c } = useTheme();
  const s = amountStyle(c, type, direction);
  return (
    <T v={v} color={s.color} accessibilityLabel={`${direction === 'DEBIT' ? 'minus' : 'plus'} ${formatINR(amount)}`}>
      {`${s.sign} ${formatINR(amount)}`}
    </T>
  );
}

/**
 * Money text with a short count-up only when the value is newly loaded or materially changes
 * (Blueprint §19). Respects reduced motion.
 */
export function Money({ value, v = 'amount', color, decimals = 'auto', hidden }: { value: Paise; v?: TypeVariant; color?: string; decimals?: 0 | 2 | 'auto'; hidden?: boolean }) {
  const { reduceMotion } = useTheme();
  const [shown, setShown] = useState(reduceMotion ? value : 0);
  const prev = useRef<Paise | null>(null);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const isNew = from == null;
    const material = !isNew && Math.abs(value - from) > Math.max(100, Math.abs(from) * 0.001);
    if (reduceMotion || (!isNew && !material)) {
      setShown(value);
      return;
    }
    const start = isNew ? 0 : from;
    const anim = new Animated.Value(0);
    const id = anim.addListener(({ value: t }) => setShown(Math.round(start + (value - start) * t)));
    Animated.timing(anim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => setShown(value));
    return () => {
      anim.stopAnimation();
      anim.removeListener(id);
    };
  }, [value, reduceMotion]);
  const text = hidden ? '₹ ••••••' : formatINR(shown, { decimals });
  return (
    <T v={v} color={color} accessibilityLabel={hidden ? 'Balance hidden' : formatINR(value, { decimals })}>
      {text}
    </T>
  );
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
  rightSub,
  onPress,
  chevron,
  style,
  accessibilityLabel,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  rightSub?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const body = (
    <Row style={[{ paddingVertical: space.md, gap: space.md }, style]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyMedium" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" tone="secondary" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right || rightSub ? (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {typeof right === 'string' ? <T v="bodyMedium">{right}</T> : right}
          {typeof rightSub === 'string' ? (
            <T v="caption" tone="tertiary">
              {rightSub}
            </T>
          ) : (
            rightSub
          )}
        </View>
      ) : null}
      {chevron ? <ChevronRight size={18} color={c.textTertiary} /> : null}
    </Row>
  );
  if (!onPress) return body;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} scaleTo={0.99}>
      {body}
    </Press>
  );
}

export function KeyValue({ label, value, onPress, valueTone }: { label: string; value: ReactNode; onPress?: () => void; valueTone?: 'primary' | 'info' }) {
  const { c } = useTheme();
  const content = (
    <Row style={{ paddingVertical: 11, justifyContent: 'space-between', gap: space.lg }}>
      <T v="body" tone="secondary">
        {label}
      </T>
      <Row gap={6} style={{ flexShrink: 1 }}>
        {typeof value === 'string' ? (
          <T v="bodyMedium" tone={valueTone ?? 'primary'} numberOfLines={2} align="right" style={{ flexShrink: 1 }}>
            {value}
          </T>
        ) : (
          value
        )}
        {onPress ? <ChevronRight size={16} color={c.textTertiary} /> : null}
      </Row>
    </Row>
  );
  if (!onPress) return content;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${typeof value === 'string' ? value : ''}. Change`} scaleTo={0.99}>
      {content}
    </Press>
  );
}

export function GainText({ pct }: { pct: number | null }) {
  const { c } = useTheme();
  if (pct == null) return <T v="caption" tone="tertiary">—</T>;
  const up = pct >= 0;
  return (
    <T v="captionMedium" color={up ? c.positive : c.negative}>
      {`${up ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%`}
    </T>
  );
}

export function Pill({ children, tone = 'positive' }: { children: string; tone?: 'positive' | 'negative' | 'info' }) {
  const { c } = useTheme();
  const bg = tone === 'positive' ? c.positiveSoft : tone === 'negative' ? c.negativeSoft : c.infoSoft;
  const fg = tone === 'positive' ? c.positive : tone === 'negative' ? c.negative : c.info;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <T v="captionMedium" color={fg}>
        {children}
      </T>
    </View>
  );
}
