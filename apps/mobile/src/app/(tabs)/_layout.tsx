import { Tabs } from 'expo-router/js-tabs';
import { GlassTabBar, Sidebar, TABS, useTabBarSpace } from '@/features/Navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { SIDEBAR_W, TabBarInset, useWide } from '@/ui/layout';

/**
 * Five primary destinations, stable after onboarding (Blueprint §7).
 * Phones and narrow windows: floating Liquid Glass tab bar. Desktop web: left sidebar.
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
          sceneStyle: { backgroundColor: c.bg, paddingLeft: wide ? SIDEBAR_W : 0 },
        }}
        tabBar={(props) => (wide ? <Sidebar {...props} /> : <GlassTabBar {...props} />)}
      >
        {TABS.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label === 'SI' ? 'Super Intelligence' : t.label }} />
        ))}
      </Tabs>
    </TabBarInset.Provider>
  );
}
