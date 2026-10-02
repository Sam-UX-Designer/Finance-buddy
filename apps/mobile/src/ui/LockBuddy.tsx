import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/** How the lock is feeling: waiting for digits, checking the code, wrong code, or verified. */
export type LockMood = 'idle' | 'checking' | 'error' | 'happy';

const ND = Platform.OS !== 'web';
const WEB = Platform.OS === 'web';
const FROM = '#34D399';
const MID = '#22B8E6';
const TO = '#3B6CF6';
const STEEL = '#A7AFBC';
const STEEL_HI = '#E3E7ED';
const BLUSH = 'rgba(251,113,133,0.6)';
const CONFETTI = ['#34D399', '#22D3EE', '#818CF8', '#F472B6', '#FBBF24', '#60A5FA'];
const PIECES = 14;

// Geometry as fractions of the mascot's size.
const BODY = { left: 0.12, top: 0.4, w: 0.76, h: 0.56, r: 0.2 };
const SHACKLE = { left: 0.25, top: 0.06, w: 0.5, h: 0.42 };
const SHACKLE_PATH = 'M9 42V20.5A16 16 0 0 1 41 20.5V42';
// Face positions are inside the body.
const EYE = { w: 0.085, h: 0.15, top: 0.13, left: 0.215, right: 0.46 };
const MOUTH = { left: 0.26, top: 0.32, w: 0.24, h: 0.12 };

const ease = Easing.inOut(Easing.sin);
const to = (v: Animated.Value, toValue: number, duration: number, easing = ease) => Animated.timing(v, { toValue, duration, easing, useNativeDriver: ND });
const spring = (v: Animated.Value, toValue: number, bounciness = 6) => Animated.spring(v, { toValue, speed: 14, bounciness, useNativeDriver: ND });
const abs = (left: number, top: number, width: number, height: number): ViewStyle => ({ position: 'absolute', left, top, width, height });

/**
 * The padlock buddy on the code screen. Its eyes follow the box you're typing in and the lock
 * gives a little tug with every digit. While the code is checked it looks up and goes "o". A wrong
 * code gets a head shake and a frown. A right code pops the lock open, and it jumps for joy with
 * confetti. Decorative only (the screen's text says the same things). Still under Reduce Motion.
 */
