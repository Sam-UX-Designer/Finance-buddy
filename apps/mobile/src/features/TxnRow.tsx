import { router } from 'expo-router';
import { View } from 'react-native';
import { formatTime, type TxnDTO } from '@moneymate/core';
import { space } from '@/theme/tokens';
import { EmojiAvatar, TxnAmount } from '@/ui/display';
import { Press, Row, T } from '@/ui/primitives';

export function TxnRow({ t }: { t: TxnDTO }) {
  const sub = t.type === 'EXPENSE' || t.type === 'INCOME' || t.type === 'REFUND' ? `${t.categoryName} · ${t.mode === 'INTEREST' ? t.accountName : t.mode}` : t.typeLabel;
  return (
    <Press
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t.merchantName}, ${t.typeLabel}, ${t.direction === 'DEBIT' ? 'paid' : 'received'} ${(t.amount / 100).toFixed(2)} rupees`}
      scaleTo={0.99}
    >
      <Row gap={space.md} style={{ paddingVertical: 10 }}>
        <EmojiAvatar emoji={t.emoji} categoryId={t.categoryId} size={42} />
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
            {formatTime(t.postedAt)}
          </T>
        </View>
      </Row>
    </Press>
  );
}
