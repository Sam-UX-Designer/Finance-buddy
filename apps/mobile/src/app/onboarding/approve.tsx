import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';
import { formatDate } from '@moneymate/core';
import { errorMessage } from '@/lib/api';
import { onboardingApi } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { FipMark } from '@/ui/display';
import { BackHeader, Banner, ErrorState, LoadingState, Screen } from '@/ui/layout';
import { Card, Divider, Row, T } from '@/ui/primitives';

type SandboxConsent = Awaited<ReturnType<typeof onboardingApi.sandbox>>;

/**
 * Sandbox stand-in for the Account Aggregator's own approval page. In production this step happens
 * on the AA partner's secure page (with the AA's own OTP), not inside MoneyMate.
 */
export default function ApproveScreen() {
  const { c } = useTheme();
  const { pid } = useLocalSearchParams<{ pid: string; cid: string }>();
  const [data, setData] = useState<SandboxConsent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setData(await onboardingApi.sandbox(pid));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
  }, [pid]);

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(action);
    setActionError(null);
    try {
      const consent = await onboardingApi.sandboxDecide(pid, action);
      if (consent.status === 'ACTIVE') router.replace('/onboarding/sync');
      else router.replace({ pathname: '/onboarding/accounts', params: { rejected: '1' } });
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        data && data.status === 'PENDING' ? (
          <View style={{ gap: space.md }}>
            {actionError ? <Banner tone="negative" title={actionError} /> : null}
            <Button label="Approve" onPress={() => decide('approve')} loading={busy === 'approve'} disabled={!!busy} />
            <Button label="Reject" variant="outline" onPress={() => decide('reject')} loading={busy === 'reject'} disabled={!!busy} />
          </View>
        ) : null
      }
    >
      <BackHeader close />
      <Row gap={space.sm} style={{ alignSelf: 'center', backgroundColor: c.warningSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
        <FlaskConical size={14} color={c.warning} />
        <T v="captionMedium" tone="warning">
          Account Aggregator · Sandbox
        </T>
      </Row>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <View style={{ marginTop: space.xl, gap: space.lg }}>
          <T v="title" align="center" accessibilityRole="header">
            Approve data sharing
          </T>
          <T v="small" tone="secondary" align="center">
            MoneyMate is requesting access to the accounts below. This sandbox simulates your AA app — in production you’ll approve on your Account Aggregator’s secure page.
          </T>
          <Card>
            <T v="smallMedium" tone="secondary">
              Requested by
            </T>
            <T v="bodySemibold" style={{ marginTop: 2 }}>
              MoneyMate
            </T>
            <T v="small" tone="secondary" style={{ marginTop: space.sm }}>
              {data.purpose}
            </T>
            <View style={{ marginVertical: space.md }}>
              <Divider />
            </View>
            <View style={{ gap: space.md }}>
              {data.accounts.map((a) => (
                <Row key={a.maskedNumber + a.fip.id} gap={space.md}>
                  <FipMark fip={a.fip} size={28} />
                  <T v="body" style={{ flex: 1 }}>{`${a.fip.shortName} •••• ${a.maskedNumber.slice(-4)}`}</T>
                </Row>
              ))}
            </View>
            <View style={{ marginVertical: space.md }}>
              <Divider />
            </View>
            <T v="small" tone="secondary">{`Data from ${formatDate(data.dataFrom)} · Valid till ${formatDate(data.expiresAt)}`}</T>
          </Card>
          {data.status !== 'PENDING' ? <Banner tone="info" title={`This request is already ${data.status.toLowerCase()}.`} /> : null}
        </View>
      )}
    </Screen>
  );
}
