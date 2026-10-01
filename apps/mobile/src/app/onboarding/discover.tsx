import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { CreditCard, Landmark, PiggyBank, ReceiptText } from 'lucide-react-native';
import type { JobDTO } from '@moneymate/core';
import { onboardingApi } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { StepList } from '@/features/StepList';
import { Button } from '@/ui/controls';
import { BackHeader, ErrorState, FadeIn, Screen } from '@/ui/layout';
import { T } from '@/ui/primitives';

const PLACEHOLDER: JobDTO['steps'] = [
  { key: 'banks', label: 'Checking banks', status: 'RUNNING' },
  { key: 'investments', label: 'Finding investments', status: 'PENDING' },
  { key: 'other', label: 'Looking for other accounts', status: 'PENDING' },
];

export default function DiscoverScreen() {
  const [job, setJob] = useState<JobDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        setError(null);
        let current = (await onboardingApi.discovery()).job;
        if (!current || current.status === 'FAILED' || attempt > 0) current = (await onboardingApi.startDiscovery()).job;
        if (!alive) return;
        setJob(current);
        const poll = async () => {
          try {
            const d = await onboardingApi.discovery();
            if (!alive) return;
            setJob(d.job);
            if (d.job?.status === 'COMPLETED') {
              timer = setTimeout(() => router.replace('/onboarding/accounts'), 500);
              return;
            }
            if (d.job?.status === 'FAILED') return;
          } catch (e) {
            if (alive) setError(e);
            return;
          }
          timer = setTimeout(poll, 500);
        };
        void poll();
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  const failed = job?.status === 'FAILED';
  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader onBack={() => router.replace('/onboarding/phone')} />
      <FadeIn>
        <T v="headline" style={{ marginTop: space.lg }} accessibilityRole="header">
          {'Finding your\nfinancial accounts'}
        </T>
        <T v="body" tone="secondary" style={{ marginTop: space.md }}>
          Looking for financial accounts connected to this mobile number…
        </T>
      </FadeIn>
      {error || failed ? (
        <View>
          <ErrorState error={error ?? new Error(job?.error ?? '')} onRetry={() => setAttempt((n) => n + 1)} />
          {failed && job?.error ? (
            <T v="small" tone="secondary" align="center">
              {job.error}
            </T>
          ) : null}
        </View>
      ) : (
        <>
          <Radar />
          <StepList steps={job?.steps ?? PLACEHOLDER} size={20} gap={space.md} />
        </>
      )}
      {failed ? <Button label="Try again" onPress={() => setAttempt((n) => n + 1)} style={{ marginTop: space.xl }} /> : null}
    </Screen>
  );
}

/** Calm network/search motion (Blueprint §19). */
function Radar() {
  const { c, reduceMotion } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, pulse, reduceMotion]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const size = 260;
  const orbit = (Icon: typeof Landmark, angle: number, radiusPx: number, bg: string, fg: string, big = false) => {
    const rad = (angle * Math.PI) / 180;
    const s = big ? 48 : 38;
    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: size / 2 + Math.cos(rad) * radiusPx - s / 2,
          top: size / 2 + Math.sin(rad) * radiusPx - s / 2,
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: counter }],
        }}
      >
        <Icon size={s * 0.48} color={fg} strokeWidth={1.8} />
      </Animated.View>
    );
  };
  return (
    <View style={{ alignItems: 'center', marginVertical: space.xxl }} importantForAccessibility="no-hide-descendants">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: c.infoSoft, opacity: 0.6 }} />
        <Animated.View
          style={{
            position: 'absolute',
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size,
            backgroundColor: c.infoSoft,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
          }}
        />
        <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
          {orbit(Landmark, -60, 62, c.info, '#FFFFFF', true)}
          {orbit(PiggyBank, 100, 52, c.loanSoft, c.loan)}
          {orbit(CreditCard, 10, 96, c.surface, c.info)}
          {orbit(ReceiptText, 190, 96, c.positiveSoft, c.positive)}
        </Animated.View>
      </View>
    </View>
  );
}
