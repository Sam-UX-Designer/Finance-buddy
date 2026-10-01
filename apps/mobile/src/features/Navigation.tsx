import { Link, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChartNoAxesColumnIncreasing, ClipboardList, House, Lightbulb, ReceiptText, Settings, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { GlassSurface } from '@/ui/glass';
import { SIDEBAR_W } from '@/ui/layout';
import { T } from '@/ui/primitives';

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

/** Desktop web navigation: a floating glass sidebar on the left. */
export function Sidebar({ state }: TabBarProps) {
  const { c } = useTheme();
  const active = state.routes[state.index]?.name;
  return (
    <View style={{ position: 'absolute', left: 12, top: 12, bottom: 12, width: SIDEBAR_W - 24 }}>
      <GlassSurface radius={radius.xl} style={{ flex: 1, paddingHorizontal: space.md, paddingVertical: space.lg }} role="navigation" aria-label="Main">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, marginBottom: space.xl }}>
          <Image source={require('../../assets/images/icon.png')} style={{ width: 30, height: 30, borderRadius: 8 }} accessibilityIgnoresInvertColors />
          <T v="bodySemibold">Finance Buddy</T>
        </View>
        <View style={{ gap: 2 }}>
          {TABS.map((t) => (
            <SidebarLink key={t.name} href={t.href} icon={t.icon} label={t.label === 'SI' ? 'Super Intelligence' : t.label} active={active === t.name} />
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
          <SidebarLink href="/notifications" icon={Bell} label="Notifications" />
          <SidebarLink href="/settings" icon={Settings} label="Settings" />
        </View>
      </GlassSurface>
    </View>
  );
}

function SidebarLink({ href, icon: Icon, label, active }: { href: Href; icon: LucideIcon; label: string; active?: boolean }) {
  const { c } = useTheme();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: !!active }}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          height: 44,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          backgroundColor: active ? c.surfaceMuted : hover ? c.surfacePressed : 'transparent',
          borderWidth: 2,
          borderColor: focus ? c.text : 'transparent',
        }}
      >
        <Icon size={19} color={active ? c.text : c.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
        <T v={active ? 'bodySemibold' : 'body'} color={active ? c.text : c.textSecondary}>
          {label}
        </T>
      </Pressable>
    </Link>
  );
}
