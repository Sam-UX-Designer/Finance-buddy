import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiError } from '@moneymate/core';

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  // On a device, the API runs on the same machine as the Expo dev server.
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000`;
}

export const API_URL = resolveBaseUrl();

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(t: string | null) {
  token = t;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', "Can't reach MoneyMate. Check your connection and try again.");
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json as ApiError | null)?.error;
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiRequestError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Something went wrong.', err?.retryAfterSeconds);
  }
  return json as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return 'Something went wrong. Please try again.';
}
