import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Plus, SlidersHorizontal } from 'lucide-react-native';
import {
  category,
  formatDate,
  formatINR,
  formatMonthKey,
  istParts,
  monthName,
  parseRupeeInput,
  type BudgetDTO,
  type CategoryId,
  type GoalDTO,
} from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useBudgets, useForecast, usePlan, useSetBudget } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { LineChart } from '@/charts/Charts';
import { Button, Chip, IconButton, Segmented, TextField } from '@/ui/controls';
import { EmojiAvatar, ListRow, Pill } from '@/ui/display';
import { Banner, EmptyState, ErrorState, FadeIn, LoadingState, Screen, Sheet, TabHeader } from '@/ui/layout';
import { Card, Divider, Press, ProgressBar, Row, SectionTitle, T } from '@/ui/primitives';

type Tab = 'goals' | 'forecast' | 'budget';

/** Plan: think forward — goals, forecasts and budgets (Blueprint §14, §15). */
export default function PlanScreen() {
  const [tab, setTab] = useState<Tab>('goals');
  const plan = usePlan();
  const forecast = useForecast();
  const budgets = useBudgets();
  const refreshing = plan.isRefetching || forecast.isRefetching || budgets.isRefetching;
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void plan.refetch();
        void forecast.refetch();
        void budgets.refetch();
      }}
    >
      <TabHeader title="Plan" right={<IconButton icon={SlidersHorizontal} label="Forecast assumptions" onPress={() => router.push('/assumptions')} />} />
      <Segmented
        options={[
          { key: 'goals', label: 'Goals' },
          { key: 'forecast', label: 'Forecast' },
          { key: 'budget', label: 'Budget' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ marginTop: space.xl }}>
        {tab === 'goals' ? <Goals plan={plan} /> : tab === 'forecast' ? <Forecast q={forecast} /> : <Budgets q={budgets} />}
      </View>
    </Screen>
  );
}

function goalColor(c: ReturnType<typeof useTheme>['c'], g: GoalDTO) {
  return g.projection.status === 'COMPLETED' || g.projection.onTrack ? c.positive : g.projection.status === 'NO_CONTRIBUTION' ? c.textTertiary : c.warning;
}

