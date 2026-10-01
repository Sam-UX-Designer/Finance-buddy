import { router } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Eye, EyeOff, RotateCw } from 'lucide-react-native';
import { formatDate, formatINR, formatTime, type HomeAccount, type Paise } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { BankLogo, FipMark, Money } from '@/ui/display';
import { Row, T } from '@/ui/primitives';

/**
 * Home balance cards: "All accounts" first, then one card per bank. Swipe between them, tilt the
 * phone (or move the mouse) to tilt the card and move its shine, tap to flip for details.
 */

const ND = Platform.OS !== 'web';
const RATIO = 1.586; // bank card proportions
const RADIUS = 22;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const last4 = (masked: string) => masked.slice(-4);

interface Tilt {
  x: Animated.Value;
  y: Animated.Value;
}

export function BalanceCards({ total, accounts, hidden, onToggleHidden }: { total: Paise; accounts: HomeAccount[]; hidden: boolean; onToggleHidden: () => void }) {
  const { c, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const tilt = useMotionTilt(!reduceMotion);
  const sweep = useSweep(!reduceMotion);
  const height = Math.max(190, Math.round(width / RATIO));
  const pages = 1 + accounts.length;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(Math.max(0, Math.min(pages - 1, p)));
  };
  const goTo = (p: number) => scroller.current?.scrollTo({ x: p * width, animated: !reduceMotion });

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          accessibilityLabel="Balance cards"
        >
          <View style={{ width }}>
            <FlipCard
              width={width}
              height={height}
              tilt={tilt}
              label={hidden ? 'Total balance, hidden' : `Total balance ${formatINR(total)} across ${accounts.length} accounts`}
              front={(flipped) => (
                <TotalFront total={total} accounts={accounts} hidden={hidden} onToggleHidden={onToggleHidden} width={width} height={height} tilt={tilt} sweep={sweep} active={!flipped} />
              )}
              back={() => <TotalBack accounts={accounts} hidden={hidden} width={width} height={height} tilt={tilt} sweep={sweep} />}
            />
          </View>
          {accounts.map((a) => (
            <View key={a.id} style={{ width }}>
              <FlipCard
                width={width}
                height={height}
                tilt={tilt}
                label={hidden ? `${a.fip.name}, balance hidden` : `${a.fip.name} ${a.typeLabel} ending ${last4(a.maskedNumber)}, ${formatINR(a.balance)}`}
                front={() => <BankFront a={a} hidden={hidden} width={width} height={height} tilt={tilt} sweep={sweep} />}
                back={() => <BankBack a={a} width={width} height={height} />}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: 210 }} />
      )}
      {pages > 1 ? (
        <View style={{ alignItems: 'center', marginTop: space.md, gap: 6 }}>
          <Row gap={6}>
            {Array.from({ length: pages }, (_, i) => (
              <Pressable key={i} onPress={() => goTo(i)} accessibilityRole="button" accessibilityLabel={i === 0 ? 'All accounts card' : `${accounts[i - 1]!.fip.name} card`} hitSlop={8}>
                <View style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.text : c.border }} />
              </Pressable>
            ))}
          </Row>
          <T v="caption" tone="tertiary">
            Swipe for each bank · Tap a card to flip
          </T>
        </View>
      ) : null}
    </View>
  );
}

