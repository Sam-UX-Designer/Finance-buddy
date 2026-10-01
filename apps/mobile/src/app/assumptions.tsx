import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatINR, parseRupeeInput, type AssumptionInfo } from '@moneymate/core';
import { errorMessage } from '@/lib/api';
import { usePlan, useSetAssumptions } from '@/lib/queries';
import { space } from '@/theme/tokens';
import { Button, TextField } from '@/ui/controls';
import { BackHeader, Banner, ErrorState, LoadingState, Screen } from '@/ui/layout';
import { Badge, Divider, Press, Row, T } from '@/ui/primitives';

const SOURCE = { HISTORY: 'From your history', DEFAULT: 'Default', USER: 'Set by you' } as const;

/** Every projection shows its assumptions and lets the user change them (Blueprint §14). */
export default function AssumptionsScreen() {
  const plan = usePlan();
  const set = useSetAssumptions();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const list = plan.data?.assumptions ?? [];
  useEffect(() => {
    if (plan.data) setValues(Object.fromEntries(plan.data.assumptions.map((a) => [a.key, a.unit === 'paise' ? String(Math.round(a.value / 100)) : String(a.value)])));
  }, [plan.data]);

  const parse = (a: AssumptionInfo, v: string): number | null => {
    if (a.unit === 'paise') return parseRupeeInput(v);
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
  };
  const changed = list.filter((a) => {
    const p = parse(a, values[a.key] ?? '');
    return p != null && p !== a.value && !(a.unit === 'paise' && Math.round(a.value / 100) * 100 === p);
  });
  const invalid = list.some((a) => parse(a, values[a.key] ?? '') == null);

  const save = async (body: Record<string, number | null>) => {
    setError(null);
    setSaved(false);
    try {
      await set.mutateAsync(body);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        list.length ? (
          <Button label="Save assumptions" disabled={!changed.length || invalid} loading={set.isPending} onPress={() => save(Object.fromEntries(changed.map((a) => [a.key, parse(a, values[a.key]!)!])))} />
        ) : null
      }
    >
      <BackHeader title="Assumptions" />
      <T v="small" tone="secondary" style={{ marginBottom: space.lg }}>
        Forecasts and projections use these numbers. Defaults come from your own history where possible.
      </T>
      {plan.error && !plan.data ? (
        <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
      ) : !plan.data ? (
        <LoadingState />
      ) : (
        <View>
          {saved ? <Banner tone="info" title="Saved. Forecasts updated." /> : null}
          {error ? <Banner tone="negative" title={error} /> : null}
          {list.map((a, i) => (
            <View key={a.key} style={{ paddingVertical: space.lg }}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between', marginTop: i > 0 ? space.lg : 0, marginBottom: space.sm }}>
                <T v="bodySemibold" style={{ flex: 1 }}>
                  {a.label}
                </T>
                <Badge label={SOURCE[a.source]} tone={a.source === 'USER' ? 'info' : 'secondary'} />
              </Row>
              <TextField
                accessibilityLabel={a.label}
                value={values[a.key] ?? ''}
                onChangeText={(v) => setValues((s) => ({ ...s, [a.key]: v }))}
                keyboardType="decimal-pad"
                prefix={a.unit === 'paise' ? <T v="bodyMedium" tone="secondary">₹</T> : undefined}
                hint={a.explanation}
                error={parse(a, values[a.key] ?? '') == null ? (a.unit === 'pct' ? 'Enter a percentage between 0 and 50.' : 'Enter an amount.') : null}
              />
              {a.source === 'USER' ? (
                <Press onPress={() => save({ [a.key]: null })} accessibilityRole="button" style={{ marginTop: space.sm }} hitSlop={8}>
                  <T v="smallMedium" tone="info">
                    Reset to default
                  </T>
                </Press>
              ) : null}
              {a.unit === 'paise' && a.source === 'HISTORY' ? (
                <T v="caption" tone="tertiary" style={{ marginTop: 4 }}>{`Calculated: ${formatINR(a.value, { decimals: 0 })}`}</T>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
