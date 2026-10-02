import { Link, useSegments, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChartNoAxesColumnIncreasing, ClipboardList, House, Lightbulb, ReceiptText, Settings, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { useNotifications } from '@/lib/queries';
import { radius, space } from '@/theme/tokens';
import { GlassSurface } from '@/ui/glass';
import { SIDEBAR_W } from '@/ui/layout';
import { T } from '@/ui/primitives';
import { APP_LOGO } from '@/ui/SIOrb';

export const TABS: { name: string; label: string; icon: LucideIcon; href: Href }[] = [
  { name: 'index', label: 'Home', icon: House, href: '/' },
  { name: 'activity', label: 'Activity', icon: ReceiptText, href: '/activity' },
  { name: 'si', label: 'SI', icon: Lightbulb, href: '/si' },
  { name: 'wealth', label: 'Wealth', icon: ChartNoAxesColumnIncreasing, href: '/wealth' },
  { name: 'plan', label: 'Plan', icon: ClipboardList, href: '/plan' },
];

/** Height of the floating tab bar and the gap below it; screens pad by this much. */
export const TAB_BAR_H = 64;
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_H + Math.max(insets.bottom, 12) + 12;
}

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string, params?: object) => void };
}

const ND = Platform.OS !== 'web';

/**
 * Phone navigation: a floating Liquid Glass capsule. Content scrolls underneath it; a glass lens
 * slides to the selected tab with a short liquid stretch.
 */
export function GlassTabBar({ state, navigation }: TabBarProps) {
  const { c, scheme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const routes = state.routes.filter((r) => TABS.some((t) => t.name === r.name));
  const item = width ? (width - 8) / routes.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);
  const dark = scheme === 'dark';

  useEffect(() => {
    if (!item) return;
    const to = state.index * item;
    if (!placed.current || reduceMotion) {
      placed.current = true;
      x.setValue(to);
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: to, useNativeDriver: ND, stiffness: 240, damping: 24, mass: 0.9 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.24, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.spring(stretch, { toValue: 1, useNativeDriver: ND, stiffness: 200, damping: 11 }),
      ]),
    ]).start();
  }, [state.index, item]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12), alignItems: 'center', paddingHorizontal: space.lg }}>
      <GlassSurface
        radius={TAB_BAR_H / 2}
        refraction
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="tablist"
        style={{ width: '100%', maxWidth: 440, height: TAB_BAR_H, flexDirection: 'row', padding: 4 }}
      >
        {item ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              width: item,
              borderRadius: (TAB_BAR_H - 8) / 2,
              backgroundColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,11,0.07)',
              borderWidth: 1,
              borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.8)',
              transform: [{ translateX: x }, { scaleX: stretch }, { scaleY: stretch.interpolate({ inputRange: [1, 1.24], outputRange: [1, 0.9] }) }],
            }}
          />
        ) : null}
        {routes.map((route) => {
          const tab = TABS.find((t) => t.name === route.name)!;
          const focused = state.routes[state.index]?.key === route.key;
          const Icon = tab.icon;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused) haptics.select();
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, transform: [{ scale: pressed && !reduceMotion ? 0.9 : 1 }] })}
            >
              <Icon size={22} color={focused ? c.text : c.textSecondary} strokeWidth={focused ? 2.3 : 1.8} fill={focused && tab.name === 'index' ? c.text : 'none'} />
              <T v="tab" color={focused ? c.text : c.textSecondary} style={{ fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_500Medium' }}>
                {tab.label}
              </T>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

/**
 * Desktop web: whether the last input was the keyboard. Focus rings show for keyboard users only,
 * not after a mouse click (like the CSS :focus-visible rule).
 */
let keyboardInput = false;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardInput = true;
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      keyboardInput = false;
    },
    true,
  );
}

/** Sidebar row height and the gap between rows (the selection pill slides in steps of both). */
const ROW_H = 44;
const ROW_GAP = 2;

/**
 * Desktop web navigation: a floating glass sidebar that stays on every screen. A pill slides to
 * the selected destination. Notifications open in a panel beside it instead of a new page.
 */
