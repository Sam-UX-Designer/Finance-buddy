import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { CalendarClock, PiggyBank, TrendingUp } from 'lucide-react-native';
import { formatINR, type HomeDTO } from '@finance-buddy/core';
import { haptics } from '@/lib/haptics';
import { useHome, useInvalidateFinance } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { FipMark, Money } from '@/ui/display';
import { Banner, FadeIn, Screen, Skeleton } from '@/ui/layout';
import { Card, Row, T } from '@/ui/primitives';
import { SIOrb } from '@/ui/SIOrb';

/**
 * The first payoff after connecting: the whole picture appears at once (net worth counting up,
 * every bank in one place), then a few things SI has already noticed in the person's own numbers.
 */
export default function SuccessScreen() {
  const { c } = useTheme();
  const { partial } = useLocalSearchParams<{ partial?: string }>();
  const { refreshMe } = useSession();
  const invalidate = useInvalidateFinance();
  const home = useHome();
  const d = home.data;
  const celebrated = useRef(false);

  useEffect(() => {
    void refreshMe();
    void invalidate();
  }, []);
  useEffect(() => {
    if (!d || celebrated.current) return;
    celebrated.current = true;
    haptics.success();
  }, [d]);

  const finds = d ? findings(d) : [];
  const banks = d ? uniqueBanks(d) : [];

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label="Open my dashboard" onPress={() => router.replace('/(tabs)')} />}>
      <FadeIn>
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <SIOrb size={28} />
          <T v="small" tone="secondary">
            Super Intelligence
          </T>
        </Row>
        <T v="title" accessibilityRole="header" style={{ marginTop: space.md }}>
          Here’s your money, all in one place
        </T>
      </FadeIn>

      {d ? (
        <>
          <FadeIn delay={150}>
            <Hero d={d} banks={banks} />
          </FadeIn>

          {finds.length ? (
            <FadeIn delay={500}>
              <T v="bodySemibold" style={{ marginTop: space.xxl, marginBottom: space.md }}>
                What I already found
              </T>
            </FadeIn>
          ) : null}
          {finds.map((f, i) => (
            <FadeIn key={f.key} delay={700 + i * 220}>
              <Card style={{ marginBottom: space.md }}>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: f.soft, alignItems: 'center', justifyContent: 'center' }}>{f.icon}</View>
                  <View style={{ flex: 1 }}>
                    <T v="bodySemibold">{f.title}</T>
                    <T v="small" tone="secondary" style={{ marginTop: 2 }}>
                      {f.body}
                    </T>
                  </View>
                </Row>
              </Card>
            </FadeIn>
          ))}
        </>
      ) : (
        <View style={{ gap: space.md, marginTop: space.xl }} accessibilityLabel="Putting your picture together">
          <Skeleton height={180} style={{ borderRadius: radius.xl }} />
          <Skeleton height={72} style={{ borderRadius: radius.lg }} />
          <Skeleton height={72} style={{ borderRadius: radius.lg }} />
        </View>
      )}

      {partial === '1' ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" title="Some accounts didn't sync" body="Your picture is incomplete for now. You can retry from Accounts." />
        </View>
      ) : null}
    </Screen>
  );
}

function Hero({ d, banks }: { d: HomeDTO; banks: HomeDTO['balance']['accounts'] }) {
  const { c, reduceMotion } = useTheme();
  const glow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(glow, { toValue: 1, duration: 1400, delay: 200, useNativeDriver: true }).start();
  }, []);
  const total = d.wealth?.netWorth ?? d.balance.total;
  const count = d.balance.accountCount;
  return (
    <Card style={{ padding: space.xl, marginTop: space.xl, borderRadius: radius.xl }}>
      <T v="small" tone="secondary">
        {d.wealth ? 'Your net worth today' : 'Your money today'}
      </T>
      <View style={{ marginTop: space.xs }}>
        <Money value={total} v="display" decimals={0} />
      </View>
      {d.wealth && d.wealth.change !== 0 ? (
        <Animated.View style={{ opacity: glow }}>
          <T v="small" color={d.wealth.change > 0 ? c.positive : c.negative} style={{ marginTop: space.xs }}>
            {`${d.wealth.change > 0 ? 'Up' : 'Down'} ${formatINR(Math.abs(d.wealth.change), { decimals: 0 })} since 1 Jan`}
          </T>
        </Animated.View>
      ) : null}
      <View style={{ height: 1, backgroundColor: c.divider, marginVertical: space.lg }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          {banks.slice(0, 5).map((a, i) => (
            <View key={a.fip.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 12, borderWidth: 2, borderColor: c.surface }}>
              <FipMark fip={a.fip} size={32} />
            </View>
          ))}
        </Row>
        <T v="small" tone="secondary">
          {`${count} account${count === 1 ? '' : 's'} connected`}
        </T>
      </Row>
    </Card>
  );
}

interface Finding {
  key: string;
  title: string;
  body: string;
  icon: ReactNode;
  soft: string;
}

/** Up to three things worth knowing, all taken from the person's own numbers. */
function findings(d: HomeDTO): Finding[] {
  const out: Finding[] = [];
  const m = d.month;
  // Early in a month the savings rate says little (salary in, few bills out yet), so skip it then.
  if (m.savingsRatePct != null && m.income > 0 && new Date().getDate() >= 10) {
    out.push({
      key: 'savings',
      title: m.savingsRatePct > 0 ? `You kept ${Math.round(m.savingsRatePct)}% of your income in ${m.label}` : `You spent more than you earned in ${m.label}`,
      body: `${formatINR(m.income, { decimals: 0 })} came in and ${formatINR(m.spent, { decimals: 0 })} went out.`,
      icon: <PiggyBank size={18} color="#16A34A" />,
      soft: 'rgba(22,163,74,0.14)',
    });
  }
  const inv = d.investments;
  if (inv && inv.invested > 0) {
    const up = inv.gain >= 0;
    out.push({
      key: 'investments',
      title: `Your investments are ${up ? 'up' : 'down'} ${formatINR(Math.abs(inv.gain), { decimals: 0 })}`,
      body: `${formatINR(inv.value, { decimals: 0 })} today on ${formatINR(inv.invested, { decimals: 0 })} put in${inv.gainPct != null ? ` (${up ? '+' : '−'}${Math.abs(inv.gainPct).toFixed(1)}%)` : ''}.`,
      icon: <TrendingUp size={18} color="#2563EB" />,
      soft: 'rgba(37,99,235,0.14)',
    });
  }
  if (d.upcoming.count > 0) {
    out.push({
      key: 'upcoming',
      title: `${d.upcoming.count} payment${d.upcoming.count === 1 ? '' : 's'} due in the next ${d.upcoming.days} days`,
      body: `${formatINR(d.upcoming.total, { decimals: 0 })} in total. I’ll remind you before each one.`,
      icon: <CalendarClock size={18} color="#D97706" />,
      soft: 'rgba(217,119,6,0.14)',
    });
  }
  if (d.insight && out.length < 3) {
    out.push({ key: 'insight', title: d.insight.title, body: d.insight.body, icon: <SIOrb size={22} />, soft: 'transparent' });
  }
  return out.slice(0, 3);
}

function uniqueBanks(d: HomeDTO): HomeDTO['balance']['accounts'] {
  const seen = new Set<string>();
  return d.balance.accounts.filter((a) => (seen.has(a.fip.id) ? false : (seen.add(a.fip.id), true)));
}
