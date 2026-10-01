import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { routeForState, useSession } from '@/lib/session';
import { Button } from '@/ui/controls';
import { FadeIn } from '@/ui/layout';
import { T } from '@/ui/primitives';
import { Logo } from '@/ui/brand';

/** Splash: brand while the saved session is restored (real work, not an artificial delay). */
export default function Splash() {
  const { ready, token, me, bootError, retryBoot } = useSession();
  const insets = useSafeAreaInsets();
  const shownAt = useRef(Date.now()).current;

  useEffect(() => {
    if (!ready || bootError) return;
    // Keep the brand on screen briefly so it isn't a flash.
    const wait = Math.max(0, 700 - (Date.now() - shownAt));
    const t = setTimeout(() => {
      if (!token || !me) router.replace('/onboarding/phone');
      else router.replace(routeForState(me.onboardingState) as never);
    }, wait);
    return () => clearTimeout(t);
  }, [ready, token, me, bootError, shownAt]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Waves />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
        <FadeIn style={{ alignItems: 'center' }}>
          <Logo />
          <T v="title" color="#FFFFFF" style={{ marginTop: 20 }} accessibilityRole="header">
            MoneyMate
          </T>
          <T v="body" color="#C7C7CC" style={{ marginTop: 6 }}>
            Understand. Plan. Grow.
          </T>
        </FadeIn>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 48, alignItems: 'center', paddingHorizontal: 32, gap: 16 }}>
        {bootError ? (
          <>
            <T v="small" color="#C7C7CC" align="center">
              {bootError}
            </T>
            <Button label="Try again" onPress={retryBoot} variant="hero" size="md" />
          </>
        ) : ready ? (
          <T v="body" color="#D1D1D6" align="center">
            {'Your personal financial\nSuper Intelligence'}
          </T>
        ) : (
          <ActivityIndicator color="#8E8E93" />
        )}
      </View>
    </View>
  );
}

function Waves() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="w1" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2A2A2E" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#000000" stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="w2" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1B1B1E" stopOpacity={1} />
            <Stop offset="1" stopColor="#000000" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Path d="M0,120 C80,60 150,180 240,110 C310,55 360,90 400,70 L400,400 L0,400 Z" fill="url(#w1)" />
        <Path d="M0,210 C90,150 170,260 260,190 C330,140 370,170 400,160 L400,400 L0,400 Z" fill="url(#w2)" />
      </Svg>
    </View>
  );
}