// ── Card shell: tilt + flip ─────────────────────────────────────────────
function FlipCard({ width, height, tilt, label, front, back }: { width: number; height: number; tilt: Tilt; label: string; front: (flipped: boolean) => ReactNode; back: () => ReactNode }) {
  const { reduceMotion } = useTheme();
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const ref = useRef<View>(null);
  usePointerTilt(ref, tilt, !reduceMotion);

  const toggle = () => {
    askMotionPermission();
    const to = flipped ? 0 : 1;
    setFlipped(!flipped);
    if (reduceMotion) flip.setValue(to);
    else Animated.spring(flip, { toValue: to, useNativeDriver: ND, friction: 9, tension: 40 }).start();
  };

  const rotateX = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: ['9deg', '-9deg'] });
  const rotateY = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });
  const face = (from: string, to: string, visibleFrom: 0 | 1) => ({
    opacity: flip.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: visibleFrom === 0 ? [1, 1, 0, 0] : [0, 0, 1, 1] }),
    transform: [{ perspective: 1200 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }],
  });

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={flipped ? 'Shows the front of the card' : 'Shows card details'}>
      <Animated.View ref={ref} style={{ width, height, transform: [{ perspective: 1200 }, { rotateX }, { rotateY }] }}>
        <Animated.View style={[styles.face, face('0deg', '180deg', 0)]} pointerEvents={flipped ? 'none' : 'box-none'}>
          {front(flipped)}
        </Animated.View>
        <Animated.View style={[styles.face, face('-180deg', '0deg', 1)]} pointerEvents={flipped ? 'box-none' : 'none'}>
          {back()}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ── Faces ─────────────────────────────────────────────────────────────
function useTotalColors() {
  const { scheme } = useTheme();
  return scheme === 'dark'
    ? { from: '#2C2C31', to: '#0C0C0E', text: '#FFFFFF', sub: '#A1A1A8', button: 'rgba(255,255,255,0.12)', border: '#2E2E33', glare: 0.22 }
    : { from: '#FFFFFF', to: '#E3E5EA', text: '#0A0A0B', sub: '#5F636B', button: 'rgba(10,10,11,0.06)', border: '#DADDE2', glare: 0.9 };
}

function TotalFront({ total, accounts, hidden, onToggleHidden, width, height, tilt, sweep, active }: { total: Paise; accounts: HomeAccount[]; hidden: boolean; onToggleHidden: () => void; width: number; height: number; tilt: Tilt; sweep: Animated.Value; active: boolean }) {
  const k = useTotalColors();
  return (
    <CardSurface width={width} height={height} from={k.from} to={k.to} border={k.border} tilt={tilt} sweep={sweep} glare={k.glare}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="body" color={k.sub}>
          Total Balance
        </T>
        <Pressable
          onPress={onToggleHidden}
          disabled={!active}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
          hitSlop={10}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: k.button, alignItems: 'center', justifyContent: 'center' }}
        >
          {hidden ? <Eye size={17} color={k.text} /> : <EyeOff size={17} color={k.text} />}
        </Pressable>
      </Row>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Money value={total} v="display" color={k.text} decimals={2} hidden={hidden} />
        <T v="small" color={k.sub} style={{ marginTop: 4 }}>
          {accounts.length ? `Across ${accounts.length} bank account${accounts.length === 1 ? '' : 's'}` : 'No bank accounts connected'}
        </T>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          {accounts.slice(0, 5).map((a, i) => (
            <View key={a.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 8, borderWidth: 2, borderColor: k.to }}>
              <FipMark fip={a.fip} size={22} />
            </View>
          ))}
        </Row>
        <Row gap={4}>
          <RotateCw size={12} color={k.sub} />
          <T v="caption" color={k.sub}>
            Details
          </T>
        </Row>
      </Row>
    </CardSurface>
  );
}

function TotalBack({ accounts, hidden, width, height, tilt, sweep }: { accounts: HomeAccount[]; hidden: boolean; width: number; height: number; tilt: Tilt; sweep: Animated.Value }) {
  const k = useTotalColors();
  return (
    <CardSurface width={width} height={height} from={k.to} to={k.from} border={k.border} tilt={tilt} sweep={sweep} glare={k.glare * 0.6}>
      <T v="smallMedium" color={k.sub}>
        Your bank accounts
      </T>
      <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
        {accounts.slice(0, 4).map((a) => (
          <Row key={a.id} gap={10}>
            <FipMark fip={a.fip} size={22} />
            <T v="small" color={k.text} style={{ flex: 1 }} numberOfLines={1}>{`${a.fip.shortName} •••• ${last4(a.maskedNumber)}`}</T>
            <T v="smallMedium" color={k.text}>
              {hidden ? '₹ ••••' : formatINR(a.balance, { decimals: 0 })}
            </T>
          </Row>
        ))}
        {accounts.length > 4 ? <T v="caption" color={k.sub}>{`+${accounts.length - 4} more`}</T> : null}
      </View>
      <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button" accessibilityLabel="View accounts" hitSlop={8}>
        <T v="smallMedium" color={k.text}>
          View accounts →
        </T>
      </Pressable>
    </CardSurface>
  );
}