export function Sidebar({ notificationsOpen, onToggleNotifications }: { notificationsOpen: boolean; onToggleNotifications: () => void }) {
  const { c, reduceMotion } = useTheme();
  const segments = useSegments() as string[];
  const unread = useNotifications().data?.notifications.filter((n) => !n.readAt).length ?? 0;
  const active = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : segments[0];
  const index = TABS.findIndex((t) => t.name === active);
  const y = useRef(new Animated.Value(Math.max(0, index) * (ROW_H + ROW_GAP))).current;
  const shown = useRef(new Animated.Value(index >= 0 ? 1 : 0)).current;
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(enter, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: ND }).start();
  }, []);
  useEffect(() => {
    if (index < 0) {
      Animated.timing(shown, { toValue: 0, duration: reduceMotion ? 0 : 140, useNativeDriver: ND }).start();
      return;
    }
    const to = index * (ROW_H + ROW_GAP);
    Animated.timing(shown, { toValue: 1, duration: reduceMotion ? 0 : 140, useNativeDriver: ND }).start();
    if (reduceMotion) y.setValue(to);
    else Animated.spring(y, { toValue: to, useNativeDriver: ND, stiffness: 320, damping: 28, mass: 0.8 }).start();
  }, [index, reduceMotion]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 12,
        top: 12,
        bottom: 12,
        width: SIDEBAR_W - 24,
        opacity: enter,
        transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <GlassSurface radius={radius.xl} style={{ flex: 1, paddingHorizontal: space.md, paddingVertical: space.lg }} role="navigation" aria-label="Main">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, marginBottom: space.xl }}>
          <Image source={APP_LOGO} style={{ width: 32, height: 32 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          <T v="bodySemibold">Finance Buddy</T>
        </View>
        <View style={{ gap: ROW_GAP }}>
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: ROW_H, borderRadius: radius.md, backgroundColor: c.surfaceMuted, opacity: shown, transform: [{ translateY: y }] }}
          />
          {TABS.map((t) => (
            <SidebarItem key={t.name} icon={t.icon} label={t.label === 'SI' ? 'Super Intelligence' : t.label} active={active === t.name} href={t.href} />
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: ROW_GAP, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
          <SidebarItem icon={Bell} label="Notifications" active={notificationsOpen} filled={notificationsOpen} badge={unread} onPress={onToggleNotifications} expanded={notificationsOpen} />
          <SidebarItem icon={Settings} label="Settings" active={active === 'settings'} filled={active === 'settings'} href="/settings" />
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  filled,
  badge,
  expanded,
  href,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  /** Draws its own selected background (rows outside the sliding pill). */
  filled?: boolean;
  badge?: number;
  expanded?: boolean;
  /** Navigation rows are real links (open in a new tab works); action rows take onPress. */
  href?: Href;
  onPress?: () => void;
}) {
  const { c, reduceMotion } = useTheme();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;
  const hoverTo = (v: number) => {
    if (reduceMotion) return;
    Animated.spring(lift, { toValue: v, useNativeDriver: ND, stiffness: 400, damping: 22 }).start();
  };
  const row = (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      accessibilityState={href ? { selected: !!active } : { expanded }}
      aria-current={href && active ? 'page' : undefined}
      onPress={onPress}
      onHoverIn={() => {
        setHover(true);
        hoverTo(1);
      }}
      onHoverOut={() => {
        setHover(false);
        hoverTo(0);
      }}
      onFocus={() => setFocus(keyboardInput)}
      onBlur={() => setFocus(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: ROW_H,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: filled ? c.surfaceMuted : hover && !active ? c.surfacePressed : 'transparent',
        borderWidth: 2,
        borderColor: focus ? c.text : 'transparent',
      }}
    >
      <Animated.View
        style={{ transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { translateX: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }) }] }}
      >
        <Icon size={19} color={active ? c.text : c.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
      </Animated.View>
      <T v={active ? 'bodySemibold' : 'body'} color={active ? c.text : c.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </T>
      {badge ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.negative, alignItems: 'center', justifyContent: 'center' }}>
          <T v="caption" color="#FFFFFF" style={{ fontFamily: 'Inter_600SemiBold' }}>
            {badge > 9 ? '9+' : String(badge)}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {row}
    </Link>
  ) : (
    row
  );
}
