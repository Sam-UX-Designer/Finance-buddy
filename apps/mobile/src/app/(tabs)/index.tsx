import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, CalendarClock, ChevronDown, ChevronUp, CircleUserRound, EyeOff, Plus, SlidersHorizontal, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { category, formatDate, formatINR, formatINRCompact, type HomeDTO } from '@finance-buddy/core';
import { haptics } from '@/lib/haptics';
import { useHome, useSync } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { BalanceCards } from '@/features/BalanceCards';
import { TxnRow } from '@/features/TxnRow';
import { SendSheet } from '@/features/SendSheet';
import { Button, IconButton, Toggle } from '@/ui/controls';
import { EmojiAvatar, IconTile, Money } from '@/ui/display';
import { Banner, ErrorState, FadeIn, PAGE_X, Screen, Skeleton, useTabBarInset, useWide } from '@/ui/layout';
import { GlassSurface } from '@/ui/glass';
import { Card, LongPressContext, Press, Row, SectionTitle, T } from '@/ui/primitives';
import { useHomeLayout, useUpdatedWidgets, WIDGET_TITLES, type WidgetId } from '@/features/homeLayout';
import { SIOrb } from '@/ui/SIOrb';

/** Home answers: "How am I doing financially right now?" (Blueprint §8). */
export default function HomeScreen() {
  const { c } = useTheme();
  const home = useHome();
  const sync = useSync();
  const [hidden, setHidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const d = home.data;
  const wide = useWide();
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
        return <TodaySpending t={d.today} />;
      case 'month':
        return <ThisMonth m={d.month} />;
      case 'si':
        return <SINoticed d={d} />;
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
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: (wide ? space.lg : tabInset) + space.sm, alignItems: 'center', paddingHorizontal: PAGE_X }}>
      <GlassSurface radius={28} style={{ width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: 6, height: 56, gap: space.md }}>
        <T v="small" style={{ flex: 1 }} numberOfLines={2}>
          Show updated cards first
        </T>
        <Toggle label="Show updated cards first" value={layout.smart} onChange={setSmart} />
        <Button label="Done" size="md" onPress={stopEditing} style={{ paddingHorizontal: space.xl }} />
      </GlassSurface>
    </View>
  ) : null;

  return (
    <Screen
      refreshing={home.isRefetching || sync.isPending}
      onRefresh={refresh}
      maxWidth={wide ? 1120 : undefined}
      compactTitle={d ? `${d.greeting}, ${d.name ?? 'there'}` : 'Home'}
      overlay={editBar}
    >
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: space.lg }}>
        <View>
          <T v="subtitle" style={{ fontFamily: 'Inter_400Regular', fontSize: 20, lineHeight: 26 }}>
            {d ? `${d.greeting},` : ' '}
          </T>
          <T v="title" style={{ fontSize: 26, lineHeight: 32 }}>
            {d ? `${d.name ?? 'there'} 👋` : ' '}
          </T>
        </View>
        <Row style={{ marginRight: -8, display: wide ? 'none' : 'flex' }}>
          <IconButton icon={Bell} label={d?.unreadNotifications ? `Notifications, ${d.unreadNotifications} unread` : 'Notifications'} dot={!!d?.unreadNotifications} onPress={() => router.push('/notifications')} />
          <IconButton icon={CircleUserRound} label="Profile and settings" onPress={() => router.push('/settings')} />
        </Row>
      </Row>

      {home.error && !d ? (
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      ) : !d ? (
        <HomeSkeleton />
      ) : (
        <View>
          <SyncNotice d={d} />
          {wide ? (
            <Row gap={space.xxl} style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1.15 }}>
                <FadeIn>{balanceBlock}</FadeIn>
                {ordered.map((id, i) => (i % 2 === 1 ? widget(id, i) : null))}
              </View>
              <View style={{ flex: 1 }}>{ordered.map((id, i) => (i % 2 === 0 ? widget(id, i) : null))}</View>
            </Row>
          ) : (
            <>
              <FadeIn>{balanceBlock}</FadeIn>
              {ordered.map(widget)}
            </>
          )}
          {editFooter}
          {editing ? <View style={{ height: 80 }} /> : null}
        </View>
      )}
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
  return (
    <Row gap={space.sm}>
      <MonthTile label="Income" value={m.income} color={c.positive} bg={c.positiveSoft} icon={<ArrowDownLeft size={14} color={c.positive} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'income', month: m.key } })} />
      <MonthTile label="Spent" value={m.spent} color={c.negative} bg={c.negativeSoft} icon={<ArrowUpRight size={14} color={c.negative} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses', month: m.key } })} />
      <MonthTile label="Invested" value={m.invested} color={c.text} bg={c.surfaceMuted} icon={<TrendingUp size={14} color={c.textSecondary} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'investments', month: m.key } })} />
    </Row>
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
function InvestmentsCard({ inv, hidden }: { inv: NonNullable<HomeDTO['investments']>; hidden: boolean }) {
  const { c } = useTheme();
  const up = inv.gain >= 0;
  return (
    <Press onPress={() => router.push('/(tabs)/wealth')} accessibilityRole="button" accessibilityLabel={hidden ? 'Investments, hidden. Open Wealth' : `Investments worth ${formatINR(inv.value)}. Open Wealth`} scaleTo={0.99}>
      <Card>
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
            <Row key={l.kind} style={{ justifyContent: 'space-between' }}>
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

/** Today's spending and the latest three purchases. */
function TodaySpending({ t }: { t: HomeDTO['today'] }) {
  const { c } = useTheme();
  return (
    <Card style={{ paddingVertical: space.md }}>
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
    </Card>
  );
}

/** Net worth: what you own minus what you owe, and what it's made of. */
function NetWorthCard({ w, hidden }: { w: NonNullable<HomeDTO['wealth']>; hidden: boolean }) {
  const { c } = useTheme();
  const palette = [c.info, c.positive, c.loan, c.warning, c.textTertiary];
  const up = w.change >= 0;
  return (
    <Press onPress={() => router.push('/(tabs)/wealth')} accessibilityRole="button" accessibilityLabel={hidden ? 'Net worth, hidden. Open Wealth' : `Net worth ${formatINR(w.netWorth)}. Open Wealth`} scaleTo={0.99}>
      <Card>
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

function SINoticed({ d }: { d: HomeDTO }) {
  const { c } = useTheme();
  const i = d.insight;
  return (
    <Card>
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
          onPress={() => router.push({ pathname: '/(tabs)/si', params: { q: i.question } })}
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
