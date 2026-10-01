import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, CalendarClock, CircleUserRound, TrendingUp } from 'lucide-react-native';
import { category, formatDate, formatINR, formatINRCompact, type HomeDTO } from '@finance-buddy/core';
import { useHome, useSync } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { BalanceCards } from '@/features/BalanceCards';
import { TxnRow } from '@/features/TxnRow';
import { SendSheet } from '@/features/SendSheet';
import { Button, IconButton } from '@/ui/controls';
import { EmojiAvatar, IconTile, Money } from '@/ui/display';
import { Banner, ErrorState, FadeIn, Screen, Skeleton, useWide } from '@/ui/layout';
import { Card, Press, Row, SectionTitle, T } from '@/ui/primitives';
import { SIOrb } from '@/ui/SIOrb';

/** Home answers: "How am I doing financially right now?" (Blueprint §8). */
export default function HomeScreen() {
  const { c } = useTheme();
  const home = useHome();
  const sync = useSync();
  const [hidden, setHidden] = useState(false);
  const [sending, setSending] = useState(false);
  const d = home.data;
  const wide = useWide();

  const refresh = async () => {
    try {
      await sync.mutateAsync();
    } catch {
      // Sync errors surface through the sync banner after refetch.
    }
    await home.refetch();
  };

  const moneyBlock = d ? (
    <>
      {d.wealth ? <NetWorthCard w={d.wealth} hidden={hidden} /> : null}

      {/* Balance cards */}
      <View style={{ marginTop: space.lg }}>
        <BalanceCards total={d.balance.total} accounts={d.balance.accounts} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />
      </View>
      <Row gap={space.md} style={{ marginTop: space.lg }}>
        <Button label="Send" size="md" style={{ flex: 1 }} onPress={() => setSending(true)} />
        <Button label="View Accounts" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => router.push('/accounts')} />
      </Row>
    </>
  ) : null;
  const thisMonth = d ? (
    <View style={{ marginTop: space.xxl }}>
      <SectionTitle>This Month</SectionTitle>
      <Row gap={space.sm}>
        <MonthTile label="Income" value={d.month.income} color={c.positive} bg={c.positiveSoft} icon={<ArrowDownLeft size={14} color={c.positive} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'income', month: d.month.key } })} />
        <MonthTile label="Spent" value={d.month.spent} color={c.negative} bg={c.negativeSoft} icon={<ArrowUpRight size={14} color={c.negative} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses', month: d.month.key } })} />
        <MonthTile label="Invested" value={d.month.invested} color={c.text} bg={c.surfaceMuted} icon={<TrendingUp size={14} color={c.textSecondary} />} onPress={() => router.push({ pathname: '/(tabs)/activity', params: { filter: 'investments', month: d.month.key } })} />
      </Row>
    </View>
  ) : null;
  const upcoming = d ? (
    <View style={{ marginTop: space.xxl }}>
      <SectionTitle>Upcoming Payments</SectionTitle>
      <Card>
        {d.upcoming.count ? (
          <Press onPress={() => router.push('/upcoming')} accessibilityRole="button" accessibilityLabel={`${d.upcoming.count} payments, ${formatINR(d.upcoming.total)} in the next ${d.upcoming.days} days. View all`} scaleTo={0.99}>
            <Row gap={space.md}>
              <IconTile icon={CalendarClock} color={c.negative} bg={c.negativeSoft} />
              <View style={{ flex: 1 }}>
                <T v="small" tone="secondary">{`${d.upcoming.count} payment${d.upcoming.count === 1 ? '' : 's'} · next ${d.upcoming.days} days`}</T>
                <T v="subtitle">{formatINR(d.upcoming.total, { decimals: 0 })}</T>
              </View>
              <Row gap={4}>
                <T v="smallMedium" tone="secondary">
                  View all
                </T>
                <ArrowRight size={14} color={c.textSecondary} />
              </Row>
            </Row>
            {d.upcoming.items[0] ? (
              <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
                {`Next: ${d.upcoming.items[0].merchantName} · ${formatINR(d.upcoming.items[0].amount, { decimals: 0 })} on ${formatDate(d.upcoming.items[0].dueDate)}`}
              </T>
            ) : null}
          </Press>
        ) : (
          <T v="small" tone="secondary">
            No recurring payments found yet. We’ll list bills, rent and SIPs here once we see them repeat.
          </T>
        )}
      </Card>
    </View>
  ) : null;

  return (
    <Screen refreshing={home.isRefetching || sync.isPending} onRefresh={refresh} maxWidth={wide ? 1120 : undefined}>
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
        <FadeIn>
          <SyncNotice d={d} />
          {wide ? (
            <Row gap={space.xxl} style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1.15 }}>
                {moneyBlock}
                {thisMonth}
                {upcoming}
              </View>
              <View style={{ flex: 1 }}>
                <SINoticed d={d} />
                <TodaySpending t={d.today} />
                {d.investments ? <InvestmentsCard inv={d.investments} hidden={hidden} /> : null}
              </View>
            </Row>
          ) : (
            <>
              {moneyBlock}
              {d.investments ? <InvestmentsCard inv={d.investments} hidden={hidden} /> : null}
              <TodaySpending t={d.today} />
              <SINoticed d={d} />
              {thisMonth}
              {upcoming}
            </>
          )}
        </FadeIn>
      )}
      <SendSheet visible={sending} onClose={() => setSending(false)} />
    </Screen>
  );
}

