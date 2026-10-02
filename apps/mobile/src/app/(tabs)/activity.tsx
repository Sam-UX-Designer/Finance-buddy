import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { addMonthsToKey, formatMonthKey, istDateKey, istMonthKey, SPEND_CATEGORY_IDS, category, type ActivityFilter, type CategoryId } from '@finance-buddy/core';
import { useAccounts, useTxns } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { Button, Chip, ChipRow, IconButton, webInputReset } from '@/ui/controls';
import { EmptyState, ErrorState, LoadingState, MAX_WIDTH, PAGE_X, Sheet, TabHeader, useContentWidth, useTabBarInset, useWide, WIDE_MAX_WIDTH, WIDE_PAGE_X } from '@/ui/layout';
import { Row, T } from '@/ui/primitives';
import { groupByDay, TxnRow } from '@/features/TxnRow';
import { TransactionDetail } from '@/features/TransactionDetail';
import { DateRangeCalendar, rangeLabel, shiftDay } from '@/ui/DateRangeCalendar';

const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'investments', label: 'Investments' },
  { key: 'loans', label: 'Loans' },
  { key: 'transfers', label: 'Transfers' },
];

/**
 * Activity: understand money movement (Blueprint §9). Merchant first, raw description secondary.
 * Desktop: the list on the left and the picked transaction's full detail on the right.
 */
export default function ActivityScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: ActivityFilter; month?: string; accountId?: string }>();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState<string | undefined>();
  const [range, setRange] = useState<{ from: string; to: string } | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<CategoryId | undefined>();
  const [sheet, setSheet] = useState(false);
  const tabInset = useTabBarInset();
  const wide = useWide();
  const pageWidth = useContentWidth();
  const contentWidth = wide ? WIDE_MAX_WIDTH : MAX_WIDTH;
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (params.filter) setFilter(params.filter);
    if (params.month) {
      setMonth(params.month);
      setRange(undefined);
    }
    if (params.accountId) setAccountId(params.accountId);
  }, [params.filter, params.month, params.accountId]);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const txns = useTxns({ filter, q, month, from: range?.from, to: range?.to, accountId, categoryId });
  const items = useMemo(() => txns.data?.pages.flatMap((p) => p.items) ?? [], [txns.data]);
  const sections = useMemo(() => groupByDay(items), [items]);
  // Desktop shows one transaction's detail at all times: the one picked, else the newest in the list.
  const selectedId = picked && items.some((t) => t.id === picked) ? picked : items[0]?.id;
  const activeFilters = [month, range, accountId, categoryId].filter(Boolean).length;
  const today = istDateKey(new Date().toISOString());

  const header = (
    <View style={wide ? null : { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: PAGE_X }}>
      <TabHeader title="Transactions" right={<IconButton icon={SlidersHorizontal} label="Filter transactions" dot={activeFilters > 0} onPress={() => setSheet(true)} />} />
      <Row style={{ backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, gap: space.sm }}>
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
          {range ? <Chip label={rangeLabel(range.from, range.to, today)} selected onPress={() => setRange(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
          {categoryId ? <Chip label={category(categoryId).name} selected onPress={() => setCategoryId(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
          {accountId ? <Chip label="Account" selected onPress={() => setAccountId(undefined)} icon={<X size={12} color={c.primaryText} />} /> : null}
        </Row>
      ) : null}
    </View>
  );
  const list = (
    <>
      {txns.error && !txns.data ? (
        <ErrorState error={txns.error} onRetry={() => txns.refetch()} />
      ) : !txns.data ? (
        <LoadingState label="Loading transactions…" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={wide ? { paddingBottom: space.xxxl } : { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: PAGE_X, paddingBottom: space.xxxl + tabInset }}
          refreshControl={<RefreshControl refreshing={txns.isRefetching && !txns.isFetchingNextPage} onRefresh={() => txns.refetch()} tintColor={c.textSecondary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => txns.hasNextPage && !txns.isFetchingNextPage && txns.fetchNextPage()}
          renderSectionHeader={({ section }) => (
            <T v="smallMedium" tone="secondary" style={{ marginTop: space.lg, marginBottom: space.xs }} accessibilityRole="header">
              {section.title}
            </T>
          )}
          renderItem={({ item, index, section }) => {
            // Inset grouped list: each day is one glass panel.
            const first = index === 0;
            const last = index === section.data.length - 1;
            return (
              <View
                style={{
                  backgroundColor: c.surface,
                  borderTopLeftRadius: first ? radius.lg : 0,
                  borderTopRightRadius: first ? radius.lg : 0,
                  borderBottomLeftRadius: last ? radius.lg : 0,
                  borderBottomRightRadius: last ? radius.lg : 0,
                  paddingHorizontal: space.md,
                  paddingTop: first ? 4 : 0,
                  paddingBottom: last ? 4 : 0,
                }}
              >
                {first ? null : <View style={{ height: 1, backgroundColor: c.divider, marginLeft: 54 }} />}
                <TxnRow t={item} onPress={wide ? () => setPicked(item.id) : undefined} selected={wide ? item.id === selectedId : undefined} />
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title={q || activeFilters || filter !== 'all' ? 'No matching transactions' : 'No transactions yet'}
              body={q || activeFilters || filter !== 'all' ? 'Try a different search or filter.' : 'Transactions from your connected accounts will appear here after your first sync.'}
              action={q || activeFilters || filter !== 'all' ? 'Clear filters' : undefined}
              onAction={() => {
                setQuery('');
                setFilter('all');
                setMonth(undefined);
                setRange(undefined);
                setAccountId(undefined);
                setCategoryId(undefined);
              }}
            />
          }
          ListFooterComponent={txns.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.lg }} color={c.textSecondary} /> : null}
        />
      )}
    </>
  );
  const filterSheet = (
    <FilterSheet
      visible={sheet}
      onClose={() => setSheet(false)}
      month={month}
      from={range?.from}
      to={range?.to}
      accountId={accountId}
      categoryId={categoryId}
      onApply={(f) => {
        setMonth(f.month);
        setRange(f.from && f.to ? { from: f.from, to: f.to } : undefined);
        setAccountId(f.accountId);
        setCategoryId(f.categoryId);
        setSheet(false);
      }}
    />
  );

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: space.xl, width: '100%', maxWidth: pageWidth, alignSelf: 'center', paddingHorizontal: WIDE_PAGE_X }}>
          <View style={{ flex: 1.15, minWidth: 0 }}>
            {header}
            {list}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: space.lg }}>
            <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden' }} role="region" aria-label="Transaction details">
              {selectedId ? (
                <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl }}>
                  <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
                    <TransactionDetail key={selectedId} id={selectedId} />
                  </View>
                </ScrollView>
              ) : (
                <EmptyState title="Nothing to show yet" body="Pick a transaction on the left to see its details here." />
              )}
            </View>
          </View>
        </View>
        {filterSheet}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {header}
      {list}
      {filterSheet}
    </View>
  );
}

