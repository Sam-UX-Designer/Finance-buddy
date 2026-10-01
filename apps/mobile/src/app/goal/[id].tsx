import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Minus, Plus, Trash } from 'lucide-react-native';
import { formatDate, formatINR, projectGoal } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { useDeleteGoal, useGoal, usePlan, useSaveGoal } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { bodyFrom, draftFrom, GoalForm, type GoalDraft } from '@/features/GoalForm';
import { Button, IconButton } from '@/ui/controls';
import { EmojiAvatar } from '@/ui/display';
import { BackHeader, Banner, ErrorState, FadeIn, LoadingState, Screen, Sheet } from '@/ui/layout';
import { Card, ProgressBar, Row, T } from '@/ui/primitives';

/** Goal detail with "What if?" scenarios (Blueprint §15). */
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const goal = useGoal(id);
  const plan = usePlan();
  const save = useSaveGoal(id);
  const del = useDeleteGoal(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const g = goal.data;
  const returnPct = Number(plan.data?.assumptions.find((a) => a.key === 'goalReturnPct')?.value ?? 0);
  useEffect(() => {
    if (g) setWhatIf(g.monthlyContribution);
  }, [g?.monthlyContribution]);

  const scenario = useMemo(() => (g && whatIf != null ? projectGoal({ ...g, monthlyContribution: whatIf }, new Date().toISOString(), returnPct) : null), [g, whatIf, returnPct]);
  const step = 100000; // ₹1,000

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader right={g ? <IconButton icon={Trash} label="Delete goal" onPress={() => setConfirm(true)} /> : undefined} />
      {goal.error && !g ? (
        <ErrorState error={goal.error} onRetry={() => goal.refetch()} />
      ) : !g || !scenario ? (
        <LoadingState />
      ) : (
        <FadeIn>
          <Row gap={space.md}>
            <EmojiAvatar emoji={g.emoji} size={56} categoryId="family" />
            <View style={{ flex: 1 }}>
              <T v="title" accessibilityRole="header">
                {g.name}
              </T>
              <T v="small" tone="secondary">{`Target ${formatINR(g.targetAmount, { decimals: 0 })} by ${formatDate(g.targetDate)}`}</T>
            </View>
          </Row>
          <Card style={{ marginTop: space.xl }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="amount">{formatINR(g.currentAmount, { decimals: 0 })}</T>
              <T v="bodySemibold">{`${Math.round(g.projection.progressPct)}%`}</T>
            </Row>
            <T v="small" tone="secondary" style={{ marginBottom: space.md }}>{`saved of ${formatINR(g.targetAmount, { decimals: 0 })}`}</T>
            <ProgressBar value={g.projection.progressPct} color={g.projection.onTrack ? c.positive : c.warning} height={8} />
            <T v="small" style={{ marginTop: space.md }} tone={g.projection.onTrack ? 'positive' : 'warning'}>
              {g.projection.status === 'COMPLETED'
                ? 'Goal reached.'
                : g.projection.status === 'NO_CONTRIBUTION'
                  ? 'No monthly contribution set.'
                  : `${g.projection.onTrack ? 'On track' : 'Behind'} — expected ${formatDate(g.projection.projectedCompletionDate!)}`}
            </T>
          </Card>

          {g.projection.status !== 'COMPLETED' ? (
            <Card style={{ marginTop: space.lg }}>
              <T v="bodySemibold">What if?</T>
              <T v="small" tone="secondary">
                Change how much you put in each month.
              </T>
              <Row style={{ marginTop: space.lg, justifyContent: 'space-between', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.sm, height: 52 }}>
                <IconButton icon={Minus} label="Decrease by ₹1,000" onPress={() => setWhatIf((v) => Math.max(0, (v ?? 0) - step))} />
                <T v="subtitle" accessibilityLiveRegion="polite">{`${formatINR(whatIf ?? 0, { decimals: 0 })}/month`}</T>
                <IconButton icon={Plus} label="Increase by ₹1,000" onPress={() => setWhatIf((v) => (v ?? 0) + step)} />
              </Row>
              <T v="body" style={{ marginTop: space.md }} tone={scenario.onTrack ? 'positive' : 'warning'}>
                {scenario.projectedCompletionDate ? `You'd reach it by ${formatDate(scenario.projectedCompletionDate)}${scenario.onTrack ? ' — on time.' : ' — after your target date.'}` : 'At ₹0/month this goal won’t be reached.'}
              </T>
              <T v="small" tone="secondary" style={{ marginTop: 4 }}>{`Needed for your date: ${formatINR(scenario.requiredMonthly, { decimals: 0 })}/month`}</T>
              {whatIf !== g.monthlyContribution ? (
                <Button
                  label="Use this amount"
                  size="md"
                  style={{ marginTop: space.lg }}
                  loading={save.isPending}
                  onPress={async () => {
                    try {
                      await save.mutateAsync({ ...bodyFrom(draftFrom(g))!, monthlyContribution: whatIf! });
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                />
              ) : null}
            </Card>
          ) : null}
          {error ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="negative" title={error} />
            </View>
          ) : null}
          <Button
            label="Edit goal"
            variant="outline"
            style={{ marginTop: space.xl }}
            onPress={() => {
              setDraft(draftFrom(g));
              setEditing(true);
            }}
          />
        </FadeIn>
      )}

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Edit goal"
        footer={
          <Button
            label="Save"
            disabled={!draft || !bodyFrom(draft)}
            loading={save.isPending}
            onPress={async () => {
              try {
                await save.mutateAsync(bodyFrom(draft!)!);
                setEditing(false);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        }
      >
        {draft ? <GoalForm draft={draft} onChange={setDraft} returnPct={returnPct} /> : null}
      </Sheet>

      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this goal?"
        footer={
          <View style={{ gap: space.sm }}>
            <Button
              label="Delete goal"
              variant="danger"
              loading={del.isPending}
              onPress={async () => {
                await del.mutateAsync();
                setConfirm(false);
                router.back();
              }}
            />
            <Button label="Keep it" variant="ghost" onPress={() => setConfirm(false)} />
          </View>
        }
      >
        <T v="body" tone="secondary">
          This removes the goal and its progress tracking. Your transactions aren’t affected.
        </T>
      </Sheet>
    </Screen>
  );
}
