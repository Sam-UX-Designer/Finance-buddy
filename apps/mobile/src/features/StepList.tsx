import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import type { JobStep } from '@moneymate/core';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Row, T } from '@/ui/primitives';

function StepIcon({ status, size }: { status: JobStep['status']; size: number }) {
  const { c, reduceMotion } = useTheme();
  const pop = useRef(new Animated.Value(status === 'DONE' ? 1 : 0)).current;
  useEffect(() => {
    if (status === 'DONE') Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: reduceMotion ? 100 : 20, bounciness: reduceMotion ? 0 : 8 }).start();
  }, [status, pop, reduceMotion]);
  if (status === 'DONE') {
    return (
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.positive, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pop }] }}>
        <Check size={size * 0.6} color="#FFFFFF" strokeWidth={3} />
      </Animated.View>
    );
  }
  if (status === 'FAILED') {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.negative, alignItems: 'center', justifyContent: 'center' }}>
        <X size={size * 0.6} color="#FFFFFF" strokeWidth={3} />
      </View>
    );
  }
  if (status === 'RUNNING') {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: c.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={c.info} style={{ transform: [{ scale: 0.7 }] }} />
      </View>
    );
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: c.border }} />;
}

/** Progress steps that mirror real backend job states (Blueprint §19: no fake progress). */
export function StepList({ steps, size = 22, gap = space.lg }: { steps: JobStep[]; size?: number; gap?: number }) {
  return (
    <View style={{ gap }} accessibilityRole="list">
      {steps.map((s) => (
        <Row key={s.key} gap={space.md} accessibilityLabel={`${s.label}: ${s.status === 'DONE' ? 'done' : s.status === 'RUNNING' ? 'in progress' : s.status === 'FAILED' ? 'failed' : 'waiting'}`}>
          <StepIcon status={s.status} size={size} />
          <T v="body" tone={s.status === 'PENDING' ? 'tertiary' : s.status === 'DONE' ? 'secondary' : 'primary'}>
            {s.label}
          </T>
        </Row>
      ))}
    </View>
  );
}
