import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Haptics with their system meanings (HIG: Playing haptics):
 * - select: a value or tab changed
 * - tap: something snapped into place (card flip, page change)
 * - strong: a firm bump (the balance card reaching the edge as you tilt the phone)
 * - success / warning / error: the outcome of a task
 * The phone app uses the system haptic engine. On the web, Android browsers vibrate instead;
 * iPhone browsers don't let web pages vibrate. People can turn haptics off in Settings.
 */
const KEY = 'fb.haptics';
let enabled = true;
if (Platform.OS !== 'web') {
  SecureStore.getItemAsync(KEY)
    .then((v) => {
      if (v === 'off') enabled = false;
    })
    .catch(() => undefined);
}

/** Web fallback: a short vibration where the browser supports it (Android). */
const vibrate = (pattern: number | number[]) => {
  const nav = globalThis.navigator as (Navigator & { vibrate?: (p: number | number[]) => boolean }) | undefined;
  try {
    nav?.vibrate?.(pattern);
  } catch {
    // Not allowed yet (no tap on the page so far); skip.
  }
};

const run = (fn: () => Promise<void>, web: number | number[]) => {
  if (!enabled) return;
  if (Platform.OS === 'web') return vibrate(web);
  fn().catch(() => undefined);
};

export const haptics = {
  select: () => run(() => Haptics.selectionAsync(), 8),
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 12),
  strong: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 35),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), [15, 60, 15]),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), [25, 80, 25]),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), [30, 60, 30, 60, 30]),
  get enabled() {
    return enabled;
  },
  setEnabled(on: boolean) {
    enabled = on;
    if (Platform.OS !== 'web') SecureStore.setItemAsync(KEY, on ? 'on' : 'off').catch(() => undefined);
  },
};
