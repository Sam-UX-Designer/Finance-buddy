import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartNoAxesColumnIncreasing, ClipboardList, House, Lightbulb, ReceiptText, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_WIDTH } from '@/ui/layout';
import { Press, T } from '@/ui/primitives';

const TABS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: 'index', label: 'Home', icon: House },
  { name: 'activity', label: 'Activity', icon: ReceiptText },
  { name: 'si', label: 'SI', icon: Lightbulb },
  { name: 'wealth', label: 'Wealth', icon: ChartNoAxesColumnIncreasing },
  { name: 'plan', label: 'Plan', icon: ClipboardList },
];

/** Five-item bottom navigation, stable after onboarding (Blueprint §7). */
export default function TabsLayout() {
  const { c, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'fade', sceneStyle: { backgroundColor: c.bg } }}
      tabBar={({ state, navigation }) => (
        <View style={{ backgroundColor: c.tabBar, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }}>
          <View style={{ flexDirection: 'row', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingTop: 8 }} accessibilityRole="tablist">
            {state.routes.map((route, index) => {
              const tab = TABS.find((t) => t.name === route.name);
              if (!tab) return null;
              const focused = state.index === index;
              const Icon = tab.icon;
              return (
                <Press
                  key={route.key}
                  style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={tab.label}
                  scaleTo={0.94}
                  onPress={() => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                  }}
                >
                  <Icon size={23} color={focused ? c.text : c.textTertiary} strokeWidth={focused ? 2.3 : 1.7} fill={focused && tab.name === 'index' ? c.text : 'none'} />
                  <T v="tab" color={focused ? c.text : c.textTertiary} style={{ fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_500Medium' }}>
                    {tab.label}
                  </T>
                </Press>
              );
            })}
          </View>
        </View>
      )}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