type Filters = { month?: string; from?: string; to?: string; accountId?: string; categoryId?: CategoryId };

function FilterSheet({
  visible,
  onClose,
  onApply,
  ...initial
}: Filters & {
  visible: boolean;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const { c } = useTheme();
  const accounts = useAccounts();
  const [f, setF] = useState<Filters>(initial);
  const [custom, setCustom] = useState(!!initial.from);
  useEffect(() => {
    if (visible) {
      setF(initial);
      setCustom(!!initial.from);
    }
  }, [visible]);
  const today = istDateKey(new Date().toISOString());
  const nowKey = istMonthKey(new Date().toISOString());
  const months = Array.from({ length: 12 }, (_, i) => addMonthsToKey(nowKey, -i));
  const banks = (accounts.data?.accounts ?? []).filter((a) => a.type === 'SAVINGS' || a.type === 'CURRENT');
  const set = (patch: Filters) => setF((s) => ({ ...s, ...patch }));
  // A start day with no end day yet means that single day.
  const apply = () => onApply({ ...f, to: f.from ? (f.to ?? f.from) : undefined });
  const presets = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
  ];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter"
      action={<Button label="Apply" size="sm" onPress={apply} />}
      footer={
        <Row gap={space.md}>
          <Button label="Clear all" variant="outline" style={{ flex: 1 }} onPress={() => onApply({})} />
          <Button label="Apply" style={{ flex: 1 }} onPress={apply} />
        </Row>
      }
    >
      <T v="smallMedium" tone="secondary" style={{ marginBottom: space.sm }}>
        Date
      </T>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Chip
          label="Custom dates"
          icon={<CalendarDays size={14} color={custom ? c.primaryText : c.text} />}
          selected={custom}
          onPress={() => {
            setCustom(!custom);
            set({ month: undefined, from: undefined, to: undefined });
          }}
        />
        {months.map((m) => (
          <Chip
            key={m}
            label={formatMonthKey(m, 'short')}
            selected={!custom && f.month === m}
            onPress={() => {
              setCustom(false);
              set({ month: f.month === m && !custom ? undefined : m, from: undefined, to: undefined });
            }}
          />
        ))}
      </Row>
      {custom ? (
        <View style={{ marginTop: space.lg }}>
          <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            {presets.map((p) => {
              const from = shiftDay(today, -(p.days - 1));
              return <Chip key={p.label} label={p.label} selected={f.from === from && f.to === today} onPress={() => set({ from, to: today })} />;
            })}
          </Row>
          <T v="small" tone="secondary" style={{ marginBottom: space.sm }} accessibilityLiveRegion="polite">
            {!f.from ? 'Tap a start date.' : !f.to ? `From ${rangeLabel(f.from, undefined, today)}. Now tap an end date, or Apply for just this day.` : `Showing ${rangeLabel(f.from, f.to, today)}`}
          </T>
          <DateRangeCalendar from={f.from} to={f.to} today={today} onChange={(r) => set(r)} />
        </View>
      ) : null}
      {banks.length > 1 ? (
        <>
          <T v="smallMedium" tone="secondary" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            Account
          </T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {banks.map((a) => (
              <Chip key={a.id} label={`${a.fip.shortName} ••${a.maskedNumber.slice(-4)}`} selected={f.accountId === a.id} onPress={() => set({ accountId: f.accountId === a.id ? undefined : a.id })} />
            ))}
          </Row>
        </>
      ) : null}
      <T v="smallMedium" tone="secondary" style={{ marginTop: space.xl, marginBottom: space.sm }}>
        Category
      </T>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {SPEND_CATEGORY_IDS.map((id) => (
          <Chip key={id} label={`${category(id).emoji} ${category(id).name}`} selected={f.categoryId === id} onPress={() => set({ categoryId: f.categoryId === id ? undefined : id })} />
        ))}
      </Row>
    </Sheet>
  );
}
