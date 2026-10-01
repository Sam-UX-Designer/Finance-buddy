import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { JobDTO, JobStep } from '@finance-buddy/core';
import { errorMessage } from '@/lib/api';
import { onboardingApi } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, space } from '@/theme/tokens';
import { StepList } from '@/features/StepList';
import { Button } from '@/ui/controls';
import { BackHeader, Banner, FadeIn, Screen } from '@/ui/layout';
import { T } from '@/ui/primitives';

const LABELS = ['Fetching bank data', 'Understanding transactions', 'Categorizing expenses', 'Finding recurring payments', 'Identifying investments', 'Building your financial profile'];

/**
 * Shows the real sync job (Blueprint §19: progressive steps with real backend states). Steps that
 * finish within the same poll are revealed one by one with a short transition so each is readable.
 */
export default function SyncScreen() {
  const { c } = useTheme();
  const [job, setJob] = useState<JobDTO | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await onboardingApi.latestSync();
        if (!alive) return;
        setJob(r.job);
        if (r.job && r.job.status !== 'RUNNING') return;
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
      timer = setTimeout(poll, 500);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  const actualDone = job?.steps.filter((s) => s.status === 'DONE').length ?? 0;
  useEffect(() => {
    if (revealed >= actualDone) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), motion.slow);
    return () => clearTimeout(t);
  }, [revealed, actualDone]);

  const finished = job && (job.status === 'COMPLETED' || job.status === 'PARTIAL');
  useEffect(() => {
    if (!finished || done.current || revealed < (job?.steps.length ?? 6)) return;
    done.current = true;
    const t = setTimeout(() => router.replace({ pathname: '/onboarding/success', params: { partial: job!.status === 'PARTIAL' ? '1' : '0' } }), motion.slow);
    return () => clearTimeout(t);
  }, [finished, revealed, job]);

  const steps: JobStep[] = (job?.steps ?? LABELS.map((label, i) => ({ key: String(i), label, status: 'PENDING' as const }))).map((s, i) => {
    if (i < revealed) return { ...s, status: 'DONE' };
    if (i === revealed && job?.status !== 'FAILED') return { ...s, status: 'RUNNING' };
    if (job?.status === 'FAILED' && i === revealed) return { ...s, status: 'FAILED' };
    return { ...s, status: 'PENDING' };
  });

  const retry = async () => {
    setError(null);
    done.current = false;
    setRevealed(0);
    try {
      setJob(await onboardingApi.startSync());
      setAttempt((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const failed = job?.status === 'FAILED';
  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        failed ? (
          <View style={{ gap: space.md }}>
            <Button label="Retry" onPress={retry} />
            <Button label="Choose different accounts" variant="outline" onPress={() => router.replace('/onboarding/accounts')} />
          </View>
        ) : (
          <T v="small" tone="tertiary" align="center">
            This may take a few minutes…
          </T>
        )
      }
    >
      <BackHeader onBack={() => router.replace('/onboarding/accounts')} />
      <FadeIn>
        <T v="headline" style={{ marginTop: space.lg }} accessibilityRole="header">
          {'Understanding\nyour money'}
        </T>
      </FadeIn>
      <View style={{ marginTop: space.xxl }} accessibilityLiveRegion="polite">
        <StepList steps={steps} size={24} gap={space.lg} />
      </View>
      {failed ? (
        <View style={{ marginTop: space.xl }}>
          <Banner tone="negative" title="We couldn't fetch your data" body={job?.error ?? 'Please retry. If it keeps failing, try again later.'} />
        </View>
      ) : null}
      {error ? (
        <View style={{ marginTop: space.xl }}>
          <Banner tone="warning" title={error} action="Retry" onAction={() => setAttempt((n) => n + 1)} />
        </View>
      ) : null}
      {!failed ? (
        <View style={{ height: 140, marginTop: space.xxl }} importantForAccessibility="no-hide-descendants">
          <Svg width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="sw" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.loan} stopOpacity={0.18} />
                <Stop offset="1" stopColor={c.info} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d="M0,90 C60,40 110,110 180,70 C240,35 300,95 400,55 L400,140 L0,140 Z" fill="url(#sw)" />
            <Path d="M0,110 C70,70 140,130 210,95 C280,60 330,110 400,85 L400,140 L0,140 Z" fill="url(#sw)" />
          </Svg>
        </View>
      ) : null}
    </Screen>
  );
}
