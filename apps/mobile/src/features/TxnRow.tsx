import { router } from 'expo-router';
import { View } from 'react-native';
import { formatTime, istDateKey, istParts, monthName, type TxnDTO } from '@finance-buddy/core';
import { space } from '@/theme/tokens';
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

export function TxnRow({ t, showDay }: { t: TxnDTO; showDay?: boolean }) {
  const sub = t.type === 'EXPENSE' || t.type === 'INCOME' || t.type === 'REFUND' ? `${t.categoryName} · ${t.mode === 'INTEREST' ? t.accountName : t.mode}` : t.typeLabel;
  return (
    <Press
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t.merchantName}, ${t.typeLabel}, ${t.direction === 'DEBIT' ? 'paid' : 'received'} ${(t.amount / 100).toFixed(2)} rupees`}
      scaleTo={0.99}
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
