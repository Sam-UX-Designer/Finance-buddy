import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Haptics with their system meanings (HIG: Playing haptics):
 * - select: a value or tab changed
 * - tap: something snapped into place (card flip, page change)
 * - success / warning / error: the outcome of a task
 * Phones only; people can turn them off in Settings.
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

const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web' || !enabled) return;
  fn().catch(() => undefined);
};

export const haptics = {
  select: () => run(() => Haptics.selectionAsync()),
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  get enabled() {
    return enabled;
  },
  setEnabled(on: boolean) {
    enabled = on;
    if (Platform.OS !== 'web') SecureStore.setItemAsync(KEY, on ? 'on' : 'off').catch(() => undefined);
  },
};
