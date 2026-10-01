import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Lock, Shield, ShieldCheck } from 'lucide-react-native';
import type { OtpRequestResponse } from '@finance-buddy/core';
import { api, errorMessage } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Button, TextField } from '@/ui/controls';
import { BackHeader, FadeIn, Screen } from '@/ui/layout';
import { Row, T } from '@/ui/primitives';

function formatPhone(digits: string) {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export default function PhoneScreen() {
  const { c } = useTheme();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = /^[6-9]\d{9}$/.test(digits);

  const submit = async () => {
    if (!valid) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api<OtpRequestResponse>('/v1/auth/otp', { method: 'POST', body: { phone: digits } });
      router.push({ pathname: '/onboarding/otp', params: { challengeId: r.challengeId, phone: digits, masked: r.maskedPhone, resendAfter: r.resendAfter, devHint: r.devHint ?? '' } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={{ gap: space.xxl }}>
          <Row style={{ justifyContent: 'space-around' }}>
            <Trust icon={<Shield size={22} color={c.textSecondary} strokeWidth={1.6} />} label="Secure" />
            <Trust icon={<ShieldCheck size={22} color={c.positive} strokeWidth={1.6} />} label={'RBI regulated\nAccount Aggregator'} />
            <Trust icon={<Lock size={22} color={c.textSecondary} strokeWidth={1.6} />} label={'Your data\nstays private'} />
          </Row>
        </View>
      }
    >
      <BackHeader onBack={() => router.replace('/')} />
      <FadeIn>
        <T v="headline" style={{ marginTop: space.xl }} accessibilityRole="header">
          {'Your money,\nall in one place.'}
        </T>
        <T v="body" tone="secondary" style={{ marginTop: space.md, maxWidth: 320 }}>
          Securely connect your financial accounts using India’s Account Aggregator network.
        </T>
        <View style={{ marginTop: space.xxxl, gap: space.lg }}>
          <TextField
            accessibilityLabel="Mobile number"
            value={formatPhone(digits)}
            onChangeText={(t) => {
              setDigits(t.replace(/\D/g, '').slice(0, 10));
              setError(null);
            }}
            placeholder="98765 43210"
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={11}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            error={error}
            prefix={
              <Row gap={8}>
                <T v="body">🇮🇳</T>
                <T v="bodyMedium" tone="secondary">
                  +91
                </T>
              </Row>
            }
          />
          <Button label="Continue" onPress={submit} loading={loading} disabled={!valid} />
          <T v="caption" tone="tertiary" align="center">
            We’ll send a one-time code to verify it’s you. We never ask for bank passwords.
          </T>
        </View>
      </FadeIn>
    </Screen>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, width: 110 }}>
      {icon}
      <T v="caption" tone="secondary" align="center">
        {label}
      </T>
    </View>
  );
}