/** Investments at a glance: current value and returns so far. */
function InvestmentsCard({ inv, hidden }: { inv: NonNullable<HomeDTO['investments']>; hidden: boolean }) {
  const { c } = useTheme();
  const up = inv.gain >= 0;
  return (
    <View style={{ marginTop: space.xxl }}>
      <SectionTitle action="Details" onAction={() => router.push('/(tabs)/wealth')}>
        Investments
      </SectionTitle>
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
    </View>
  );
}

/** Today's spending and the latest three purchases. */
function TodaySpending({ t }: { t: HomeDTO['today'] }) {
  const { c } = useTheme();
  const openAll = () => router.push({ pathname: '/(tabs)/activity', params: { filter: 'expenses' } });
  return (
    <View style={{ marginTop: space.xxl }}>
      <SectionTitle action="See all" onAction={openAll}>
        Spending
      </SectionTitle>
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
    </View>
  );
}

/** Net worth: what you own minus what you owe, and what it's made of. */
function NetWorthCard({ w, hidden }: { w: NonNullable<HomeDTO['wealth']>; hidden: boolean }) {
  const { c } = useTheme();
  const palette = [c.info, c.positive, c.loan, c.warning, c.textTertiary];
  const up = w.change >= 0;
  return (
    <Press onPress={() => router.push('/(tabs)/wealth')} accessibilityRole="button" accessibilityLabel={hidden ? 'Net worth, hidden. Open Wealth' : `Net worth ${formatINR(w.netWorth)}. Open Wealth`} style={{ marginTop: space.lg }} scaleTo={0.99}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small" tone="secondary">
            Net worth
          </T>
          <Row gap={4}>
            <T v="smallMedium" tone="secondary">
              Details
            </T>
            <ArrowRight size={14} color={c.textSecondary} />
          </Row>
        </Row>
        <View style={{ marginTop: 4 }}>
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
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} this month: ${formatINR(value)}`} style={{ flex: 1, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.md, backgroundColor: c.surface, gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="small" color={color === c.text ? c.textSecondary : color}>
          {label}
        </T>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      </Row>
      <T v="bodySemibold" color={color} numberOfLines={1} adjustsFontSizeToFit>
        {formatINR(value, { decimals: 0 })}
      </T>
    </Press>
  );
}

function SINoticed({ d }: { d: HomeDTO }) {
  const { c } = useTheme();
  const i = d.insight;
  return (
    <View style={{ marginTop: space.xxl, backgroundColor: c.siCard, borderRadius: radius.xl, borderWidth: 1, borderColor: c.siCardBorder, padding: space.lg }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <SIOrb size={34} />
        <View style={{ flex: 1, gap: 6 }}>
          <T v="bodySemibold" color={c.loan}>
            SI noticed
          </T>
          <T v="body" tone={i ? 'primary' : 'secondary'}>
            {i ? i.body : 'Not enough evidence for an insight yet. SI only speaks up when your data clearly shows something worth knowing.'}
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
    </View>
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
