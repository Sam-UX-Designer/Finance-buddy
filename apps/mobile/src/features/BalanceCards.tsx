import { router, useFocusEffect } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Eye, EyeOff, RotateCw } from 'lucide-react-native';
import { formatDate, formatINR, formatTime, istDateKey, istParts, monthName, type HomeAccount, type Paise } from '@finance-buddy/core';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { space } from '@/theme/tokens';
import { bankSymbolShapes } from '@/ui/bankSymbols';
import { BankLogo, FipMark, Money } from '@/ui/display';
import { PAGE_X, useWide } from '@/ui/layout';
import { Row, T } from '@/ui/primitives';

/**
 * Home balance cards: "All accounts" first, then one card per bank. Swipe between them, tilt the
 * phone (or move the mouse) to tilt the card and move its shine, tap to flip for details.
 */

const ND = Platform.OS !== 'web';
const WEB = Platform.OS === 'web';
const RATIO = 1.85; // a little shorter than a real bank card, so more of Home fits on screen
const RADIUS = 22;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const last4 = (masked: string) => masked.slice(-4);

interface Tilt {
  x: Animated.Value;
  y: Animated.Value;
}

export function BalanceCards({
  total,
  accounts,
  hidden,
  onToggleHidden,
  strip,
}: {
  total: Paise;
  accounts: HomeAccount[];
  hidden: boolean;
  onToggleHidden: () => void;
  /** Desktop: every card in one row across the top of Home (the total a little wider). */
  strip?: boolean;
}) {
  const { c, reduceMotion } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // Tilting the phone to any side gives a firm bump as the card reaches that edge (Home only).
  const onScreen = useRef(true);
  useFocusEffect(
    useCallback(() => {
      onScreen.current = true;
      return () => {
        onScreen.current = false;
      };
    }, []),
  );
  const tilt = useMotionTilt(!reduceMotion, () => {
    if (onScreen.current) haptics.strong();
  });
  const sweep = useSweep(!reduceMotion);
  const wide = useWide();
  // Phones: the carousel runs edge to edge and each page keeps the page margin on both sides, so a
  // card never touches the screen edge while swiping. (Desktop shows every card at once, below.)
  const bleed = wide ? 0 : PAGE_X;
  const cardW = Math.max(0, width - bleed * 2);
  const pageW = width;
  const height = Math.max(176, Math.round(cardW / RATIO));
  const pages = 1 + accounts.length;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const p = Math.round(e.nativeEvent.contentOffset.x / pageW);
    if (p !== page) {
      haptics.select();
      setPage(Math.max(0, Math.min(pages - 1, p)));
    }
  };
  const goTo = (p: number) => scroller.current?.scrollTo({ x: p * pageW, animated: !reduceMotion });

  // Desktop strip: all cards side by side and all the same size. They grow with the window up to
  // STRIP_MAX_W and keep their shape; past that they stop growing instead of stretching.
  const stripCount = accounts.length + 1;
  const stripW = Math.min(STRIP_MAX_W, Math.floor((width - STRIP_GAP * (stripCount - 1)) / stripCount));
  if (wide && strip && width && stripW >= 112) {
    const totalW = stripW;
    const bankStripW = stripW;
    const h = Math.max(140, Math.round(stripW / 1.45));
    // Spread the cards edge to edge (lining up with the columns below) unless the gaps would get wide.
    const spread = stripCount > 1 && (width - stripW * stripCount) / (stripCount - 1) <= 40;
    return (
      <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))} accessibilityLabel="Balance cards" style={{ gap: space.sm }}>
        <Row gap={spread ? 0 : STRIP_GAP} style={{ alignItems: 'flex-start', justifyContent: spread ? 'space-between' : 'flex-start' }}>
          <DeskCard
            intro={introDelay(0)}
            width={totalW}
            height={h}
            label={hidden ? 'Total balance, hidden' : `Total balance ${formatINR(total)} across ${accounts.length} accounts`}
            front={(t, flipped) => <TotalFront total={total} accounts={accounts} hidden={hidden} onToggleHidden={onToggleHidden} width={totalW} height={h} tilt={t} sweep={sweep} active={!flipped} />}
            back={(t) => <TotalBack accounts={accounts} hidden={hidden} width={totalW} height={h} tilt={t} sweep={sweep} />}
          />
          {accounts.map((a, i) => (
            <DeskCard
              intro={introDelay(i + 1)}
              key={a.id}
              width={bankStripW}
              height={h}
              label={hidden ? `${a.fip.name}, balance hidden` : `${a.fip.name} ${a.typeLabel} ending ${last4(a.maskedNumber)}, ${formatINR(a.balance)}`}
              front={(t) => <BankFront a={a} hidden={hidden} width={bankStripW} height={h} tilt={t} sweep={sweep} />}
              back={() => <BankBack a={a} width={bankStripW} height={h} />}
            />
          ))}
        </Row>
        <T v="caption" tone="tertiary" align="right">
          Click a card to flip it
        </T>
      </View>
    );
  }

  if (wide) {
    // Desktop has the room to show every card whole: the total on top, the banks two to a row
    // underneath (an odd last bank gets the full width). Each card tilts and flips on its own.
    // (Also the fallback for the strip when there are too many banks to fit in one row.)
    const gap = space.md;
    const half = Math.floor((width - gap) / 2);
    const fullH = Math.max(176, Math.round(width / 2.1));
    const halfH = Math.max(150, Math.round(half / 1.6));
    return (
      <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))} accessibilityLabel="Balance cards">
        {width ? (
          <View style={{ gap }}>
            <DeskCard
              intro={introDelay(0)}
              width={width}
              height={fullH}
              label={hidden ? 'Total balance, hidden' : `Total balance ${formatINR(total)} across ${accounts.length} accounts`}
              front={(t, flipped) => <TotalFront total={total} accounts={accounts} hidden={hidden} onToggleHidden={onToggleHidden} width={width} height={fullH} tilt={t} sweep={sweep} active={!flipped} />}
              back={(t) => <TotalBack accounts={accounts} hidden={hidden} width={width} height={fullH} tilt={t} sweep={sweep} />}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {accounts.map((a, i) => {
                const full = accounts.length % 2 === 1 && i === accounts.length - 1;
                const w = full ? width : half;
                const h = full ? fullH : halfH;
                return (
                  <DeskCard
                    intro={introDelay(i + 1)}
                    key={a.id}
                    width={w}
                    height={h}
                    label={hidden ? `${a.fip.name}, balance hidden` : `${a.fip.name} ${a.typeLabel} ending ${last4(a.maskedNumber)}, ${formatINR(a.balance)}`}
                    front={(t) => <BankFront a={a} hidden={hidden} width={w} height={h} tilt={t} sweep={sweep} />}
                    back={() => <BankBack a={a} width={w} height={h} />}
                  />
                );
              })}
            </View>
            <T v="caption" tone="tertiary" align="center">
              Click a card to flip it
            </T>
          </View>
        ) : (
          <View style={{ height: 210 }} />
        )}
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: -bleed }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
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
          <View style={{ width: pageW, paddingHorizontal: bleed }}>
            <FlipCard
              intro={introDelay(0)}
              width={cardW}
              height={height}
              tilt={tilt}
              label={hidden ? 'Total balance, hidden' : `Total balance ${formatINR(total)} across ${accounts.length} accounts`}
              front={(flipped) => (
                <TotalFront total={total} accounts={accounts} hidden={hidden} onToggleHidden={onToggleHidden} width={cardW} height={height} tilt={tilt} sweep={sweep} active={!flipped} />
              )}
              back={() => <TotalBack accounts={accounts} hidden={hidden} width={cardW} height={height} tilt={tilt} sweep={sweep} />}
            />
          </View>
          {accounts.map((a, i) => (
            <View key={a.id} style={{ width: pageW, paddingHorizontal: bleed }}>
              <FlipCard
                intro={introDelay(i + 1)}
                width={cardW}
                height={height}
                tilt={tilt}
                label={hidden ? `${a.fip.name}, balance hidden` : `${a.fip.name} ${a.typeLabel} ending ${last4(a.maskedNumber)}, ${formatINR(a.balance)}`}
                front={() => <BankFront a={a} hidden={hidden} width={cardW} height={height} tilt={tilt} sweep={sweep} />}
                back={() => <BankBack a={a} width={cardW} height={height} />}
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

/** Desktop card with its own tilt, so hovering one card doesn't tilt the others. */
function DeskCard({
  width,
  height,
  label,
  front,
  back,
  intro,
}: {
  width: number;
  height: number;
  label: string;
  front: (tilt: Tilt, flipped: boolean) => ReactNode;
  back: (tilt: Tilt) => ReactNode;
  intro?: number;
}) {
  const tilt = useRef<Tilt>({ x: new Animated.Value(0), y: new Animated.Value(0) }).current;
  return <FlipCard width={width} height={height} tilt={tilt} label={label} intro={intro} front={(flipped) => front(tilt, flipped)} back={() => back(tilt)} />;
}

/** Welcome spin timing: the first card starts after a short pause, the rest follow in a ripple. */
const introDelay = (i: number) => 450 + i * 110;

// ── Card shell: tilt + flip ─────────────────────────────────────────────
/**
 * A card that turns over when tapped. It always turns the same way: the first tap shows the back,
 * the next carries on round to the front (a full 360°), never spinning back the way it came.
 * `intro` (ms) gives a welcome spin, one full turn, that long after the card first appears.
 */
function FlipCard({
  width,
  height,
  tilt,
  label,
  front,
  back,
  intro,
}: {
  width: number;
  height: number;
  tilt: Tilt;
  label: string;
  front: (flipped: boolean) => ReactNode;
  back: () => ReactNode;
  intro?: number;
}) {
  const { reduceMotion } = useTheme();
  // Measured in half turns (1 = 180°). It only ever goes up; even = front showing, odd = back.
  const flip = useRef(new Animated.Value(0)).current;
  const side = useRef(Animated.modulo(flip, 2)).current;
  const [flipped, setFlipped] = useState(false);
  const ref = useRef<View>(null);
  usePointerTilt(ref, tilt, !reduceMotion);

  // Welcome spin when Home first appears (opening or refreshing the app).
  useEffect(() => {
    if (intro === undefined || reduceMotion) return;
    const spin = Animated.sequence([Animated.delay(intro), Animated.timing(flip, { toValue: 2, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: ND })]);
    spin.start(({ finished }) => {
      if (finished) flip.setValue(0); // two half turns look exactly like none
    });
    return () => spin.stop();
  }, []);

  const toggle = () => {
    askMotionPermission();
    haptics.tap();
    // Carry on from wherever the card is now (even mid-spin) to the next half turn.
    flip.stopAnimation((v) => {
      const to = Math.floor(v + 0.01) + 1;
      setFlipped(to % 2 === 1);
      if (reduceMotion) flip.setValue(to);
      else Animated.spring(flip, { toValue: to, useNativeDriver: ND, friction: 9, tension: 40 }).start();
    });
  };

  const rotateX = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: ['9deg', '-9deg'] });
  const rotateY = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] });
  // Each face turns with the card; it shows while it faces the viewer.
  const face = (offset: 0 | -180, showsOn: 'front' | 'back') => ({
    opacity: side.interpolate({ inputRange: [0, 0.5, 0.5001, 1.5, 1.5001, 2], outputRange: showsOn === 'front' ? [1, 1, 0, 0, 1, 1] : [0, 0, 1, 1, 0, 0] }),
    transform: [{ perspective: 1200 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: [`${offset}deg`, `${offset + 180}deg`], extrapolate: 'extend' }) }],
  });

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={flipped ? 'Shows the front of the card' : 'Shows card details'}>
      <Animated.View ref={ref} style={{ width, height, transform: [{ perspective: 1200 }, { rotateX }, { rotateY }] }}>
        <Animated.View style={[styles.face, face(0, 'front')]} pointerEvents={flipped ? 'none' : 'box-none'}>
          {front(flipped)}
        </Animated.View>
        <Animated.View style={[styles.face, face(-180, 'back')]} pointerEvents={flipped ? 'box-none' : 'none'}>
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
    ? { from: '#2C2C31', to: '#0C0C0E', text: '#FFFFFF', sub: '#A1A1A8', button: 'rgba(255,255,255,0.12)', border: '#2E2E33', glare: 0.22, ink: 'rgba(255,255,255,0.07)' }
    : { from: '#FFFFFF', to: '#E3E5EA', text: '#0A0A0B', sub: '#5F636B', button: 'rgba(10,10,11,0.06)', border: '#DADDE2', glare: 0.9, ink: 'rgba(10,10,11,0.055)' };
}

