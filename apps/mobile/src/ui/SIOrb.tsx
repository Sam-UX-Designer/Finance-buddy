import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/** The full mascot artwork (static uses: sidebar logo, reduced motion). */
const AVATAR = require('../../assets/images/si-avatar.png');
/** The mascot's body without its face; the face is drawn on top so it can move. */
const BODY = require('../../assets/images/si-body.png');

const ND = Platform.OS !== 'web';
// Face geometry, measured on the 1144px source artwork.
const G = 1144;
const EYE = { w: 114 / G, h: 217 / G, top: 395 / G, left: 405 / G, right: 626 / G };
const SMILE = { left: 371 / G, top: 662 / G, w: 403 / G, h: 153 / G };
const SMILE_PATH = 'M 415,706 C 466,792 679,792 730,706';

const ease = Easing.inOut(Easing.sin);
const to = (v: Animated.Value, toValue: number, duration: number) => Animated.timing(v, { toValue, duration, easing: ease, useNativeDriver: ND });

/**
 * SI's avatar, the Finance Buddy mascot. It floats gently, blinks, and every few seconds gives a
 * happy little shake with a bigger smile. `active` (SI is working) makes it livelier. Still when
 * the person has turned on Reduce Motion.
 */
export function SIOrb({ size = 38, animated = true, active = false }: { size?: number; animated?: boolean; active?: boolean }) {
  const { reduceMotion } = useTheme();
  const still = !animated || reduceMotion;
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const grin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    // Each mascot starts at a slightly different moment, so several on screen don't move in lockstep.
    const offset = Math.round(Math.random() * 1500);
    const blinkOnce = () => Animated.sequence([to(blink, 0.1, 80), to(blink, 1, 120)]);
    const happy = () =>
      Animated.parallel([
        Animated.sequence([to(wiggle, -1, 110), to(wiggle, 0.85, 140), to(wiggle, -0.55, 120), to(wiggle, 0.3, 110), to(wiggle, 0, 100)]),
        Animated.sequence([to(grin, 1, 180), Animated.delay(450), to(grin, 0, 260)]),
      ]);
    const loops = [
      Animated.loop(Animated.sequence([to(bob, 1, 1400), to(bob, 0, 1400)])),
      Animated.loop(Animated.sequence([Animated.delay(2400 + offset), blinkOnce(), Animated.delay(3200), blinkOnce(), Animated.delay(110), blinkOnce()])),
      Animated.loop(Animated.sequence([Animated.delay(active ? 700 : 5200 + offset), happy()])),
    ];
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      [bob, wiggle, grin].forEach((v) => v.setValue(0));
      blink.setValue(1);
    };
  }, [still, active]);

  if (still) {
    return <Image source={AVATAR} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Super Intelligence" accessibilityIgnoresInvertColors />;
  }

  const eye = (left: number) => (
    <Animated.View
      style={{
        position: 'absolute',
        left: left * size,
        top: EYE.top * size,
        width: EYE.w * size,
        height: EYE.h * size,
        borderRadius: (EYE.w * size) / 2,
        backgroundColor: '#FFFFFF',
        transform: [{ scaleY: blink }],
      }}
    />
  );

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Super Intelligence"
      style={{
        width: size,
        height: size,
        transform: [
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [size * 0.025, -size * 0.025] }) },
          { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] }) },
          { scale: grin.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
        ],
      }}
    >
      <Image source={BODY} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      {eye(EYE.left)}
      {eye(EYE.right)}
      <Animated.View
        style={{
          position: 'absolute',
          left: SMILE.left * size,
          top: SMILE.top * size,
          width: SMILE.w * size,
          height: SMILE.h * size,
          transform: [{ scaleX: grin.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { scaleY: grin.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="371 662 403 153">
          <Path d={SMILE_PATH} stroke="#FFFFFF" strokeWidth={87} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** The app logo (same mascot, static). */
export const APP_LOGO = AVATAR;
