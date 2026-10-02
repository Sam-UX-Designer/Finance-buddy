import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Calendar, CalendarClock, ChevronDown, ChevronRight, ChevronUp, CircleUserRound, Ellipsis, EyeOff, Plus, RefreshCw, SlidersHorizontal, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { category, formatDate, formatINR, formatINRCompact, formatMonthKey, type HomeDTO } from '@finance-buddy/core';
import { haptics } from '@/lib/haptics';
import { useBudgets, useHome, useSync, useTxns } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { BalanceCards } from '@/features/BalanceCards';
import { TxnRow } from '@/features/TxnRow';
import { SIChatPanel } from '@/features/SIChatPanel';
import { SendSheet } from '@/features/SendSheet';
import { Button, IconButton, Toggle } from '@/ui/controls';
import { EmojiAvatar, IconTile, Money } from '@/ui/display';
import { Banner, ErrorState, FadeIn, PAGE_X, Screen, Skeleton, useContentWidth, useSoftShadow, useTabBarInset, useWide, WIDE_PAGE_X } from '@/ui/layout';
import { GlassSurface } from '@/ui/glass';
import { Card, LongPressContext, Press, Row, SectionTitle, T } from '@/ui/primitives';
import { useHomeLayout, useUpdatedWidgets, WIDGET_TITLES, type WidgetId } from '@/features/homeLayout';
import { SIOrb } from '@/ui/SIOrb';
import { Icon3D, innerBlock, LinkAction, Section, SubHeader } from '@/ui/section';

