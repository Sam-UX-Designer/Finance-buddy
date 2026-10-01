import { router } from 'expo-router';
import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { haptics } from '@/lib/haptics';
import { usePlan, useSaveGoal } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { bodyFrom, draftFrom, GoalForm, missingFor } from '@/features/GoalForm';
import { Button } from '@/ui/controls';
import { BackHeader, Banner, Screen } from '@/ui/layout';
import { T } from '@/ui/primitives';

export default function NewGoal() {
  const [draft, setDraft] = useState(draftFrom());
  const [error, setError] = useState<string | null>(null);
  const save = useSaveGoal();
  const plan = usePlan();
  const returnPct = Number(plan.data?.assumptions.find((a) => a.key === 'goalReturnPct')?.value ?? 0);
  const body = bodyFrom(draft);
  const missing = missingFor(draft);
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <>
          {error ? <Banner tone="negative" title={error} /> : null}
          {missing ? (
            <T v="small" tone="secondary" align="center" style={{ marginBottom: space.sm }}>
              {missing}
            </T>
          ) : null}
          <Button
            label="Create goal"
            disabled={!body}
            loading={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                await save.mutateAsync(body!);
                haptics.success();
                router.back();
              } catch (e) {
                haptics.error();
                setError(errorMessage(e));
              }
            }}
          />
        </>
      }
    >
      <BackHeader close />
      <T v="title" style={{ marginBottom: space.xl }} accessibilityRole="header">
        New goal
      </T>
      <GoalForm draft={draft} onChange={setDraft} returnPct={returnPct} />
    </Screen>
  );
}