function BankFront({ a, hidden, width, height, tilt, sweep }: { a: HomeAccount; hidden: boolean; width: number; height: number; tilt: Tilt; sweep: Animated.Value }) {
  return (
    <CardSurface width={width} height={height} from={shade(a.fip.color, 0.18)} to={shade(a.fip.color, -0.28)} tilt={tilt} sweep={sweep} glare={0.28}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <BankLogo fip={a.fip} size={30} />
          <T v="bodySemibold" color="#FFFFFF">
            {a.fip.shortName}
          </T>
        </Row>
        <T v="caption" color="rgba(255,255,255,0.75)">
          {a.typeLabel}
        </T>
      </Row>
      <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        <CardChip />
        <Money value={a.balance} v="display" color="#FFFFFF" decimals={2} hidden={hidden} />
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="bodyMedium" color="#FFFFFF" style={{ letterSpacing: 2 }}>{`••••  ${last4(a.maskedNumber)}`}</T>
        <T v="caption" color="rgba(255,255,255,0.75)">
          {a.lastSyncedAt ? `Updated ${formatTime(a.lastSyncedAt)}` : 'Not updated yet'}
        </T>
      </Row>
    </CardSurface>
  );
}

function BankBack({ a, width, height }: { a: HomeAccount; width: number; height: number }) {
  const rows: [string, string][] = [
    ['Account', a.typeLabel],
    ['Number', `•••• ${last4(a.maskedNumber)}`],
    ['Last updated', a.lastSyncedAt ? `${formatDate(a.lastSyncedAt)}, ${formatTime(a.lastSyncedAt)}` : '—'],
  ];
  return (
    <View style={{ width, height, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: shade(a.fip.color, -0.35), padding: 20 }}>
      <T v="smallMedium" color="rgba(255,255,255,0.75)">{`${a.fip.name}`}</T>
      <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
        {rows.map(([k, v]) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <T v="small" color="rgba(255,255,255,0.7)">
              {k}
            </T>
            <T v="smallMedium" color="#FFFFFF">
              {v}
            </T>
          </Row>
        ))}
      </View>
      <Pressable
        onPress={() => router.push({ pathname: '/(tabs)/activity', params: { accountId: a.id } })}
        accessibilityRole="button"
        accessibilityLabel={`See ${a.fip.shortName} transactions`}
        style={{ height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
      >
        <T v="smallMedium" color={shade(a.fip.color, -0.35)}>
          See transactions
        </T>
      </Pressable>
    </View>
  );
}

/** Card background (soft diagonal light falloff) with the moving shine on top. */
function CardSurface({ width, height, from, to, border, tilt, sweep, glare, children }: { width: number; height: number; from: string; to: string; border?: string; tilt: Tilt; sweep: Animated.Value; glare: number; children: ReactNode }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = Math.max(width, height) * 1.3;
  const glareX = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-width * 0.45, width * 0.45] });
  const glareY = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [-height * 0.45, height * 0.45] });
  const bandX = Animated.add(
    sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.9, width * 1.3] }),
    tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-width * 0.15, width * 0.15] }),
  );
  return (
    <View style={{ width, height, borderRadius: RADIUS, overflow: 'hidden', borderWidth: border ? 1 : 0, borderColor: border }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#bg${id})`} />
      </Svg>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View style={{ position: 'absolute', width: g, height: g, left: (width - g) / 2, top: (height - g) / 2, transform: [{ translateX: glareX }, { translateY: glareY }] }}>
          <Svg width={g} height={g}>
            <Defs>
              <RadialGradient id={`gl${id}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={glare} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={g / 2} cy={g / 2} r={g / 2} fill={`url(#gl${id})`} />
          </Svg>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', top: -height, width: width * 0.45, height: height * 3, transform: [{ translateX: bandX }, { rotate: '22deg' }] }}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`sw${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.22} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#sw${id})`} />
          </Svg>
        </Animated.View>
      </View>
      <View style={{ flex: 1, padding: 20 }}>{children}</View>
    </View>
  );
}

/** The contact chip printed on bank cards. */
function CardChip() {
  const id = `chip${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={38} height={28} viewBox="0 0 38 28">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F3DCA0" />
          <Stop offset="1" stopColor="#C49A45" />
        </LinearGradient>
      </Defs>
      <Rect x={0.5} y={0.5} width={37} height={27} rx={6} fill={`url(#${id})`} stroke="rgba(0,0,0,0.15)" />
      <Rect x={13} y={0.5} width={12} height={27} fill="none" stroke="rgba(0,0,0,0.18)" />
      <Rect x={0.5} y={9} width={37} height={10} fill="none" stroke="rgba(0,0,0,0.18)" />
    </Svg>
  );
}

// ── Motion ────────────────────────────────────────────────────────────
/** Tilt from the device's motion sensors (phones), relative to how the phone is being held. */
function useMotionTilt(enabled: boolean): Tilt {
  const tilt = useRef<Tilt>({ x: new Animated.Value(0), y: new Animated.Value(0) }).current;
  useEffect(() => {
    if (!enabled) return;
    let base: { b: number; g: number } | null = null;
    const s = { x: 0, y: 0 };
    const apply = (beta: number, gamma: number) => {
      if (!base) base = { b: beta, g: gamma };
      // Slowly re-centre so the card responds to movement, not to the resting angle.
      base.b += (beta - base.b) * 0.02;
      base.g += (gamma - base.g) * 0.02;
      s.x += (clamp((gamma - base.g) / 18) - s.x) * 0.35;
      s.y += (clamp((beta - base.b) / 18) - s.y) * 0.35;
      tilt.x.setValue(s.x);
      tilt.y.setValue(s.y);
    };
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.beta != null && e.gamma != null) apply(e.beta, e.gamma);
      };
      window.addEventListener('deviceorientation', onOrient);
      return () => window.removeEventListener('deviceorientation', onOrient);
    }
    let sub: { remove(): void } | undefined;
    DeviceMotion.isAvailableAsync()
      .then((ok) => {
        if (!ok) return;
        DeviceMotion.setUpdateInterval(33);
        sub = DeviceMotion.addListener((m) => {
          if (m.rotation) apply((m.rotation.beta * 180) / Math.PI, (m.rotation.gamma * 180) / Math.PI);
        });
      })
      .catch(() => undefined);
    return () => sub?.remove();
  }, [enabled]);
  return tilt;
}

/** Desktop browsers: the card follows the mouse. */
function usePointerTilt(ref: React.RefObject<View | null>, tilt: Tilt, enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      tilt.x.setValue(clamp(((e.clientX - r.left) / r.width) * 2 - 1));
      tilt.y.setValue(clamp(((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const leave = () => {
      Animated.spring(tilt.x, { toValue: 0, useNativeDriver: ND, friction: 6 }).start();
      Animated.spring(tilt.y, { toValue: 0, useNativeDriver: ND, friction: 6 }).start();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [enabled]);
}

/** A light band that sweeps across the cards every few seconds. */
function useSweep(enabled: boolean): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(v, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        Animated.delay(3500),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: ND }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled]);
  return v;
}

/** iPhone browsers only share motion data after the person allows it (asked on first tap). */
function askMotionPermission() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (D?.requestPermission) void D.requestPermission().catch(() => undefined);
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' },
});