/** Home answers: "How am I doing financially right now?" (Blueprint §8). */
export default function HomeScreen() {
  const { c } = useTheme();
  const home = useHome();
  const sync = useSync();
  const [hidden, setHidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  // Desktop: a question for the chat panel (from a card's "See why"); n counts asks so a repeat still sends.
  const [chatQuestion, setChatQuestion] = useState<{ q: string; n: number } | undefined>();
  const d = home.data;
  const wide = useWide();
  const contentWidth = useContentWidth();
  const tabInset = useTabBarInset();
  const { layout, move, setHidden: setCardHidden, setSmart, reset } = useHomeLayout();
  const updated = useUpdatedWidgets(d);

  const refresh = async () => {
    try {
      await sync.mutateAsync();
      haptics.success();
    } catch {
      // Sync errors surface through the sync banner after refetch.
    }
    await home.refetch();
  };
  const startEditing = () => {
    if (editing) return;
    haptics.tap();
    setEditing(true);
  };
  const stopEditing = () => {
    haptics.select();
    setEditing(false);
  };

  // Cards below the balance, in the person's order. Changed cards go first (unless they turned that off).
  const available = (id: WidgetId) => !!d && (id === 'investments' ? !!d.investments : id === 'networth' ? !!d.wealth : true);
  const visible = layout.order.filter((id) => available(id) && !layout.hidden.includes(id));
  const ordered = layout.smart && !editing ? [...visible.filter((id) => updated.has(id)), ...visible.filter((id) => !updated.has(id))] : visible;
  const hiddenCards = layout.order.filter((id) => available(id) && layout.hidden.includes(id));

  const renderCard = (id: WidgetId) => {
    if (!d) return null;
    switch (id) {
      case 'today':
        return <TodaySpending t={d.today} expandable={wide} />;
      case 'month':
        return <ThisMonth m={d.month} />;
      case 'si':
        return <SINoticed d={d} onAsk={wide ? (q) => setChatQuestion((p) => ({ q, n: (p?.n ?? 0) + 1 })) : undefined} />;
      case 'investments':
        return d.investments ? <InvestmentsCard inv={d.investments} hidden={hidden} /> : null;
      case 'upcoming':
        return <Upcoming u={d.upcoming} />;
      case 'networth':
        return d.wealth ? <NetWorthCard w={d.wealth} hidden={hidden} /> : null;
    }
  };
  const actionFor = (id: WidgetId): { label: string; onPress: () => void } | undefined => {
    if (id === 'today') return { label: 'See all', onPress: () => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses' } }) };
    if (id === 'investments' || id === 'networth') return { label: 'Details', onPress: () => router.push('/(tabs)/wealth') };
    if (id === 'upcoming') return { label: 'View all', onPress: () => router.push('/upcoming') };
    return undefined;
  };
  const widget = (id: WidgetId, i: number) => (
    <FadeIn key={id} delay={120 + i * 60}>
      <Widget
        id={id}
        index={i}
        editing={editing}
        updated={layout.smart && updated.has(id)}
        action={actionFor(id)}
        first={i === 0}
        last={i === ordered.length - 1}
        onMove={(dir) => {
          haptics.select();
          move(id, dir, visible);
        }}
        onHide={() => {
          haptics.select();
          setCardHidden(id, true);
        }}
        onLongPress={startEditing}
      >
        {renderCard(id)}
      </Widget>
    </FadeIn>
  );

  const balanceBlock = d ? (
    <>
      <View style={{ marginTop: space.lg }}>
        <BalanceCards total={d.balance.total} accounts={d.balance.accounts} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />
      </View>
      <Row gap={space.md} style={{ marginTop: space.lg }}>
        <Button label="Send" size="md" style={{ flex: 1 }} onPress={() => setSending(true)} />
        <Button label="View Accounts" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/accounts')} />
      </Row>
    </>
  ) : null;

  const editFooter = (
    <View style={{ marginTop: space.xxl, alignItems: 'center', gap: space.md }}>
      {editing && hiddenCards.length ? (
        <View style={{ alignSelf: 'stretch' }}>
          <SectionTitle>Hidden cards</SectionTitle>
          <Card style={{ paddingVertical: space.xs }}>
            {hiddenCards.map((id, i) => (
              <Row key={id} style={{ justifyContent: 'space-between', paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
                <T v="body">{WIDGET_TITLES[id]}</T>
                <Press
                  onPress={() => {
                    haptics.select();
                    setCardHidden(id, false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${WIDGET_TITLES[id]}`}
                  hitSlop={8}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.positive, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={18} color="#FFFFFF" />
                </Press>
              </Row>
            ))}
          </Card>
        </View>
      ) : null}
      {editing ? (
        <Press onPress={reset} accessibilityRole="button" hitSlop={8}>
          <T v="smallMedium" tone="secondary">
            Reset to default order
          </T>
        </Press>
      ) : (
        <Press onPress={startEditing} accessibilityRole="button" accessibilityHint="Reorder or hide the cards on Home" hitSlop={8}>
          <Row gap={6}>
            <SlidersHorizontal size={14} color={c.textSecondary} />
            <T v="smallMedium" tone="secondary">
              Customize Home
            </T>
          </Row>
        </Press>
      )}
    </View>
  );

  const editBar = editing ? (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: (wide ? space.lg : tabInset) + space.sm, alignItems: 'center', paddingHorizontal: wide ? 0 : PAGE_X }}>
      <GlassSurface radius={28} style={{ width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: 6, height: 56, gap: space.md }}>
        <T v="small" style={{ flex: 1 }} numberOfLines={2}>
          Show updated cards first
        </T>
        <Toggle label="Show updated cards first" value={layout.smart} onChange={setSmart} />
        <Button label="Done" size="md" onPress={stopEditing} style={{ paddingHorizontal: space.xl }} />
      </GlassSurface>
    </View>
  ) : null;

  const greetingRow = (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: space.lg }}>
      <Row gap={space.md} style={{ flexShrink: 1 }}>
        {/* The mascot is Super Intelligence: it greets you, and a tap opens it. */}
        <Press onPress={() => router.push('/(tabs)/si')} accessibilityRole="button" accessibilityLabel="Open Super Intelligence" scaleTo={0.92} hitSlop={6}>
          <SIOrb size={54} />
        </Press>
        <View style={{ flexShrink: 1 }}>
          <T v="subtitle" style={{ fontFamily: 'Inter_400Regular', fontSize: 20, lineHeight: 26 }}>
            {d ? `${d.greeting},` : ' '}
          </T>
          <T v="title" style={{ fontSize: 26, lineHeight: 32 }} numberOfLines={1}>
            {d ? (d.name ?? 'there') : ' '}
          </T>
        </View>
      </Row>
      {wide ? (
        // Desktop: the main actions sit up here. There's no pull-to-refresh, so refreshing is a button;
        // notifications and settings live in the sidebar.
        <Row gap={space.sm} style={{ alignSelf: 'center' }}>
          {d ? (
            <>
              <Button label="Send" size="md" onPress={() => setSending(true)} style={{ paddingHorizontal: space.xl }} />
              <Button label="View Accounts" variant="secondary" size="md" onPress={() => router.push('/accounts')} style={{ paddingHorizontal: space.xl }} />
            </>
          ) : null}
          <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            {sync.isPending || home.isRefetching ? <ActivityIndicator color={c.textSecondary} accessibilityLabel="Refreshing" /> : <IconButton icon={RefreshCw} label="Refresh your accounts" onPress={refresh} />}
          </View>
        </Row>
      ) : (
        <Row style={{ marginRight: -8 }}>
          <IconButton icon={Bell} label={d?.unreadNotifications ? `Notifications, ${d.unreadNotifications} unread` : 'Notifications'} dot={!!d?.unreadNotifications} onPress={() => router.push('/notifications')} />
          <IconButton icon={CircleUserRound} label="Profile and settings" onPress={() => router.push('/settings')} />
        </Row>
      )}
    </Row>
  );

  const body =
    home.error && !d ? (
      <ErrorState error={home.error} onRetry={() => home.refetch()} />
    ) : !d ? (
      <HomeSkeleton />
    ) : (
      <View>
        <SyncNotice d={d} />
        <FadeIn>{balanceBlock}</FadeIn>
        {ordered.map(widget)}
        {editFooter}
        {editing ? <View style={{ height: 80 }} /> : null}
      </View>
    );

  if (wide) {
    // Desktop: every bank card in one row across the top, then three equal columns: This Month,
    // Spending and Super Intelligence (two columns on narrower windows).
    const threeColumns = contentWidth - WIDE_PAGE_X * 2 >= 1040;
    const toActivity = (params: Record<string, string>) => router.push({ pathname: '/(tabs)/activity', params });
    const thisMonth = d ? (
      <Section
        icon={<Icon3D emoji="📅" size={44} />}
        title="This Month"
        subtitle="Your money at a glance"
        right={
          <Press onPress={() => toActivity({ month: d.month.key })} accessibilityRole="button" accessibilityLabel={`${formatMonthKey(d.month.key)} transactions`} style={{ height: 32, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.sm, justifyContent: 'center' }}>
            <Row gap={6}>
              <Calendar size={14} color={c.textSecondary} />
              <T v="smallMedium">{formatMonthKey(d.month.key, 'short')}</T>
            </Row>
          </Press>
        }
      >
        <MonthMetrics m={d.month} />
        {d.investments ? (
          <View>
            <SubHeader title="Investments" action={{ label: 'Details', onPress: () => router.push('/(tabs)/wealth') }} />
            <InvestmentsCard inv={d.investments} hidden={hidden} inner />
          </View>
        ) : null}
        {d.wealth ? (
          <View>
            <SubHeader title="Net worth" action={{ label: 'Details', onPress: () => router.push('/(tabs)/wealth') }} />
            <NetWorthCard w={d.wealth} hidden={hidden} inner />
          </View>
        ) : null}
      </Section>
    ) : null;
    const spendingSection = d ? (
      <Section icon={<Icon3D emoji="🛍" size={40} />} title="Spending" subtitle="Track all your expenses" right={<LinkAction label="See all" onPress={() => toActivity({ filter: 'expenses' })} />}>
        <TodaySpending t={d.today} expandable inner />
        <View>
          <SubHeader title="Spending Insights" note="This month" />
          <SINoticed d={d} inner onAsk={(q) => setChatQuestion((p) => ({ q, n: (p?.n ?? 0) + 1 }))} />
        </View>
        <CategorySpend />
      </Section>
    ) : null;
    const intelligence = d ? (
      <>
        <SIChatPanel question={chatQuestion} />
        <Section title="Upcoming Payments" right={<LinkAction label="View all" onPress={() => router.push('/upcoming')} />}>
          <UpcomingList u={d.upcoming} />
        </Section>
      </>
    ) : null;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: WIDE_PAGE_X, paddingBottom: space.xxxl }}>
          {greetingRow}
          {home.error && !d ? (
            <ErrorState error={home.error} onRetry={() => home.refetch()} />
          ) : !d ? (
            <HomeSkeleton />
          ) : (
            <>
              <SyncNotice d={d} />
              <FadeIn style={{ marginTop: space.lg }}>
                <BalanceCards strip total={d.balance.total} accounts={d.balance.accounts} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />
              </FadeIn>
              {/* Three equal columns: what's happening with my money, where it's going, and what Finance Buddy understands. */}
              <Row gap={space.xl} style={{ alignItems: 'flex-start', marginTop: space.lg }}>
                {threeColumns ? (
                  [thisMonth, spendingSection, intelligence].map((col, i) => (
                    <View key={i} style={{ flex: 1, minWidth: 0, gap: space.xl }}>
                      {col}
                    </View>
                  ))
                ) : (
                  <>
                    <View style={{ flex: 1, minWidth: 0, gap: space.xl }}>{thisMonth}</View>
                    <View style={{ flex: 1, minWidth: 0, gap: space.xl }}>
                      {spendingSection}
                      {intelligence}
                    </View>
                  </>
                )}
              </Row>
            </>
          )}
        </ScrollView>
        {editBar}
        <SendSheet visible={sending} onClose={() => setSending(false)} />
      </View>
    );
  }

  return (
    <Screen refreshing={home.isRefetching || sync.isPending} onRefresh={refresh} compactTitle={d ? `${d.greeting}, ${d.name ?? 'there'}` : 'Home'} overlay={editBar}>
      {greetingRow}
      {body}
      <SendSheet visible={sending} onClose={() => setSending(false)} />
    </Screen>
  );
}

/**
 * One Home card with its header. Long press (or "Customize Home") enters edit mode: the cards
 * wiggle and each gets move up / move down / hide controls.
 */
function Widget({
  id,
  index,
  editing,
  updated,
  action,
  first,
  last,
  onMove,
  onHide,
  onLongPress,
  children,
}: {
  id: WidgetId;
  index: number;
  editing: boolean;
  updated: boolean;
  action?: { label: string; onPress: () => void };
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onHide: () => void;
  onLongPress: () => void;
  children: ReactNode;
}) {
  const { c, reduceMotion } = useTheme();
  const title = WIDGET_TITLES[id];
  const wiggle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!editing || reduceMotion) {
      wiggle.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 130, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(wiggle, { toValue: -1, duration: 260, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(wiggle, { toValue: 0, duration: 130, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    const t = setTimeout(() => loop.start(), (index % 3) * 70);
    return () => {
      clearTimeout(t);
      loop.stop();
      wiggle.setValue(0);
    };
  }, [editing, reduceMotion]);
  const rotate = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-0.45deg', '0.45deg'] });

  return (
    <View style={{ marginTop: space.xxl }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md, minHeight: 28 }}>
        <Row gap={space.sm} style={{ flexShrink: 1 }}>
          <T v="section" accessibilityRole="header">
            {title}
          </T>
          {updated && !editing ? (
            <View style={{ backgroundColor: c.infoSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <T v="caption" color={c.info}>
                Updated
              </T>
            </View>
          ) : null}
        </Row>
        {editing ? (
          <Row gap={space.xs}>
            <EditButton icon={ChevronUp} label={`Move ${title} up`} disabled={first} onPress={() => onMove(-1)} />
            <EditButton icon={ChevronDown} label={`Move ${title} down`} disabled={last} onPress={() => onMove(1)} />
            <EditButton icon={EyeOff} label={`Hide ${title}`} onPress={onHide} />
          </Row>
        ) : action ? (
          <Press onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`} hitSlop={10}>
            <T v="smallMedium" tone="secondary">
              {action.label}
            </T>
          </Press>
        ) : null}
      </Row>
      <LongPressContext.Provider value={editing ? undefined : onLongPress}>
        <Pressable onLongPress={onLongPress} delayLongPress={450} disabled={editing} accessible={false}>
          <Animated.View pointerEvents={editing ? 'none' : 'auto'} style={{ transform: [{ rotate }], opacity: editing ? 0.92 : 1 }}>
            {children}
          </Animated.View>
        </Pressable>
      </LongPressContext.Provider>
    </View>
  );
}

function EditButton({ icon: Icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={17} color={c.text} />
    </Press>
  );
}

function ThisMonth({ m }: { m: HomeDTO['month'] }) {
  const { c } = useTheme();
  // Three tiles side by side; in a narrow desktop column they stack as rows so amounts never get cut.
  const [width, setWidth] = useState(0);
  const rows = width > 0 && width < 300;
  const tiles = [
    { label: 'Income', value: m.income, color: c.positive, bg: c.positiveSoft, icon: <ArrowDownLeft size={14} color={c.positive} />, filter: 'income' },
    { label: 'Spent', value: m.spent, color: c.negative, bg: c.negativeSoft, icon: <ArrowUpRight size={14} color={c.negative} />, filter: 'expenses' },
    { label: 'Invested', value: m.invested, color: c.text, bg: c.surfaceMuted, icon: <TrendingUp size={14} color={c.textSecondary} />, filter: 'investments' },
  ] as const;
  const open = (filter: string) => router.push({ pathname: '/(tabs)/activity', params: { filter, month: m.key } });
  if (rows) {
    return (
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Card style={{ paddingVertical: space.xs }}>
          {tiles.map((t, i) => (
            <Press key={t.label} onPress={() => open(t.filter)} accessibilityRole="button" accessibilityLabel={`${t.label} this month: ${formatINR(t.value)}`} scaleTo={0.99}>
              <Row gap={space.sm} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>{t.icon}</View>
                <T v="small" color={t.color === c.text ? c.textSecondary : t.color} style={{ flex: 1 }}>
                  {t.label}
                </T>
                <T v="bodySemibold" color={t.color}>
                  {formatINR(t.value, { decimals: 0 })}
                </T>
              </Row>
            </Press>
          ))}
        </Card>
      </View>
    );
  }
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Row gap={space.sm}>
        {tiles.map((t) => (
          <MonthTile key={t.label} label={t.label} value={t.value} color={t.color} bg={t.bg} icon={t.icon} onPress={() => open(t.filter)} />
        ))}
      </Row>
    </View>
  );
}

function Upcoming({ u }: { u: HomeDTO['upcoming'] }) {
  const { c } = useTheme();
  return (
    <Card>
      {u.count ? (
        <Press onPress={() => router.push('/upcoming')} accessibilityRole="button" accessibilityLabel={`${u.count} payments, ${formatINR(u.total)} in the next ${u.days} days. View all`} scaleTo={0.99}>
          <Row gap={space.md}>
            <IconTile icon={CalendarClock} color={c.negative} bg={c.negativeSoft} />
            <View style={{ flex: 1 }}>
              <T v="small" tone="secondary">{`${u.count} payment${u.count === 1 ? '' : 's'} · next ${u.days} days`}</T>
              <T v="subtitle">{formatINR(u.total, { decimals: 0 })}</T>
            </View>
            <ArrowRight size={16} color={c.textTertiary} />
          </Row>
          {u.items[0] ? (
            <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
              {`Next: ${u.items[0].merchantName} · ${formatINR(u.items[0].amount, { decimals: 0 })} on ${formatDate(u.items[0].dueDate)}`}
            </T>
          ) : null}
        </Press>
      ) : (
        <T v="small" tone="secondary">
          No recurring payments found yet. We’ll list bills, rent and SIPs here once we see them repeat.
        </T>
      )}
    </Card>
  );
}

/** Investments at a glance: current value and returns so far. */
function InvestmentsCard({ inv, hidden, inner }: { inv: NonNullable<HomeDTO['investments']>; hidden: boolean; inner?: boolean }) {
  const { c } = useTheme();
  const up = inv.gain >= 0;
  return (
    <Press onPress={() => router.push('/(tabs)/wealth')} accessibilityRole="button" accessibilityLabel={hidden ? 'Investments, hidden. Open Wealth' : `Investments worth ${formatINR(inv.value)}. Open Wealth`} scaleTo={0.99}>
      <Card style={inner ? innerBlock(c) : undefined}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <T v="small" tone="secondary">
              Current value
            </T>
            <Money value={inv.value} v="subtitle" decimals={0} hidden={hidden} />
          </View>
          {!hidden && inv.invested > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <T v="small" tone="secondary">
                Returns so far
              </T>
              <T v="bodySemibold" tone={up ? 'positive' : 'negative'}>
                {`${up ? '+' : '−'}${formatINR(Math.abs(inv.gain), { decimals: 0 })}${inv.gainPct != null ? ` (${Math.abs(inv.gainPct).toFixed(1)}%)` : ''}`}
              </T>
            </View>
          ) : null}
        </Row>
        <View style={{ marginTop: space.md, gap: 10 }}>
          {inv.lines.map((l) => (
            <Row key={l.kind} gap={inner ? space.sm : 0} style={{ justifyContent: 'space-between' }}>
              {inner ? <Icon3D emoji={INVESTMENT_ICON[l.kind] ?? '💰'} size={20} /> : null}
              <T v="small" tone="secondary" style={{ flex: 1 }}>
                {l.label}
              </T>
              <T v="smallMedium" style={{ fontVariant: ['tabular-nums'] }}>
                {hidden ? '₹ ••••' : formatINRCompact(l.value)}
              </T>
              <T v="small" tone={(l.gain ?? 0) >= 0 ? 'positive' : 'negative'} style={{ width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {l.gainPct != null && !hidden ? `${l.gainPct >= 0 ? '+' : '−'}${Math.abs(l.gainPct).toFixed(1)}%` : ''}
              </T>
            </Row>
          ))}
        </View>
      </Card>
    </Press>
  );
}

/** Today's spending and the latest three purchases. On desktop it expands to show more. */
function TodaySpending({ t, expandable, inner }: { t: HomeDTO['today']; expandable?: boolean; inner?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card style={[{ paddingVertical: space.md }, inner ? innerBlock(c) : null]}>
      <Row style={{ justifyContent: 'space-between', paddingBottom: space.sm, borderBottomWidth: t.recent.length ? 1 : 0, borderBottomColor: c.divider }}>
        <T v="small" tone="secondary">
          {t.count ? `Today · ${t.count} purchase${t.count === 1 ? '' : 's'}` : 'Today'}
        </T>
        <T v="bodySemibold" tone={t.spent ? 'negative' : 'secondary'}>
          {t.spent ? formatINR(t.spent, { decimals: 0 }) : 'No spending yet'}
        </T>
      </Row>
      {t.recent.length ? (
        t.recent.map((x) => <TxnRow key={x.id} t={x} showDay />)
      ) : (
        <T v="small" tone="secondary" style={{ paddingTop: space.sm }}>
          Your purchases will show here.
        </T>
      )}
      {expandable && t.recent.length ? (
        <>
          {open ? <MoreSpending skip={t.recent.map((x) => x.id)} /> : null}
          <Press
            onPress={() => {
              haptics.select();
              setOpen((o) => !o);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={8}
            style={{ alignSelf: 'center', marginTop: space.sm, paddingVertical: 4, paddingHorizontal: space.md }}
          >
            <Row gap={4}>
              <T v="smallMedium" tone="secondary">
                {open ? 'Show less' : 'Show more'}
              </T>
              {open ? <ChevronUp size={14} color={c.textSecondary} /> : <ChevronDown size={14} color={c.textSecondary} />}
            </Row>
          </Press>
        </>
      ) : null}
    </Card>
  );
}

/** The purchases before the latest three (loaded when the spending card is expanded). */
function MoreSpending({ skip }: { skip: string[] }) {
  const { c } = useTheme();
  const txns = useTxns({ filter: 'expenses', q: '' });
  const items = (txns.data?.pages[0]?.items ?? []).filter((x) => !skip.includes(x.id)).slice(0, 7);
  if (!txns.data) return <ActivityIndicator style={{ marginTop: space.sm }} color={c.textSecondary} accessibilityLabel="Loading more purchases" />;
  return (
    <FadeIn>
      {items.map((x) => (
        <TxnRow key={x.id} t={x} showDay />
      ))}
    </FadeIn>
  );
}

/** Net worth: what you own minus what you owe, and what it's made of. */
function NetWorthCard({ w, hidden, inner }: { w: NonNullable<HomeDTO['wealth']>; hidden: boolean; inner?: boolean }) {
  const { c } = useTheme();
  const palette = [c.info, c.positive, c.loan, c.warning, c.textTertiary];
  const up = w.change >= 0;
  return (
    <Press onPress={() => router.push('/(tabs)/wealth')} accessibilityRole="button" accessibilityLabel={hidden ? 'Net worth, hidden. Open Wealth' : `Net worth ${formatINR(w.netWorth)}. Open Wealth`} scaleTo={0.99}>
      <Card style={inner ? innerBlock(c) : undefined}>
        <View>
          <Money value={w.netWorth} v="amount" decimals={0} hidden={hidden} />
        </View>
        {!hidden && w.change !== 0 ? (
          <T v="smallMedium" tone={up ? 'positive' : 'negative'} style={{ marginTop: 2 }}>
            {`${up ? '↑' : '↓'} ${formatINR(Math.abs(w.change), { decimals: 0 })} since ${formatDate(w.sinceDate)}`}
          </T>
        ) : null}
        {w.parts.length ? (
          <>
            <Row gap={2} style={{ height: 8, borderRadius: 4, overflow: 'hidden', marginTop: space.md }}>
              {w.parts.map((p, i) => (
                <View key={p.kind} style={{ flex: p.value, height: 8, backgroundColor: palette[i % palette.length] }} />
              ))}
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 6, marginTop: space.md }}>
              {w.parts.map((p, i) => (
                <Row key={p.kind} gap={6}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette[i % palette.length] }} />
                  <T v="caption" tone="secondary">{`${p.label} ${hidden ? '••••' : formatINRCompact(p.value)}`}</T>
                </Row>
              ))}
            </View>
          </>
        ) : null}
        <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
          {w.liabilities > 0 ? 'Everything you own minus loans you owe.' : 'Everything you own: bank balance, investments, EPF and money lent. No loans connected.'}
        </T>
      </Card>
    </Press>
  );
}

function MonthTile({ label, value, color, bg, icon, onPress }: { label: string; value: number; color: string; bg: string; icon: React.ReactNode; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} this month: ${formatINR(value)}`} style={{ flex: 1 }}>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.md, gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="small" color={color === c.text ? c.textSecondary : color}>
          {label}
        </T>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      </Row>
      <T v="bodySemibold" color={color} numberOfLines={1} adjustsFontSizeToFit>
        {formatINR(value, { decimals: 0 })}
      </T>
      </View>
    </Press>
  );
}

function SINoticed({ d, onAsk, inner }: { d: HomeDTO; onAsk?: (q: string) => void; inner?: boolean }) {
  const { c } = useTheme();
  const i = d.insight;
  return (
    <Card style={inner ? innerBlock(c) : undefined}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <SIOrb size={34} />
        <View style={{ flex: 1, gap: 6, paddingTop: 6 }}>
          <T v="body" tone={i ? 'primary' : 'secondary'}>
            {i ? i.body : 'Not enough evidence for an insight yet. Super Intelligence only speaks up when your data clearly shows something worth knowing.'}
          </T>
        </View>
        {i?.categoryId ? (
          <View style={{ marginTop: 22 }}>
            <EmojiAvatar emoji={category(i.categoryId).emoji} size={54} />
          </View>
        ) : null}
      </Row>
      {i ? (
        <Press
          onPress={() => (onAsk ? onAsk(i.question) : router.push({ pathname: '/(tabs)/si', params: { q: i.question } }))}
          accessibilityRole="button"
          accessibilityLabel="See why"
          style={{ alignSelf: 'flex-end', marginTop: space.sm }}
          hitSlop={10}
        >
          <Row gap={4}>
            <T v="smallMedium">See why</T>
            <ArrowRight size={14} color={c.text} />
          </Row>
        </Press>
      ) : null}
    </Card>
  );
}

function SyncNotice({ d }: { d: HomeDTO }) {
  if (d.sync.health === 'OK') return null;
  if (d.sync.health === 'NO_DATA') {
    return (
      <View style={{ marginTop: space.lg }}>
        <Banner tone="info" title="No accounts connected" body="Connect an account to see your balance and insights." action="Connect" onAction={() => router.push('/onboarding/discover')} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: space.lg }}>
      <Banner
        tone={d.sync.health === 'FAILED' ? 'negative' : d.sync.health === 'SYNCING' ? 'info' : 'warning'}
        title={d.sync.health === 'PARTIAL' ? 'Partial data' : d.sync.health === 'SYNCING' ? 'Syncing' : 'Sync failed'}
        body={d.sync.message ?? undefined}
        action={d.sync.health === 'SYNCING' ? undefined : 'Fix'}
        onAction={() => router.push('/accounts')}
      />
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={{ gap: space.lg, marginTop: space.lg }} accessibilityLabel="Loading your snapshot">
      <Skeleton height={150} style={{ borderRadius: radius.xl }} />
      <Skeleton height={210} style={{ borderRadius: radius.xl }} />
      <Skeleton height={18} width="40%" />
      <Row gap={space.sm}>
        <Skeleton height={70} style={{ flex: 1 }} width="32%" />
        <Skeleton height={70} width="32%" />
        <Skeleton height={70} width="32%" />
      </Row>
      <Skeleton height={130} style={{ borderRadius: radius.xl }} />
    </View>
  );
}

// ── Desktop Home sections ────────────────────────────────────────────

const INVESTMENT_ICON: Record<string, string> = { MUTUAL_FUNDS: '📊', MUTUAL_FUND: '📊', TERM_DEPOSIT: '🏦', EPF: '🛡' };

/** This month's income, spending and investing as three compact tiles. */
function MonthMetrics({ m }: { m: HomeDTO['month'] }) {
  const { c } = useTheme();
  const tiles = [
    { label: 'Income', value: m.income, color: c.positive, icon: ArrowDownLeft, filter: 'income' },
    { label: 'Spent', value: m.spent, color: c.negative, icon: ArrowUpRight, filter: 'expenses' },
    { label: 'Invested', value: m.invested, color: c.info, icon: TrendingUp, filter: 'investments' },
  ] as const;
  return (
    <Row gap={space.sm}>
      {tiles.map((t) => (
        <Press
          key={t.label}
          onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: t.filter, month: m.key } })}
          accessibilityRole="button"
          accessibilityLabel={`${t.label} this month: ${formatINR(t.value)}`}
          style={{ flex: 1, minWidth: 0 }}
        >
          <View style={[innerBlock(c), { paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption" color={t.color}>
                {t.label}
              </T>
              <t.icon size={14} color={t.color} />
            </Row>
            <T v="bodySemibold" color={t.color} numberOfLines={1}>
              {formatINR(t.value, { decimals: 0 })}
            </T>
          </View>
        </Press>
      ))}
    </Row>
  );
}

/** Where the money went this month: the four biggest spending categories, then "More". */
function CategorySpend() {
  const { c } = useTheme();
  const q = useBudgets();
  if (!q.data) return null;
  const rows = [
    ...q.data.budgets.map((b) => ({ id: b.categoryId, name: b.categoryName, emoji: b.emoji, spent: b.spent })),
    ...q.data.unbudgeted.map((u) => ({ id: u.categoryId, name: u.categoryName, emoji: u.emoji, spent: u.spent })),
  ]
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4);
  if (!rows.length) return null;
  const circle: ViewStyle = { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' };
  return (
    <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }} accessibilityLabel="Spending by category this month">
      {rows.map((r) => (
        <Press
          key={r.id}
          onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses', month: q.data!.monthKey, categoryId: r.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}: ${formatINR(r.spent)} this month`}
          style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}
        >
          <View style={circle}>
            <Icon3D emoji={r.emoji} size={26} />
          </View>
          <T v="caption" tone="secondary" numberOfLines={1}>
            {r.name}
          </T>
          <T v="smallMedium" numberOfLines={1}>
            {formatINR(r.spent, { decimals: 0 })}
          </T>
        </Press>
      ))}
      <Press onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses', month: q.data.monthKey } })} accessibilityRole="button" accessibilityLabel="All spending this month" style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
        <View style={circle}>
          <Ellipsis size={20} color={c.text} />
        </View>
        <T v="caption" tone="secondary">
          More
        </T>
      </Press>
    </Row>
  );
}

/** The next three recurring payments. */
function UpcomingList({ u }: { u: HomeDTO['upcoming'] }) {
  const { c } = useTheme();
  if (!u.items.length) {
    return (
      <T v="small" tone="secondary">
        No recurring payments found yet. Bills, rent and SIPs show up here once they repeat.
      </T>
    );
  }
  return (
    <View>
      {u.items.slice(0, 3).map((p, i) => (
        <Row key={p.seriesKey} gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
          <EmojiAvatar emoji={category(p.categoryId).emoji} categoryId={p.categoryId} merchantKey={p.seriesKey.split('|')[0]} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="bodyMedium" numberOfLines={1}>
              {p.merchantName}
            </T>
            <T v="caption" tone="tertiary" numberOfLines={1}>{`${category(p.categoryId).name} · ${p.overdue ? 'was due ' : ''}${formatDate(p.dueDate)}`}</T>
          </View>
          <T v="bodySemibold" tone="negative">{`− ${formatINR(p.amount, { decimals: 0 })}`}</T>
        </Row>
      ))}
    </View>
  );
}
