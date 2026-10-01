import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import type { ThemePreference } from '@finance-buddy/core';
import { storage } from '@/lib/storage';
import { dark, light, type Palette } from './tokens';

interface ThemeValue {
  c: Palette;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const PREF_KEY = 'financebuddy.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    storage.get(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    void storage.set(PREF_KEY, p);
  }, []);

  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(
    () => ({ c: scheme === 'dark' ? dark : light, scheme, preference, setPreference, reduceMotion }),
    [scheme, preference, setPreference, reduceMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
