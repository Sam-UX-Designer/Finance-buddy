import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, SectionList, View } from 'react-native';
import { ArrowLeft, Search } from 'lucide-react-native';
import type { ActivityFilter } from '@finance-buddy/core';
import { useTxns } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { ChipRow, IconButton } from '@/ui/controls';
import { EmptyState, ErrorState, Skeleton } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';
import { TransactionDetail } from './TransactionDetail';
import { groupByDay, TxnRow, TxnTableHeader, TxnTableRow } from './TxnRow';

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'investments', label: 'Investments' },
];
/** Below this width the panel shows the compact two-line rows instead of table columns. */
const TABLE_MIN = 600;

/**
 * Desktop Home, right side: every transaction, newest first, loading more as you scroll. Picking
 * one shows its detail right here in the panel; the arrow goes back to the list.
 */
export function TransactionsPanel() {
  const { c } = useTheme();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const txns = useTxns({ filter, q: '' });
  const items = useMemo(() => txns.data?.pages.flatMap((p) => p.items) ?? [], [txns.data]);
  const sections = useMemo(() => groupByDay(items), [items]);
  const table = width >= TABLE_MIN;

  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }}
      role="region"
      aria-label="Transactions"
    >
      {openId ? (
        <>
          <Row gap={space.xs} style={{ paddingHorizontal: space.sm, height: 56, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <IconButton icon={ArrowLeft} label="Back to transactions" onPress={() => setOpenId(null)} />
            <T v="bodySemibold">Transactions</T>
          </Row>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl }}>
            <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
              <TransactionDetail key={openId} id={openId} />
            </View>
          </ScrollView>
        </>
      ) : (
        <>
          <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="subtitle" accessibilityRole="header">
                Transactions
              </T>
              <Press onPress={() => router.navigate('/(tabs)/activity')} accessibilityRole="link" accessibilityLabel="Search and filter all transactions" hitSlop={8}>
                <Row gap={6}>
                  <Search size={14} color={c.textSecondary} />
                  <T v="smallMedium" tone="secondary">
                    Search & filter
                  </T>
                </Row>
              </Press>
            </Row>
            <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
          </View>
          {table && items.length ? (
            <View style={{ paddingHorizontal: space.sm, marginTop: space.md }}>
              <TxnTableHeader />
            </View>
          ) : null}
          {txns.error && !txns.data ? (
            <ErrorState error={txns.error} onRetry={() => txns.refetch()} />
          ) : !txns.data ? (
            <View style={{ padding: space.xl, gap: space.lg }} accessibilityLabel="Loading transactions">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Row key={i} gap={space.md}>
                  <Skeleton height={36} width={36} style={{ borderRadius: 18 }} />
                  <Skeleton height={14} style={{ flex: 1 }} />
                  <Skeleton height={14} width={80} />
                </Row>
              ))}
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(t) => t.id}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingHorizontal: table ? space.sm : space.xl, paddingBottom: space.xl }}
              onEndReachedThreshold={0.4}
              onEndReached={() => txns.hasNextPage && !txns.isFetchingNextPage && txns.fetchNextPage()}
              renderSectionHeader={({ section }) => (
                <T v="smallMedium" tone="secondary" style={{ marginTop: space.lg, marginBottom: space.xs, paddingHorizontal: table ? space.md : 0 }} accessibilityRole="header">
                  {section.title}
                </T>
              )}
              renderItem={({ item }) => (table ? <TxnTableRow t={item} onPress={() => setOpenId(item.id)} /> : <TxnRow t={item} onPress={() => setOpenId(item.id)} />)}
              ListEmptyComponent={<EmptyState title="No transactions here" body={filter === 'all' ? 'Transactions from your connected accounts will appear here after your first sync.' : 'Nothing of this kind yet. Try another filter.'} />}
              ListFooterComponent={txns.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.lg }} color={c.textSecondary} /> : null}
            />
          )}
        </>
      )}
    </View>
  );
}
