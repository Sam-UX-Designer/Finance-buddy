import { Tabs } from 'expo-router/js-tabs';
import { GlassTabBar, TABS, useTabBarSpace } from '@/features/Navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { TabBarInset, useWide } from '@/ui/layout';

/**
 * Five primary destinations, stable after onboarding (Blueprint §7).
 * Phones and narrow windows: floating Liquid Glass tab bar. Desktop web: the sidebar, drawn by the
 * root layout so it stays on every screen.
 */
export default function TabsLayout() {
  const { c, reduceMotion } = useTheme();
  const wide = useWide();
  const tabSpace = useTabBarSpace();
  return (
    <TabBarInset.Provider value={wide ? 0 : tabSpace}>
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? 'none' : 'fade',
          sceneStyle: { backgroundColor: c.bg },
        }}
        tabBar={(props) => (wide ? null : <GlassTabBar {...props} />)}
      >
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label === 'SI' ? 'Super Intelligence' : t.label }} />
        ))}
      </Tabs>
    </TabBarInset.Provider>
  );
}
