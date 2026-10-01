import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useInvalidateFinance } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Button } from '@/ui/controls';
import { Banner, Screen } from '@/ui/layout';
import { T } from '@/ui/primitives';

const DOTS = [
  { x: -120, y: -150, r: 45 },
  { x: 110, y: -130, r: -30 },
  { x: -140, y: 40, r: 20 },
  { x: 130, y: 60, r: 60 },
  { x: -90, y: 130, r: -15 },
  { x: 100, y: 150, r: 35 },
  { x: 150, y: -40, r: 10 },
];

export default function SuccessScreen() {
  const { c, reduceMotion } = useTheme();
  const { partial } = useLocalSearchParams<{ partial?: string }>();
  const { refreshMe } = useSession();
  const invalidate = useInvalidateFinance();
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.6)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    void refreshMe();
    void invalidate();
    if (reduceMotion) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Screen edges={['top', 'bottom']} scroll={false} footer={<Button label="Continue" onPress={() => router.replace('/(tabs)')} />}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
          {DOTS.map((d, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: c.positive,
                opacity: Animated.multiply(opacity, 0.35),
                transform: [{ translateX: d.x }, { translateY: d.y }, { rotate: `${d.r}deg` }],
              }}
            />
          ))}
          <Animated.View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: c.positiveSoft, alignItems: 'center', justifyContent: 'center', opacity, transform: [{ scale }] }}>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: c.positiveSoft, borderWidth: 6, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.positive, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={40} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>
          </Animated.View>
        </View>
        <T v="title" align="center" accessibilityRole="header" style={{ marginTop: space.lg }}>
          You’re all set!
        </T>
        <T v="body" tone="secondary" align="center" style={{ maxWidth: 300 }}>
          We’ve connected your accounts and understood your financial activity.
        </T>
        {partial === '1' ? (
          <View style={{ alignSelf: 'stretch', marginTop: space.md }}>
            <Banner tone="warning" title="Some accounts didn't sync" body="Your picture is incomplete for now. You can retry from Accounts." />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
