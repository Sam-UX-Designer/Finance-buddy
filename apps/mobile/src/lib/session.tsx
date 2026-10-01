import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeDTO, SessionResponse } from '@finance-buddy/core';
import { api, ApiRequestError, errorMessage, setApiToken, setSessionRestored, setUnauthorizedHandler } from './api';
import { storage } from './storage';

const TOKEN_KEY = 'financebuddy.session';

interface SessionValue {
  ready: boolean;
  /** Set when a saved session exists but the server couldn't be reached at launch. */
  bootError: string | null;
  retryBoot: () => void;
  token: string | null;
  me: MeDTO | null;
  signIn: (s: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<MeDTO | null>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeDTO | null>(null);

  const clear = useCallback(async () => {
    setApiToken(null);
    setToken(null);
    setMe(null);
    qc.clear();
    await storage.remove(TOKEN_KEY);
  }, [qc]);

  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      setBootError(null);
      const saved = await storage.get(TOKEN_KEY);
      if (saved) {
        setApiToken(saved);
        try {
          const m = await api<MeDTO>('/v1/me', { beforeSession: true });
          setToken(saved);
          setMe(m);
        } catch (e) {
          if (e instanceof ApiRequestError && e.status === 401) {
            setApiToken(null);
            await storage.remove(TOKEN_KEY);
          } else {
            // Keep the session; the user may simply be offline.
            setToken(saved);
            setBootError(errorMessage(e));
          }
        }
      }
      setSessionRestored();
      setReady(true);
    })();
  }, [clear, attempt]);

  const retryBoot = useCallback(() => {
    setReady(false);
    setAttempt((n) => n + 1);
  }, []);

  const signIn = useCallback(async (s: SessionResponse) => {
    setApiToken(s.token);
    await storage.set(TOKEN_KEY, s.token);
    setToken(s.token);
    setMe(s.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/v1/auth/logout', { method: 'POST' });
    } catch {
      // Sign out locally even if the network call fails.
    }
    await clear();
  }, [clear]);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api<MeDTO>('/v1/me');
      setMe(m);
      return m;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ ready, bootError, retryBoot, token, me, signIn, signOut, refreshMe }),
    [ready, bootError, retryBoot, token, me, signIn, signOut, refreshMe],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/** Where a user should land for each onboarding state (the server owns the state machine). */
export function routeForState(state: MeDTO['onboardingState']): string {
  switch (state) {
    case 'PHONE_VERIFIED':
    case 'DISCOVERING':
      return '/onboarding/discover';
    case 'ACCOUNTS_FOUND':
      return '/onboarding/accounts';
    case 'CONSENT_PENDING':
    case 'CONSENT_REJECTED':
      return '/onboarding/accounts';
    case 'SYNCING':
    case 'SYNC_FAILED':
      return '/onboarding/sync';
    case 'READY':
      return '/(tabs)';
  }
}