export function LockBuddy({ size = 104, progress, mood }: { size?: number; progress: number; mood: LockMood }) {
  const { c, reduceMotion } = useTheme();
  const s = size;
  const still = reduceMotion;

  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const gaze = useRef(new Animated.Value(-1)).current;
  const look = useRef(new Animated.Value(0.4)).current;
  const tug = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const open = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const rock = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  // Always alive: a gentle float and the odd blink.
  useEffect(() => {
    if (still) return;
    const blinkOnce = () => Animated.sequence([to(blink, 0.1, 80), to(blink, 1, 120)]);
    const loops = [
      Animated.loop(Animated.sequence([to(bob, 1, 1300), to(bob, 0, 1300)])),
      Animated.loop(Animated.sequence([Animated.delay(2600), blinkOnce(), Animated.delay(2900), blinkOnce(), Animated.delay(110), blinkOnce()])),
    ];
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      bob.setValue(0);
      blink.setValue(1);
    };
  }, [still]);

  // Eyes follow the box being typed in (down at the boxes), or look up while checking.
  useEffect(() => {
    const g = mood === 'idle' || mood === 'error' ? (Math.min(progress, 5) / 5) * 2 - 1 : 0;
    const l = mood === 'checking' ? -1 : mood === 'happy' ? 0 : 0.4;
    if (still) {
      gaze.setValue(g);
      look.setValue(l);
      return;
    }
    Animated.parallel([spring(gaze, g), spring(look, l)]).start();
  }, [progress, mood, still]);

  // Each new digit: a little tug on the lock.
  const prev = useRef(progress);
  useEffect(() => {
    const grew = progress > prev.current;
    prev.current = progress;
    if (!grew || still || mood === 'happy') return;
    Animated.parallel([Animated.sequence([to(tug, 1, 70), to(tug, 0, 170)]), Animated.sequence([to(squash, 0.7, 70), to(squash, 0, 190)])]).start();
  }, [progress]);

  // A new expression pops in.
  useEffect(() => {
    if (still) return;
    pop.setValue(0.6);
    spring(pop, 1, 14).start();
  }, [mood, still]);

  // Wrong code: shake the head.
  useEffect(() => {
    if (mood !== 'error' || still) return;
    Animated.sequence([-1, 1, -0.7, 0.7, -0.35, 0].map((v, i) => to(shake, v, i ? 85 : 60))).start();
  }, [mood, still]);

  // Right code: the lock pops open, a big jump, confetti, then a happy little dance.
  useEffect(() => {
    if (mood !== 'happy') return;
    if (still) {
      open.setValue(1);
      return;
    }
    const party = Animated.sequence([
      Animated.parallel([
        Animated.sequence([Animated.delay(120), spring(open, 1, 12)]),
        Animated.sequence([Animated.delay(200), to(burst, 1, 1000, Easing.out(Easing.cubic))]),
        Animated.sequence([
          to(squash, 1, 110),
          Animated.parallel([to(hop, 1, 230, Easing.out(Easing.quad)), to(squash, -1, 230)]),
          Animated.parallel([to(hop, 0, 250, Easing.in(Easing.quad)), to(squash, 0, 250)]),
          to(squash, 0.8, 70),
          to(squash, 0, 150),
          to(hop, 0.45, 170, Easing.out(Easing.quad)),
          to(hop, 0, 190, Easing.in(Easing.quad)),
        ]),
      ]),
      Animated.loop(Animated.sequence([to(rock, 1, 170), to(rock, -1, 340), to(rock, 0, 170)])),
    ]);
    party.start();
    return () => party.stop();
  }, [mood, still]);

  const happy = mood === 'happy';
  const figure: ViewStyle = { transformOrigin: '50% 95%' } as ViewStyle;

  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: s, height: s * 1.06 }}>
      {/* Shadow on the ground; shrinks while jumping. */}
      <Animated.View
        style={[
          abs(s * 0.24, s * 0.99, s * 0.52, s * 0.06),
          {
            borderRadius: s,
            backgroundColor: c.text,
            opacity: 0.08,
            transform: [
              {
                scale: hop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.65],
                }),
              },
            ],
          },
        ]}
      />

      {/* Confetti bursts out from behind the lock on success. */}
      {happy && !still
        ? Array.from({ length: PIECES }).map((_, i) => {
            const angle = (i / PIECES) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
            const dist = s * (0.62 + 0.12 * (i % 3));
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist * 0.8;
            const round = i % 3 === 0;
            const w = s * (round ? 0.06 : 0.045);
            const h = s * (round ? 0.06 : 0.09);
            return (
              <Animated.View
                key={i}
                style={[
                  abs(s * 0.5 - w / 2, s * 0.55 - h / 2, w, h),
                  {
                    borderRadius: round ? w : 2,
                    backgroundColor: CONFETTI[i % CONFETTI.length],
                    opacity: burst.interpolate({
                      inputRange: [0, 0.08, 0.7, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, dx],
                        }),
                      },
                      {
                        translateY: burst.interpolate({
                          inputRange: [0, 0.6, 1],
                          outputRange: [0, dy, dy + s * 0.18],
                        }),
                      },
                      {
                        rotate: burst.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', `${i % 2 ? 260 : -260}deg`],
                        }),
                      },
                      {
                        scale: burst.interpolate({
                          inputRange: [0, 0.15, 1],
                          outputRange: [0.3, 1, 0.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            );
          })
        : null}

      <Animated.View
        style={[
          abs(0, 0, s, s),
          figure,
          {
            transform: [
              {
                translateY: bob.interpolate({
                  inputRange: [0, 1],
                  outputRange: [s * 0.015, -s * 0.015],
                }),
              },
              {
                translateY: hop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -s * 0.2],
                }),
              },
              {
                translateX: shake.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-s * 0.08, s * 0.08],
                }),
              },
              {
                rotate: rock.interpolate({
                  inputRange: [-1, 1],
                  outputRange: ['-8deg', '8deg'],
                }),
              },
              {
                scaleX: squash.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [0.94, 1, 1.07],
                }),
              },
              {
                scaleY: squash.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [1.08, 1, 0.9],
                }),
              },
            ],
          },
        ]}
      >
        {/* Shackle (behind the body). Opens by lifting and swinging on its left leg. */}
        <Animated.View
          style={[
            abs(SHACKLE.left * s, SHACKLE.top * s, SHACKLE.w * s, SHACKLE.h * s),
            { transformOrigin: '18% 100%' } as ViewStyle,
            {
              transform: [
                {
                  translateY: tug.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -s * 0.035],
                  }),
                },
                {
                  translateY: open.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -s * 0.11],
                  }),
                },
                {
                  rotate: open.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '-26deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width={SHACKLE.w * s} height={SHACKLE.h * s} viewBox="0 0 50 42">
            <Path d={SHACKLE_PATH} stroke={STEEL} strokeWidth={9} fill="none" />
            <Path d={SHACKLE_PATH} stroke={STEEL_HI} strokeWidth={2.4} fill="none" transform="translate(-1.6 -1.4)" />
          </Svg>
        </Animated.View>

        {/* Body. Web draws the gradient with CSS; phones use SVG. The base colour is always set. */}
        <View
          style={[
            abs(BODY.left * s, BODY.top * s, BODY.w * s, BODY.h * s),
            {
              borderRadius: BODY.r * s,
              overflow: 'hidden',
              backgroundColor: MID,
            },
            WEB
              ? ({
                  backgroundImage: `linear-gradient(140deg, ${FROM} 0%, ${MID} 55%, ${TO} 100%)`,
                } as unknown as ViewStyle)
              : null,
          ]}
        >
          {!WEB ? (
            <Svg width={BODY.w * s} height={BODY.h * s} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="lockBuddyBody" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={FROM} />
                  <Stop offset="0.55" stopColor={MID} />
                  <Stop offset="1" stopColor={TO} />
                </LinearGradient>
              </Defs>
              <Rect width={BODY.w * s} height={BODY.h * s} fill="url(#lockBuddyBody)" />
            </Svg>
          ) : null}
          {/* Shine */}
          <View
            style={[
              abs(0.07 * s, 0.05 * s, 0.2 * s, 0.065 * s),
              {
                borderRadius: s,
                backgroundColor: 'rgba(255,255,255,0.32)',
                transform: [{ rotate: '-10deg' }],
              },
            ]}
          />

          {/* Face: turns toward the box being typed in. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  {
                    translateX: gaze.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-s * 0.035, s * 0.035],
                    }),
                  },
                  {
                    translateY: look.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-s * 0.03, s * 0.03],
                    }),
                  },
                ],
              },
            ]}
          >
            {happy ? (
              <>
                {[0.08, 0.57].map((x) => (
                  <View key={x} style={[abs(x * s, 0.3 * s, 0.11 * s, 0.06 * s), { borderRadius: s, backgroundColor: BLUSH }]} />
                ))}
                {[EYE.left, EYE.right].map((x) => (
                  <Animated.View key={x} style={[abs((x - 0.0175) * s, 0.16 * s, 0.12 * s, 0.085 * s), { transform: [{ scale: pop }] }]}>
                    <Svg width="100%" height="100%" viewBox="0 0 12 9">
                      <Path d="M1.6 7.6Q6 -0.6 10.4 7.6" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" />
                    </Svg>
                  </Animated.View>
                ))}
              </>
            ) : (
              [EYE.left, EYE.right].map((x) => (
                <Animated.View
                  key={x}
                  style={[
                    abs(x * s, EYE.top * s, EYE.w * s, EYE.h * s),
                    {
                      borderRadius: (EYE.w * s) / 2,
                      backgroundColor: '#FFFFFF',
                      transform: [{ scaleY: blink }, { scaleY: mood === 'error' ? 0.75 : 1 }],
                    },
                  ]}
                />
              ))
            )}

            <Animated.View style={[abs(MOUTH.left * s, MOUTH.top * s, MOUTH.w * s, MOUTH.h * s), { transform: [{ scale: pop }] }]}>
              <Svg width="100%" height="100%" viewBox="0 0 24 12">
                {happy ? (
                  <>
                    <Path d="M2 1.5Q12 1.5 22 1.5Q21 12.5 12 12.5Q3 12.5 2 1.5Z" fill="#FFFFFF" />
                    <Ellipse cx={12} cy={10.2} rx={4.4} ry={2.1} fill="#FB7185" />
                  </>
                ) : mood === 'checking' ? (
                  <Circle cx={12} cy={6} r={3.6} fill="#FFFFFF" />
                ) : mood === 'error' ? (
                  <Path d="M5 9.5Q12 3.5 19 9.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" />
                ) : (
                  <Path d="M3 3Q12 12 21 3" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" fill="none" />
                )}
              </Svg>
            </Animated.View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}