function TotalFront({ total, accounts, hidden, onToggleHidden, width, height, tilt, sweep, active }: { total: Paise; accounts: HomeAccount[]; hidden: boolean; onToggleHidden: () => void; width: number; height: number; tilt: Tilt; sweep: Animated.Value; active: boolean }) {
  const k = useTotalColors();
  return (
    <CardSurface width={width} height={height} from={k.from} to={k.to} border={k.border} tilt={tilt} sweep={sweep} glare={k.glare} pattern={{ banks: bankIds(accounts), ink: k.ink }}>
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
        <Money value={total} v={width < 260 ? 'title' : height < 176 ? 'headline' : 'display'} color={k.text} decimals={width < 230 ? 0 : 2} hidden={hidden} />
        {/* Short desktop strip cards: the bank logos below already say how many accounts. */}
        {height < 176 ? null : (
          <T v="small" color={k.sub} style={{ marginTop: 4 }}>
            {accounts.length ? `Across ${accounts.length} bank account${accounts.length === 1 ? '' : 's'}` : 'No bank accounts connected'}
          </T>
        )}
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

/** Small desktop strip cards get tighter backs, so nothing overlaps. */
const isTight = (width: number, height: number) => width < 240 || height < 176;

function TotalBack({ accounts, hidden, width, height, tilt, sweep }: { accounts: HomeAccount[]; hidden: boolean; width: number; height: number; tilt: Tilt; sweep: Animated.Value }) {
  const k = useTotalColors();
  const tight = isTight(width, height);
  const pad = tight ? 14 : 20;
  const rowH = tight ? 18 : 22;
  const rowGap = tight ? 4 : 6;
  // As many accounts as fit between the heading and "View accounts" (with a little space around
  // the list), up to four; the heading then says how many there are and the rest are a tap away.
  const headH = tight ? 16 : 18;
  const around = tight ? 6 : 8;
  const room = height - pad * 2 - headH - 18 - around * 2;
  const shown = accounts.slice(0, Math.max(1, Math.min(4, Math.floor((room + rowGap) / (rowH + rowGap)))));
  const more = accounts.length > shown.length;
  // Narrow cards drop the bank names; the logos say which bank it is.
  const names = width >= 200;
  return (
    <CardSurface pad={pad} width={width} height={height} from={k.to} to={k.from} border={k.border} tilt={tilt} sweep={sweep} glare={k.glare * 0.6}>
      <T v={tight ? 'captionMedium' : 'smallMedium'} color={k.sub} numberOfLines={1}>
        {more ? (tight ? `${accounts.length} accounts` : `Your ${accounts.length} bank accounts`) : tight ? 'Your accounts' : 'Your bank accounts'}
      </T>
      <View style={{ flex: 1, justifyContent: 'center', gap: rowGap, marginVertical: around }}>
        {shown.map((a) => (
          <Row key={a.id} gap={tight ? 8 : 10} style={{ height: rowH }}>
            <FipMark fip={a.fip} size={tight ? 16 : 22} />
            {names ? (
              <T v="small" color={k.text} style={{ flex: 1 }} numberOfLines={1}>
                {tight ? a.fip.shortName : `${a.fip.shortName} •••• ${last4(a.maskedNumber)}`}
              </T>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <T v="smallMedium" color={k.text} numberOfLines={1}>
              {hidden ? '₹ ••••' : formatINR(a.balance, { decimals: 0 })}
            </T>
          </Row>
        ))}
      </View>
      <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button" accessibilityLabel="View accounts" hitSlop={8}>
        <T v="smallMedium" color={k.text} numberOfLines={1}>
          {width < 170 ? 'View all →' : 'View accounts →'}
        </T>
      </Pressable>
    </CardSurface>
  );
}

/** Desktop card strip: the gap between cards and the largest a card gets on very wide screens. */
const STRIP_GAP = 16;
const STRIP_MAX_W = 296;

/** Below this width a card uses smaller type and drops the chip (desktop grid cards). */
const COMPACT_W = 320;

function BankFront({ a, hidden, width, height, tilt, sweep }: { a: HomeAccount; hidden: boolean; width: number; height: number; tilt: Tilt; sweep: Animated.Value }) {
  const compact = width < COMPACT_W;
  return (
    <CardSurface
      pad={compact ? 16 : 20}
      width={width}
      height={height}
      from={shade(a.fip.color, 0.18)}
      to={shade(a.fip.color, -0.28)}
      tilt={tilt}
      sweep={sweep}
      glare={0.28}
      pattern={{ banks: [a.fip.id], ink: 'rgba(255,255,255,0.09)' }}
    >
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <Row gap={compact ? 8 : 10} style={{ flexShrink: 1 }}>
          <BankLogo fip={a.fip} size={compact ? 24 : 30} />
          <T v={compact ? 'smallMedium' : 'bodySemibold'} color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
            {a.fip.shortName}
          </T>
        </Row>
        {/* The smallest cards leave the account type to the back, so the bank name never gets cut. */}
        {width < 240 ? null : (
          <T v="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>
            {a.typeLabel}
          </T>
        )}
      </Row>
      <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        {compact ? null : <CardChip />}
        <Money value={a.balance} v={width < 160 ? 'subtitle' : compact ? 'title' : 'display'} color="#FFFFFF" decimals={width < 230 ? 0 : 2} hidden={hidden} />
      </View>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <T v={compact ? 'smallMedium' : 'bodyMedium'} color="#FFFFFF" style={{ letterSpacing: compact ? 1 : 2 }}>{`••••  ${last4(a.maskedNumber)}`}</T>
        {width < 240 ? null : (
          <T v="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>
            {a.lastSyncedAt ? `Updated ${formatTime(a.lastSyncedAt)}` : 'Not updated yet'}
          </T>
        )}
      </Row>
    </CardSurface>
  );
}

/** When an account last updated: "today, 4:03 PM" or "2 Oct, 4:03 PM"; `short` keeps just the time or the day. */
function syncedWhen(iso: string, short: boolean): string {
  const time = formatTime(iso);
  if (istDateKey(iso) === istDateKey(new Date())) return short ? time : `today, ${time}`;
  const p = istParts(iso);
  const day = `${p.day} ${monthName(p.month)}`;
  return short ? day : `${day}, ${time}`;
}

function BankBack({ a, width, height }: { a: HomeAccount; width: number; height: number }) {
  const bg = shade(a.fip.color, -0.35);
  const open = () => router.push({ pathname: '/(tabs)/activity', params: { accountId: a.id } });
  if (isTight(width, height)) {
    // Bank, account type and when it updated, then the button; every line stays on one line.
    return (
      <View style={{ width, height, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: bg, padding: 14 }}>
        <Row gap={8}>
          <BankLogo fip={a.fip} size={20} />
          <T v="smallMedium" color="#FFFFFF" numberOfLines={1} style={{ flex: 1 }}>
            {a.fip.shortName}
          </T>
        </Row>
        <View style={{ flex: 1, justifyContent: 'center', gap: 2 }}>
          <T v="small" color="rgba(255,255,255,0.85)" numberOfLines={1}>
            {a.typeLabel}
          </T>
          <T v="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>
            {a.lastSyncedAt ? `Updated ${syncedWhen(a.lastSyncedAt, width < 190)}` : 'Not updated yet'}
          </T>
        </View>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`See ${a.fip.shortName} transactions`}
          style={{ height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
        >
          <T v="smallMedium" color={bg} numberOfLines={1}>
            {width < 170 ? 'Transactions' : 'See transactions'}
          </T>
        </Pressable>
      </View>
    );
  }
  const rows: [string, string][] = [
    ['Account', a.typeLabel],
    ['Number', `•••• ${last4(a.maskedNumber)}`],
    [width < COMPACT_W ? 'Updated' : 'Last updated', a.lastSyncedAt ? `${formatDate(a.lastSyncedAt)}, ${formatTime(a.lastSyncedAt)}` : 'Not yet'],
  ];
  return (
    <View style={{ width, height, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: bg, padding: width < COMPACT_W ? 16 : 20 }}>
      <T v="smallMedium" color="rgba(255,255,255,0.75)" numberOfLines={1}>{`${a.fip.name}`}</T>
      <View style={{ flex: 1, justifyContent: 'center', gap: width < COMPACT_W ? 4 : 8 }}>
        {rows.map(([k, v]) => (
          <Row key={k} gap={8} style={{ justifyContent: 'space-between' }}>
            <T v="small" color="rgba(255,255,255,0.7)" numberOfLines={1}>
              {k}
            </T>
            <T v="smallMedium" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
              {v}
            </T>
          </Row>
        ))}
      </View>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`See ${a.fip.shortName} transactions`}
        style={{ height: width < COMPACT_W ? 34 : 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
      >
        <T v="smallMedium" color={bg}>
          See transactions
        </T>
      </Pressable>
    </View>
  );
}

/** Card background (soft diagonal light falloff), a logo watermark, and the moving shine on top. */
function CardSurface({
  width,
  height,
  from,
  to,
  border,
  tilt,
  sweep,
  glare,
  pattern,
  pad = 20,
  children,
}: {
  width: number;
  height: number;
  from: string;
  to: string;
  border?: string;
  tilt: Tilt;
  sweep: Animated.Value;
  glare: number;
  /** Watermark: bank ids whose logos repeat in turn in one faint `ink` colour (null = the Finance Buddy mark). */
  pattern?: { banks: (string | null)[]; ink: string };
  /** Inner padding (smaller on the compact desktop grid cards). */
  pad?: number;
  children: ReactNode;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = Math.max(width, height) * 1.3;
  const glareX = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-width * 0.45, width * 0.45] });
  const glareY = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [-height * 0.45, height * 0.45] });
  const bandX = Animated.add(
    sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.9, width * 1.3] }),
    tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [-width * 0.15, width * 0.15] }),
  );
  // Web draws the gradients with CSS (dependable in every browser); phones use SVG. The base colour
  // is always set, so the card keeps its colour even if a gradient fails to draw.
  const css = (backgroundImage: string) => (WEB ? ({ backgroundImage } as unknown as ViewStyle) : null);
  return (
    <View style={[{ width, height, borderRadius: RADIUS, overflow: 'hidden', borderWidth: border ? 1 : 0, borderColor: border, backgroundColor: to }, css(`linear-gradient(135deg, ${from} 0%, ${to} 100%)`)]}>
      {WEB ? null : (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill={`url(#bg${id})`} />
        </Svg>
      )}
      {pattern ? <Watermark width={width} height={height} banks={pattern.banks} ink={pattern.ink} tilt={tilt} /> : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            { position: 'absolute', width: g, height: g, left: (width - g) / 2, top: (height - g) / 2, transform: [{ translateX: glareX }, { translateY: glareY }] },
            css(`radial-gradient(closest-side, rgba(255,255,255,${glare}) 0%, rgba(255,255,255,0) 100%)`),
          ]}
        >
          {WEB ? null : (
            <Svg width={g} height={g}>
              <Defs>
                <RadialGradient id={`gl${id}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={glare} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={g / 2} cy={g / 2} r={g / 2} fill={`url(#gl${id})`} />
            </Svg>
          )}
        </Animated.View>
        <Animated.View
          style={[
            { position: 'absolute', top: -height, width: width * 0.45, height: height * 3, transform: [{ translateX: bandX }, { rotate: '22deg' }] },
            css('linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)'),
          ]}
        >
          {WEB ? null : (
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
          )}
        </Animated.View>
      </View>
      <View style={{ flex: 1, padding: pad }}>{children}</View>
    </View>
  );
}

