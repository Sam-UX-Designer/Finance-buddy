import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiRequestError } from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';
import { Sidebar } from '@/features/Navigation';
import { NotificationsPanel } from '@/features/Notifications';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { SIDEBAR_W, useWide } from '@/ui/layout';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Signed-in screens. On desktop web these sit next to the sidebar, which never goes away. */
const SHELL_ROUTES = new Set(['(tabs)', 'accounts', 'assumptions', 'goal', 'notifications', 'settings', 'transaction', 'upcoming']);

function Navigator() {
  const { c, scheme, reduceMotion } = useTheme();
  const { token } = useSession();
  const wide = useWide();
  const segments = useSegments() as string[];
  const pathname = usePathname();
  const shell = wide && !!token && SHELL_ROUTES.has(segments[0] ?? '');
  const [notifications, setNotifications] = useState(false);
  const closeNotifications = useCallback(() => setNotifications(false), []);
  // Going somewhere else (or leaving the desktop layout) puts the panel away.
  useEffect(() => setNotifications(false), [pathname, shell]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, paddingLeft: shell ? SIDEBAR_W : 0 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.bg },
            animation: reduceMotion ? 'none' : 'slide_from_right',
            animationDuration: 250,
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding/success" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="onboarding/sync" options={{ gestureEnabled: false }} />
        </Stack>
      </View>
      {shell ? (
        <>
          <Sidebar notificationsOpen={notifications} onToggleNotifications={() => setNotifications((v) => !v)} />
          <NotificationsPanel visible={notifications} onClose={closeNotifications} />
        </>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [client] = useState(makeClient);
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <SessionProvider>
            <Navigator />
          </SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
