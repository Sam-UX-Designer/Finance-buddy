import { View } from 'react-native';
import { category, formatDate, formatINR } from '@finance-buddy/core';
import { useUpcoming } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { EmojiAvatar, ListRow } from '@/ui/display';
import { BackHeader, EmptyState, ErrorState, LoadingState, Screen } from '@/ui/layout';
import { Badge, Card, Divider, T } from '@/ui/primitives';

export default function UpcomingScreen() {
  const q = useUpcoming();
  const d = q.data;
  return (
    <Screen edges={['top', 'bottom']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Upcoming payments" />
      {q.error && !d ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <LoadingState />
      ) : d.items.length === 0 ? (
        <EmptyState title="Nothing due soon" body="We list bills, rent, subscriptions and SIPs here once they repeat at least three times, or when you mark one as recurring." />
      ) : (
        <>
          <Card muted>
            <T v="small" tone="secondary">{`Next ${d.days} days`}</T>
            <T v="amount">{formatINR(d.total, { decimals: 0 })}</T>
            <T v="caption" tone="tertiary">{`${d.items.length} payment${d.items.length === 1 ? '' : 's'} expected from your payment history`}</T>
          </Card>
          <View style={{ marginTop: space.lg }}>
            {d.items.map((u, i) => (
              <View key={`${u.seriesKey}${u.dueDateKey}`}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  left={<EmojiAvatar emoji={category(u.categoryId).emoji} categoryId={u.categoryId} merchantKey={u.seriesKey.split('|')[0]} />}
                  title={u.merchantName}
                  subtitle={`${u.type === 'INVESTMENT' ? 'Investment' : category(u.categoryId).name} · ${formatDate(u.dueDate)}`}
                  right={formatINR(u.amount, { decimals: 0 })}
                  rightSub={u.overdue ? <Badge label="Expected" tone="warning" /> : undefined}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
