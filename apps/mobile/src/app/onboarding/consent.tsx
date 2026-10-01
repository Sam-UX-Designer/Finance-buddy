import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CalendarDays, Landmark, RefreshCw, ShieldCheck, ReceiptText, Wallet, ChartLine, PiggyBank } from 'lucide-react-native';
import type { ConsentPreviewDTO } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { onboardingApi } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { FipMark, IconTile } from '@/ui/display';
import { BackHeader, Banner, ErrorState, FadeIn, LoadingState, Screen } from '@/ui/layout';
import { Divider, Row, T } from '@/ui/primitives';

const ICONS = [Landmark, ReceiptText, Wallet, ChartLine, PiggyBank];

/** Transparent consent request (Blueprint §5 step 7): what, why, how long, how often. */
export default function ConsentScreen() {
  const { c } = useTheme();
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const accountIds = (ids ?? '').split(',').filter(Boolean);
  const [preview, setPreview] = useState<ConsentPreviewDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setPreview(await onboardingApi.preview(accountIds));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
  }, [ids]);

  const proceed = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const consent = await onboardingApi.createConsent(accountIds);
      const url = consent.approvalUrl ?? '';
      if (url.startsWith('sandbox:')) {
        // Test mode: tapping Approve here is the approval (no separate Account Aggregator step).
        const approved = await onboardingApi.sandboxDecide(url.slice(8), 'approve');
        if (approved.status !== 'ACTIVE') throw new Error('Could not connect your accounts. Please try again.');
        router.replace('/onboarding/sync');
      } else if (url) {
        // Production: the AA partner's hosted consent page; the webhook updates status server-side.
        await WebBrowser.openAuthSessionAsync(url, 'financebuddy://consent-complete');
        const latest = await onboardingApi.consent(consent.id);
        if (latest.status === 'ACTIVE') router.replace('/onboarding/sync');
        else if (latest.status === 'REJECTED') router.replace({ pathname: '/onboarding/accounts', params: { rejected: '1' } });
        else router.replace('/onboarding/accounts');
      }
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        preview ? (
          <View style={{ gap: space.md }}>
            {submitError ? <Banner tone="negative" title={submitError} /> : null}
            <Button label="Approve & connect" onPress={proceed} loading={submitting} />
            <T v="caption" tone="tertiary" align="center">
              You can stop sharing anytime in Settings.
            </T>
          </View>
        ) : null
      }
    >
      <BackHeader close />
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !preview ? (
        <LoadingState label="Preparing your consent request…" />
      ) : (
        <FadeIn>
          <View style={{ alignItems: 'center', gap: space.lg }}>
            <Row style={{ justifyContent: 'center' }}>
              {preview.fips.slice(0, 4).map((f, i) => (
                <View key={f.id} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 16, borderWidth: 3, borderColor: c.bg }}>
                  <FipMark fip={f} size={52} />
                </View>
              ))}
            </Row>
            <T v="title" align="center" accessibilityRole="header">
              {preview.title}
            </T>
          </View>
          <View style={{ marginTop: space.xl }}>
            <Divider />
          </View>
          <T v="section" style={{ marginTop: space.xl, marginBottom: space.md }}>
            What you’ll share
          </T>
          <View style={{ gap: space.md }}>
            {preview.dataShared.map((d, i) => (
              <Row key={d} gap={space.md}>
                <IconTile icon={ICONS[i % ICONS.length]!} color={c.positive} bg={c.positiveSoft} size={32} />
                <T v="body" style={{ flex: 1 }}>
                  {d}
                </T>
              </Row>
            ))}
          </View>
          <View style={{ marginTop: space.xl }}>
            <Divider />
          </View>
          <T v="section" style={{ marginTop: space.xl, marginBottom: space.sm }}>
            Why we’re asking
          </T>
          <T v="body" tone="secondary">
            {`To automatically ${preview.purpose.charAt(0).toLowerCase()}${preview.purpose.slice(1)}.`}
          </T>
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <Row gap={space.sm}>
              <CalendarDays size={16} color={c.textSecondary} />
              <T v="small" tone="secondary">{`History: ${preview.dataRangeLabel} · Valid for ${preview.durationLabel}`}</T>
            </Row>
            <Row gap={space.sm}>
              <RefreshCw size={16} color={c.textSecondary} />
              <T v="small" tone="secondary">
                {preview.frequencyLabel}
              </T>
            </Row>
          </View>
          <Row gap={space.md} style={{ marginTop: space.xl, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border }}>
            <ShieldCheck size={22} color={c.textSecondary} strokeWidth={1.6} />
            <View style={{ flex: 1 }}>
              <T v="smallMedium">Secure, RBI-regulated connection</T>
              <T v="caption" tone="secondary">
                Finance Buddy never sees your bank password.
              </T>
            </View>
          </Row>
        </FadeIn>
      )}
    </Screen>
  );
}
