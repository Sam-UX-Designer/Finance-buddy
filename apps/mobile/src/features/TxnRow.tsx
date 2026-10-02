import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatDate, formatTime, istDateKey, istParts, monthName, type TxnDTO } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { EmojiAvatar, TxnAmount } from '@/ui/display';
import { Press, Row, T } from '@/ui/primitives';

/** When it happened: the time for today, otherwise "Yesterday" or "29 Sep". */
function dayLabel(iso: string): string {
  const now = new Date();
  if (istDateKey(iso) === istDateKey(now)) return formatTime(iso);
  if (istDateKey(iso) === istDateKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  const p = istParts(iso);
  return `${p.day} ${monthName(p.month)}`;
}

/** Day heading for grouped lists: "Today, 2 Oct 2026", "Yesterday, 1 Oct 2026" or the date. */
export function dayHeading(iso: string): string {
  const key = istDateKey(iso);
  if (key === istDateKey(new Date().toISOString())) return `Today, ${formatDate(iso)}`;
  if (key === istDateKey(new Date(Date.now() - 86_400_000).toISOString())) return `Yesterday, ${formatDate(iso)}`;
  return formatDate(iso);
}

/** Transactions grouped by day, newest first (the order the API returns them in). */
export function groupByDay(items: TxnDTO[]): { title: string; data: TxnDTO[] }[] {
  const out: { title: string; data: TxnDTO[] }[] = [];
  for (const t of items) {
    const title = dayHeading(t.postedAt);
    const last = out[out.length - 1];
    if (last && last.title === title) last.data.push(t);
    else out.push({ title, data: [t] });
  }
  return out;
}

const subtitle = (t: TxnDTO) => (t.type === 'EXPENSE' || t.type === 'INCOME' || t.type === 'REFUND' ? `${t.categoryName} · ${t.mode === 'INTEREST' ? t.accountName : t.mode}` : t.typeLabel);
const a11yLabel = (t: TxnDTO) => `${t.merchantName}, ${t.typeLabel}, ${t.direction === 'DEBIT' ? 'paid' : 'received'} ${(t.amount / 100).toFixed(2)} rupees`;
const openDetail = (t: TxnDTO) => router.push({ pathname: '/transaction/[id]', params: { id: t.id } });

/**
 * One transaction. Opens its detail page, or calls onPress instead (desktop panels show the detail
 * beside the list). `selected` marks the one whose detail is showing.
 */
export function TxnRow({ t, showDay, onPress, selected }: { t: TxnDTO; showDay?: boolean; onPress?: () => void; selected?: boolean }) {
  const { c } = useTheme();
  const sub = subtitle(t);
  return (
    <Press
      onPress={onPress ?? (() => openDetail(t))}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel(t)}
      accessibilityState={selected === undefined ? undefined : { selected }}
      scaleTo={0.99}
      style={selected ? { backgroundColor: c.surfaceMuted, borderRadius: radius.md, marginHorizontal: -space.sm, paddingHorizontal: space.sm } : null}
    >
      <Row gap={space.md} style={{ paddingVertical: 10 }}>
        <EmojiAvatar emoji={t.emoji} categoryId={t.categoryId} merchantKey={t.merchantKey} size={42} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyMedium" numberOfLines={1}>
            {t.merchantName}
          </T>
          <T v="small" tone="secondary" numberOfLines={1}>
            {t.splits ? `${sub} · Split` : sub}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <TxnAmount amount={t.amount} type={t.type} direction={t.direction} />
          <T v="caption" tone="tertiary">
            {showDay ? dayLabel(t.postedAt) : formatTime(t.postedAt)}
          </T>
        </View>
      </Row>
    </Press>
  );
}

/** Column widths of the desktop transaction table (header and rows share them). */
const COL = { merchant: 2.4, category: 1.4, account: 1.4, time: 0.8, amount: 1.1 } as const;

/** Column headings for the desktop transaction table. */
export function TxnTableHeader() {
  const { c } = useTheme();
  const head = (label: string, flex: number, right?: boolean) => (
    <T v="caption" tone="tertiary" style={{ flex, textAlign: right ? 'right' : 'left' }} numberOfLines={1}>
      {label}
    </T>
  );
  return (
    <Row gap={space.md} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      {head('Merchant', COL.merchant)}
      {head('Category', COL.category)}
      {head('Account', COL.account)}
      {head('Time', COL.time)}
      {head('Amount', COL.amount, true)}
    </Row>
  );
}

/** Desktop table row: merchant, category, account, time and amount in columns, with hover. */
export function TxnTableRow({ t, onPress, selected }: { t: TxnDTO; onPress?: () => void; selected?: boolean }) {
  const { c } = useTheme();
  const [hover, setHover] = useState(false);
  const category = t.type === 'EXPENSE' || t.type === 'INCOME' || t.type === 'REFUND' ? t.categoryName : t.typeLabel;
  return (
    <Pressable
      onPress={onPress ?? (() => openDetail(t))}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel(t)}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => ({
        borderRadius: radius.md,
        backgroundColor: selected ? c.surfaceMuted : pressed || hover ? c.surfacePressed : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row gap={space.md} style={{ paddingHorizontal: space.md, paddingVertical: 10 }}>
        <Row gap={space.md} style={{ flex: COL.merchant, minWidth: 0 }}>
          <EmojiAvatar emoji={t.emoji} categoryId={t.categoryId} merchantKey={t.merchantKey} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="bodyMedium" numberOfLines={1}>
              {t.merchantName}
            </T>
            <T v="caption" tone="tertiary" numberOfLines={1}>
              {[t.mode === 'INTEREST' ? 'Bank credit' : t.mode, t.splits ? 'Split' : null, t.note].filter(Boolean).join(' · ')}
            </T>
          </View>
        </Row>
        <T v="small" tone="secondary" numberOfLines={1} style={{ flex: COL.category }}>
          {category}
        </T>
        <T v="small" tone="secondary" numberOfLines={1} style={{ flex: COL.account }}>
          {t.accountName}
        </T>
        <T v="small" tone="secondary" numberOfLines={1} style={{ flex: COL.time, fontVariant: ['tabular-nums'] }}>
          {formatTime(t.postedAt)}
        </T>
        <View style={{ flex: COL.amount, alignItems: 'flex-end' }}>
          <TxnAmount amount={t.amount} type={t.type} direction={t.direction} />
        </View>
      </Row>
    </Pressable>
  );
}
