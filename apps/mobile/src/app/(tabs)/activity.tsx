import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import {
  addMonthsToKey,
  formatDate,
  formatMonthKey,
  istDateKey,
  istMonthKey,
  SPEND_CATEGORY_IDS,
  category,
  type ActivityFilter,
  type CategoryId,
  type TxnDTO,
} from '@finance-buddy/core';
import { useAccounts, useTxns } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { Button, Chip, ChipRow, IconButton, webInputReset } from '@/ui/controls';
import { EmptyState, ErrorState, LoadingState, MAX_WIDTH, PAGE_X, Sheet, TabHeader } from '@/ui/layout';
import { Row, T } from '@/ui/primitives';
import { TxnRow } from '@/features/TxnRow';

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'investments', label: 'Investments' },
  { key: 'loans', label: 'Loans' },
  { key: 'transfers', label: 'Transfers' },
];

function dayLabel(iso: string): string {
  const key = istDateKey(iso);
  const today = istDateKey(new Date().toISOString());
  const yesterday = istDateKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return `Today, ${formatDate(iso)}`;
  if (key === yesterday) return `Yesterday, ${formatDate(iso)}`;
  return formatDate(iso);
}

/** Activity: understand money movement (Blueprint §9). Merchant first, raw description secondary. */
export default function ActivityScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: ActivityFilter; month?: string }>();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<CategoryId | undefined>();
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (params.filter) setFilter(params.filter);
    if (params.month) setMonth(params.month);
  }, [params.filter, params.month]);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const txns = useTxns({ filter, q, month, accountId, categoryId });
  const items = useMemo(() => txns.data?.pages.flatMap((p) => p.items) ?? [], [txns.data]);
  const sections = useMemo(() => {
    const out: { title: string; data: TxnDTO[] }[] = [];
    for (const t of items) {
      const title = dayLabel(t.postedAt);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(t);
      else out.push({ title, data: [t] });
    }
    return out;
  }, [items]);
  const activeFilters = [month, accountId, categoryId].filter(Boolean).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: PAGE_X }}>
        <TabHeader title="Transactions" right={<IconButton icon={SlidersHorizontal} label="Filter transactions" dot={activeFilters > 0} onPress={() => setSheet(true)} />} />
        <Row style={{ backgroundColor: c.surfaceMuted, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, gap: space.sm }}>
          <Search size={18} color={c.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search transactions…"
            placeholderTextColor={c.textTertiary}
            accessibilityLabel="Search transactions"
            returnKeyType="search"
            style={[{ flex: 1, fontFamily: fonts.regular, fontSize: 15, color: c.text }, webInputReset]}
          />
          {query ? <IconButton icon={X} label="Clear search" size={16} onPress={() => setQuery('')} style={{ width: 28, height: 28 }} /> : null}
        </Row>
        <View style={{ marginTop: space.md, marginBottom: space.sm }}>
          <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
        </View>
        {activeFilters ? (
          <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
            {month ? <Chip label={formatMonthKey(month, 'short')} selected onPress={() => setMonth(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
            {categoryId ? <Chip label={category(categoryId).name} selected onPress={() => setCategoryId(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
            {accountId ? <Chip label="Account" selected onPress={() => setAccountId(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
          </Row>
        ) : null}
      </View>
      {txns.error && !txns.data ? (
        <ErrorState error={txns.error} onRetry={() => txns.refetch()} />
      ) : !txns.data ? (
        <LoadingState label="Loading transactions…" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingBottom: space.xxxl }}
          refreshControl={<RefreshControl refreshing={txns.isRefetching && !txns.isFetchingNextPage} onRefresh={() => txns.refetch()} tintColor={c.textSecondary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => txns.hasNextPage && !txns.isFetchingNextPage && txns.fetchNextPage()}
          renderSectionHeader={({ section }) => (
            <T v="smallMedium" tone="secondary" style={{ marginTop: space.lg, marginBottom: space.xs }} accessibilityRole="header">
              {section.title}
            </T>
          )}
          renderItem={({ item }) => <TxnRow t={item} />}
          ListEmptyComponent={
            <EmptyState
              title={q || activeFilters || filter !== 'all' ? 'No matching transactions' : 'No transactions yet'}
              body={q || activeFilters || filter !== 'all' ? 'Try a different search or filter.' : 'Transactions from your connected accounts will appear here after your first sync.'}
              action={q || activeFilters || filter !== 'all' ? 'Clear filters' : undefined}
              onAction={() => {
                setQuery('');
                setFilter('all');
                setMonth(undefined);
                setAccountId(undefined);
                setCategoryId(undefined);
              }}
            />
          }
          ListFooterComponent={txns.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.lg }} color={c.textSecondary} /> : null}
        />
      )}
      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        month={month}
        accountId={accountId}
        categoryId={categoryId}
        onApply={(f) => {
          setMonth(f.month);
          setAccountId(f.accountId);
          setCategoryId(f.categoryId);
          setSheet(false);
        }}
      />
    </View>
  );
}

function FilterSheet({
  visible,
  onClose,
  onApply,
  ...initial
}: {
  visible: boolean;
  onClose: () => void;
  month?: string;
  accountId?: string;
  categoryId?: CategoryId;
  onApply: (f: { month?: string; accountId?: string; categoryId?: CategoryId }) => void;
}) {
  const accounts = useAccounts();
  const [month, setMonth] = useState(initial.month);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  useEffect(() => {
    if (visible) {
      setMonth(initial.month);
      setAccountId(initial.accountId);
      setCategoryId(initial.categoryId);
    }
  }, [visible]);
  const nowKey = istMonthKey(new Date().toISOString());
  const months = Array.from({ length: 12 }, (_, i) => addMonthsToKey(nowKey, -i));
  const banks = (accounts.data?.accounts ?? []).filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter"
      footer={
        <Row gap={space.md}>
          <Button label="Reset" variant="outline" style={{ flex: 1 }} onPress={() => onApply({})} />
          <Button label="Apply" style={{ flex: 1 }} onPress={() => onApply({ month, accountId, categoryId })} />
        </Row>
      }
    >
      <T v="smallMedium" tone="secondary" style={{ marginBottom: space.sm }}>
        Month
      </T>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {months.map((m) => (
          <Chip key={m} label={formatMonthKey(m, 'short')} selected={month === m} onPress={() => setMonth(month === m ? undefined : m)} />
        ))}
      </Row>
      {banks.length > 1 ? (
        <>
          <T v="smallMedium" tone="secondary" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            Account
          </T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {banks.map((a) => (
              <Chip key={a.id} label={`${a.fip.shortName} ••${a.maskedNumber.slice(-4)}`} selected={accountId === a.id} onPress={() => setAccountId(accountId === a.id ? undefined : a.id)} />
            ))}
          </Row>
        </>
      ) : null}
      <T v="smallMedium" tone="secondary" style={{ marginTop: space.xl, marginBottom: space.sm }}>
        Category
      </T>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {SPEND_CATEGORY_IDS.map((id) => (
          <Chip key={id} label={`${category(id).emoji} ${category(id).name}`} selected={categoryId === id} onPress={() => setCategoryId(categoryId === id ? undefined : id)} />
        ))}
      </Row>
    </Sheet>
  );
}
