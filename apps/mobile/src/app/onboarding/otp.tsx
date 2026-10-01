import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { OtpRequestResponse, SessionResponse } from '@finance-buddy/core';
import { api, errorMessage } from '@/lib/api';
import { routeForState, useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { BackHeader, FadeIn, Screen } from '@/ui/layout';
import { Press, Row, T } from '@/ui/primitives';

export default function OtpScreen() {
  const params = useLocalSearchParams<{ challengeId: string; phone: string; masked: string; resendAfter: string; devHint?: string }>();
  const { c, reduceMotion } = useTheme();
  const { signIn } = useSession();
  const input = useRef<TextInput>(null);
  const [challengeId, setChallengeId] = useState(params.challengeId);
  const [resendAfter, setResendAfter] = useState(params.resendAfter);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(Date.now());
  const success = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(resendAfter ?? '') - now) / 1000));

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const platform = Platform.OS;
      const s = await api<SessionResponse>('/v1/auth/verify', {
        method: 'POST',
        body: { challengeId, code: value, platform, deviceName: platform === 'web' ? 'Web browser' : platform === 'ios' ? 'iPhone' : 'Android phone' },
      });
      setVerified(true);
      Animated.timing(success, { toValue: 1, duration: reduceMotion ? 0 : 250, useNativeDriver: true }).start();
      await signIn(s);
      setTimeout(() => router.replace(routeForState(s.user.onboardingState) as never), reduceMotion ? 0 : 450);
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api<OtpRequestResponse>('/v1/auth/otp', { method: 'POST', body: { phone: params.phone } });
      setChallengeId(r.challengeId);
      setResendAfter(r.resendAfter);
      setError(null);
      setCode('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader />
      <FadeIn style={{ alignItems: 'center', marginTop: space.xxl }}>
        <T v="title" accessibilityRole="header">
          Verify your number
        </T>
        <Row gap={6} style={{ marginTop: space.sm }}>
          <T v="small" tone="secondary">{`OTP sent to ${params.masked ?? ''}`}</T>
          <Press onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Edit number" hitSlop={8}>
            <T v="smallMedium" tone="info">
              Edit
            </T>
          </Press>
        </Row>

        <Press onPress={() => input.current?.focus()} accessibilityLabel="Enter the 6-digit code" scaleTo={1} style={{ marginTop: space.xxxl }}>
          <Row gap={8}>
            {Array.from({ length: 6 }).map((_, i) => {
              const ch = code[i];
              const active = i === code.length && !verified;
              return (
                <View
                  key={i}
                  style={{
                    width: 46,
                    height: 54,
                    borderRadius: radius.md,
                    borderWidth: 1.5,
                    borderColor: error ? c.negative : verified ? c.positive : active ? c.text : c.border,
                    backgroundColor: c.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T v="subtitle">{ch ?? ''}</T>
                </View>
              );
            })}
          </Row>
        </Press>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const v = t.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            setError(null);
            if (v.length === 6 && !busy) void verify(v);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          autoFocus
          accessibilityLabel="One-time code"
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: fonts.regular }}
        />

        {verified ? (
          <Animated.View style={{ marginTop: space.xl, opacity: success, transform: [{ scale: success.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
            <Row gap={8}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.positive, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={14} color="#FFFFFF" strokeWidth={3} />
              </View>
              <T v="smallMedium" tone="positive">
                Verified
              </T>
            </Row>
          </Animated.View>
        ) : (
          <View style={{ marginTop: space.xl, alignItems: 'center', gap: space.sm, minHeight: 60 }}>
            {error ? (
              <T v="small" tone="negative" align="center" accessibilityLiveRegion="polite">
                {error}
              </T>
            ) : null}
            {secondsLeft > 0 ? (
              <T v="small" tone="secondary">
                Resend OTP in <T v="smallMedium">{`00:${String(secondsLeft).padStart(2, '0')}`}</T>
              </T>
            ) : (
              <Press onPress={resend} accessibilityRole="button" hitSlop={8}>
                <T v="smallMedium" tone="info">
                  Resend OTP
                </T>
              </Press>
            )}
            {params.devHint ? (
              <T v="caption" tone="tertiary">
                {params.devHint}
              </T>
            ) : null}
          </View>
        )}
      </FadeIn>
    </Screen>
  );
}