function Goals({ plan }: { plan: ReturnType<typeof usePlan> }) {
  const { c } = useTheme();
  const d = plan.data;
  if (plan.error && !d) return <ErrorState error={plan.error} onRetry={() => plan.refetch()} />;
  if (!d) return <LoadingState />;
  const p = d.projection;
  const untilParts = istParts(p.until);
  return (
    <FadeIn>
      {d.goals.length === 0 ? (
        <EmptyState title="No goals yet" body="Add a goal — an emergency fund, a laptop, a trip — and SI will track whether you're on course." />
      ) : (
        <View>
          {d.goals.map((g, i) => (
            <View key={g.id}>
              {i > 0 ? <Divider inset={60} /> : null}
              <Press onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.projection.progressPct}% complete`} scaleTo={0.99}>
                <Row gap={space.md} style={{ paddingVertical: space.md }}>
                  <EmojiAvatar emoji={g.emoji} size={48} categoryId="family" />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T v="bodySemibold">{g.name}</T>
                      <T v="smallMedium">{`${Math.round(g.projection.progressPct)}%`}</T>
                    </Row>
                    <T v="small" tone="secondary">{`${formatINR(g.currentAmount, { decimals: 0 })} / ${formatINR(g.targetAmount, { decimals: 0 })}`}</T>
                    <ProgressBar value={g.projection.progressPct} color={goalColor(c, g)} />
                    <T v="caption" tone={g.projection.onTrack ? 'positive' : 'warning'}>
                      {g.projection.status === 'COMPLETED'
                        ? 'Completed'
                        : g.projection.status === 'NO_CONTRIBUTION'
                          ? 'Set a monthly amount to project completion'
                          : g.projection.onTrack
                            ? `On track · ${formatDate(g.projection.projectedCompletionDate!)}`
                            : `Behind · ${formatINR(g.projection.requiredMonthly, { decimals: 0 })}/month needed`}
                    </T>
                  </View>
                </Row>
              </Press>
            </View>
          ))}
        </View>
      )}
      <Button label="Add a New Goal" icon={Plus} variant="outline" onPress={() => router.push('/goal/new')} style={{ marginTop: space.md }} />

      <Card style={{ marginTop: space.xxl }}>
        <T v="bodySemibold">Projection</T>
        <T v="small" tone="secondary">
          Your projected net worth
        </T>
        <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
          <View>
            <T v="amount">{formatINR(p.end, { decimals: 0 })}</T>
            <T v="small" tone="secondary">{`by ${monthName(untilParts.month)} ${untilParts.year}`}</T>
          </View>
          {p.changePct != null ? <Pill tone={p.changePct >= 0 ? 'positive' : 'negative'}>{`${p.changePct >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(p.changePct))}%`}</Pill> : null}
        </Row>
        <View style={{ marginTop: space.md }}>
          <LineChart values={p.points.map((x) => x.value / 100)} height={100} showDots accessibilityLabel={`Projected net worth rising from ${formatINR(p.start, { decimals: 0 })} to ${formatINR(p.end, { decimals: 0 })}`} />
        </View>
        <T v="caption" tone="tertiary" style={{ marginTop: space.md }}>
          {`Assumes ${formatINR(p.monthlySavings, { decimals: 0 })}/month saved, ${formatINR(p.monthlySip, { decimals: 0 })}/month in SIPs at ${p.assumptions.mfReturnPct}% a year, EPF at ${p.assumptions.epfRatePct}%. `}
        </T>
        <Press onPress={() => router.push('/assumptions')} accessibilityRole="button" hitSlop={8}>
          <T v="captionMedium" tone="info">
            Change assumptions
          </T>
        </Press>
      </Card>
    </FadeIn>
  );
}

function Forecast({ q }: { q: ReturnType<typeof useForecast> }) {
  const { c } = useTheme();
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <LoadingState />;
  const f = d.untilNextSalary ?? d.endOfMonth;
  const label = d.untilNextSalary && d.nextSalaryDate ? `before your salary on ${formatDate(d.nextSalaryDate)}` : `by ${formatDate(d.endOfMonth.until)}`;
  return (
    <FadeIn>
      <Card>
        <T v="small" tone="secondary">{`Expected balance ${label}`}</T>
        <T v="amount" style={{ marginTop: 4 }} tone={f.end < d.safetyBuffer ? 'negative' : 'primary'}>
          {formatINR(f.end, { decimals: 0 })}
        </T>
        <View style={{ marginTop: space.md }}>
          <LineChart values={f.points.map((p) => p.balance / 100)} baseline={d.safetyBuffer / 100} color={c.info} height={110} accessibilityLabel={`Balance forecast from ${formatINR(f.start, { decimals: 0 })} to ${formatINR(f.end, { decimals: 0 })}`} />
        </View>
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <View style={{ width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: c.warning }} />
          <T v="caption" tone="tertiary">{`Safety buffer ${formatINR(d.safetyBuffer, { decimals: 0 })}`}</T>
        </Row>
        {f.dipsBelowBuffer ? (
          <View style={{ marginTop: space.md }}>
            <Banner tone="warning" title={`May dip to ${formatINR(f.lowest.balance, { decimals: 0 })} around ${formatDate(f.lowest.date)}`} body="That's below your safety buffer. Consider moving a planned expense." />
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle>How we got this</SectionTitle>
        <Line label="Balance today" value={formatINR(f.start, { decimals: 0 })} />
        <Line label="Expected income" value={formatINR(f.income, { decimals: 0, signed: true })} />
        <Line label="Known payments (bills, rent, SIPs)" value={`−${formatINR(f.obligations, { decimals: 0 })}`} />
        <Line label="Everyday spending" value={`−${formatINR(f.variableSpend, { decimals: 0 })}`} />
        <Divider />
        <Line label="Expected balance" value={formatINR(f.end, { decimals: 0 })} bold />
        <Press onPress={() => router.push('/assumptions')} accessibilityRole="button" style={{ marginTop: space.md }} hitSlop={8}>
          <T v="smallMedium" tone="info">
            Change assumptions
          </T>
        </Press>
      </Card>

      {f.obligationItems.length ? (
        <View style={{ marginTop: space.xl }}>
          <SectionTitle>Known payments</SectionTitle>
          {f.obligationItems.map((u, i) => (
            <View key={`${u.seriesKey}${u.dueDateKey}`}>
              {i > 0 ? <Divider /> : null}
              <ListRow left={<EmojiAvatar emoji={category(u.categoryId).emoji} categoryId={u.categoryId} size={36} />} title={u.merchantName} subtitle={formatDate(u.dueDate)} right={formatINR(u.amount, { decimals: 0 })} />
            </View>
          ))}
        </View>
      ) : null}
    </FadeIn>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <T v={bold ? 'bodySemibold' : 'small'} tone={bold ? 'primary' : 'secondary'} style={{ flex: 1 }}>
        {label}
      </T>
      <T v={bold ? 'bodySemibold' : 'smallMedium'}>{value}</T>
    </Row>
  );
}

function Budgets({ q }: { q: ReturnType<typeof useBudgets> }) {
  const { c } = useTheme();
  const set = useSetBudget();
  const [editing, setEditing] = useState<{ categoryId: CategoryId; current?: number } | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const d = q.data;
  if (q.error && !d) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <LoadingState />;

  const open = (categoryId: CategoryId, current?: number) => {
    setEditing({ categoryId, current });
    setAmount(current ? String(current / 100) : '');
    setError(null);
  };
  const save = async (limit: number | null) => {
    if (!editing) return;
    try {
      await set.mutateAsync({ categoryId: editing.categoryId, monthlyLimit: limit });
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const colorFor = (b: BudgetDTO) => (b.status === 'OVER' ? c.negative : b.status === 'NEAR' ? c.warning : c.positive);

  return (
    <FadeIn>
      <T v="small" tone="secondary" style={{ marginBottom: space.md }}>
        {`${formatMonthKey(d.monthKey)} · spending against your monthly limits`}
      </T>
      {d.budgets.length === 0 ? (
        <EmptyState title="No budgets yet" body="Pick a category below to set a monthly limit. Budgets are optional — SI tracks spending either way." />
      ) : (
        d.budgets.map((b, i) => (
          <View key={b.budgetId}>
            {i > 0 ? <Divider inset={56} /> : null}
            <Press onPress={() => open(b.categoryId, b.limit)} accessibilityRole="button" accessibilityLabel={`${b.categoryName} budget, ${Math.round(b.pct)}% used`} scaleTo={0.99}>
              <Row gap={space.md} style={{ paddingVertical: space.md }}>
                <EmojiAvatar emoji={b.emoji} categoryId={b.categoryId} size={42} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T v="bodySemibold">{b.categoryName}</T>
                    <T v="smallMedium" color={colorFor(b)}>
                      {b.status === 'OVER' ? `${formatINR(-b.remaining, { decimals: 0 })} over` : `${formatINR(b.remaining, { decimals: 0 })} left`}
                    </T>
                  </Row>
                  <ProgressBar value={b.pct} color={colorFor(b)} />
                  <T v="caption" tone="tertiary">{`${formatINR(b.spent, { decimals: 0 })} of ${formatINR(b.limit, { decimals: 0 })} · on pace for ${formatINR(b.projectedSpend, { decimals: 0 })}`}</T>
                </View>
              </Row>
            </Press>
          </View>
        ))
      )}
      <SectionTitle>Add a budget</SectionTitle>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {d.unbudgeted.slice(0, 10).map((u) => (
          <Chip key={u.categoryId} label={`${u.emoji} ${u.categoryName}`} onPress={() => open(u.categoryId)} />
        ))}
      </Row>
      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${category(editing.categoryId).name} budget` : ''}
        footer={
          <View style={{ gap: space.sm }}>
            <Button label="Save budget" loading={set.isPending} disabled={(parseRupeeInput(amount) ?? 0) < 100} onPress={() => save(parseRupeeInput(amount))} />
            {editing?.current ? <Button label="Remove budget" variant="ghost" onPress={() => save(null)} /> : null}
          </View>
        }
      >
        <View style={{ gap: space.md, borderRadius: radius.md }}>
          <TextField label="Monthly limit" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="5000" prefix={<T v="bodyMedium" tone="secondary">₹</T>} autoFocus />
          {error ? <Banner tone="negative" title={error} /> : null}
        </View>
      </Sheet>
    </FadeIn>
  );
}