/**
 * Airbnb-style watermark: the logo repeated in staggered diagonal rows at 5–10% opacity. It drifts
 * a little against the tilt (parallax), so the pattern catches the shine as the phone moves.
 */
const Watermark = memo(function Watermark({ width, height, banks, ink, tilt }: { width: number; height: number; banks: (string | null)[]; ink: string; tilt: Tilt }) {
  const pad = 28; // extra room so the drift never reveals an edge
  const W = width + pad * 2;
  const H = height + pad * 2;
  const cell = 36;
  const rowH = cell * 0.78;
  const list = banks.length ? banks : [null];
  const items: { x: number; y: number; s: number; bank: string | null }[] = [];
  for (let r = 0; r * rowH < H + rowH; r++) {
    for (let c = 0; c * cell < W + cell; c++) {
      // Every third logo is a little larger, like the Airbnb card.
      const s = (r * 2 + c) % 3 === 0 ? 19 : 14;
      items.push({ x: c * cell + (r % 2 ? cell / 2 : 0), y: r * rowH, s, bank: list[(c + r * 2) % list.length]! });
    }
  }
  const dx = tilt.x.interpolate({ inputRange: [-1, 1], outputRange: [pad * 0.6, -pad * 0.6] });
  const dy = tilt.y.interpolate({ inputRange: [-1, 1], outputRange: [pad * 0.6, -pad * 0.6] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -pad, top: -pad, width: W, height: H, transform: [{ translateX: dx }, { translateY: dy }] }}>
      <Svg width={W} height={H}>
        {items.map((it, i) => (
          <G key={i} transform={`translate(${it.x} ${it.y}) rotate(-18) translate(${-it.s / 2} ${-it.s / 2}) scale(${it.s / 24})`}>
            {(it.bank && bankSymbolShapes(it.bank, ink)) || (
              <>
                <Circle cx={8.5} cy={12} r={7} fill={ink} />
                <Circle cx={15.5} cy={12} r={7} fill={ink} />
              </>
            )}
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
});

/** One logo per connected bank, for the total card's watermark. */
function bankIds(accounts: HomeAccount[]): (string | null)[] {
  const ids = [...new Set(accounts.map((a) => a.fip.id))];
  return ids.length ? ids : [null];
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
function useMotionTilt(enabled: boolean, onEdge?: (side: 'left' | 'right' | 'up' | 'down') => void): Tilt {
  const tilt = useRef<Tilt>({ x: new Animated.Value(0), y: new Animated.Value(0) }).current;
  const edgeHandler = useRef(onEdge);
  edgeHandler.current = onEdge;
  useEffect(() => {
    if (!enabled) return;
    let base: { b: number; g: number } | null = null;
    const s = { x: 0, y: 0 };
    let edge: string | null = null;
    let lastBump = 0;
    const apply = (beta: number, gamma: number) => {
      if (!base) base = { b: beta, g: gamma };
      // Slowly re-centre so the card responds to movement, not to the resting angle.
      base.b += (beta - base.b) * 0.02;
      base.g += (gamma - base.g) * 0.02;
      s.x += (clamp((gamma - base.g) / 18) - s.x) * 0.35;
      s.y += (clamp((beta - base.b) / 18) - s.y) * 0.35;
      tilt.x.setValue(s.x);
      tilt.y.setValue(s.y);
      // Edge bump: once each time the tilt reaches a side; it re-arms after coming back to centre.
      const horizontal = Math.abs(s.x) >= Math.abs(s.y);
      const v = horizontal ? s.x : s.y;
      const side = Math.abs(v) < 0.85 ? null : horizontal ? (v > 0 ? 'right' : 'left') : v > 0 ? 'down' : 'up';
      const now = Date.now();
      if (side && side !== edge && now - lastBump > 200) {
        edge = side;
        lastBump = now;
        edgeHandler.current?.(side);
      } else if (!side && Math.max(Math.abs(s.x), Math.abs(s.y)) < 0.5) edge = null;
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
