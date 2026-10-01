import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountsResponse,
  ActivityFilter,
  BudgetsResponse,
  CategoryId,
  ConsentDTO,
  ConsentPreviewDTO,
  DeviceSessionDTO,
  DiscoveryResponse,
  ForecastDTO,
  GoalBody,
  GoalDTO,
  HomeDTO,
  JobDTO,
  MeDTO,
  NotificationDTO,
  PlanDTO,
  SIAskResponse,
  SIHomeDTO,
  SplitPart,
  TxnDTO,
  TxnListResponse,
  TxnPatchBody,
  UpcomingPayment,
  WealthDTO,
} from '@finance-buddy/core';
import { api } from './api';

export const keys = {
  home: ['home'] as const,
  accounts: ['accounts'] as const,
  txns: (f: TxnFilters) => ['txns', f] as const,
  txn: (id: string) => ['txn', id] as const,
  wealth: ['wealth'] as const,
  plan: ['plan'] as const,
  forecast: ['forecast'] as const,
  budgets: ['budgets'] as const,
  goal: (id: string) => ['goal', id] as const,
  si: ['si'] as const,
  notifications: ['notifications'] as const,
  upcoming: ['upcoming'] as const,
  sessions: ['sessions'] as const,
  health: ['health'] as const,
};

/** Everything derived from financial data — invalidate after any change to it. */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['home', 'accounts', 'txns', 'txn', 'wealth', 'plan', 'forecast', 'budgets', 'goal', 'si', 'notifications', 'upcoming'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => api<HomeDTO>('/v1/home') });
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: () => api<AccountsResponse>('/v1/accounts') });
export const useWealth = () => useQuery({ queryKey: keys.wealth, queryFn: () => api<WealthDTO>('/v1/wealth') });
export const usePlan = () => useQuery({ queryKey: keys.plan, queryFn: () => api<PlanDTO>('/v1/plan') });
export const useForecast = () => useQuery({ queryKey: keys.forecast, queryFn: () => api<ForecastDTO>('/v1/forecast') });
export const useBudgets = () => useQuery({ queryKey: keys.budgets, queryFn: () => api<BudgetsResponse>('/v1/budgets') });
export const useSI = () => useQuery({ queryKey: keys.si, queryFn: () => api<SIHomeDTO>('/v1/si') });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api<{ notifications: NotificationDTO[] }>('/v1/notifications') });
export const useUpcoming = () => useQuery({ queryKey: keys.upcoming, queryFn: () => api<{ days: number; total: number; items: UpcomingPayment[] }>('/v1/upcoming?days=30') });
export const useSessions = () => useQuery({ queryKey: keys.sessions, queryFn: () => api<{ sessions: DeviceSessionDTO[] }>('/v1/me/sessions') });
export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: () => api<{ ok: boolean; aa: string; sms: string; si: string }>('/health'), staleTime: Infinity });
export const useGoal = (id: string) => useQuery({ queryKey: keys.goal(id), queryFn: () => api<GoalDTO>(`/v1/goals/${id}`) });
export const useTxn = (id: string) => useQuery({ queryKey: keys.txn(id), queryFn: () => api<TxnDTO>(`/v1/transactions/${id}`) });

export interface TxnFilters {
  filter: ActivityFilter;
  q: string;
  month?: string;
  accountId?: string;
  categoryId?: CategoryId;
}

export function useTxns(f: TxnFilters) {
  return useInfiniteQuery({
    queryKey: keys.txns(f),
    initialPageParam: '' as string,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ filter: f.filter, limit: '40' });
      if (f.q) p.set('q', f.q);
      if (f.month) p.set('month', f.month);
      if (f.accountId) p.set('accountId', f.accountId);
      if (f.categoryId) p.set('categoryId', f.categoryId);
      if (pageParam) p.set('cursor', pageParam);
      return api<TxnListResponse>(`/v1/transactions?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePatchTxn(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: TxnPatchBody) => api<TxnDTO>(`/v1/transactions/${id}`, { method: 'PATCH', body }),
    onSuccess: (t) => {
      qc.setQueryData(keys.txn(id), t);
      void invalidate();
    },
  });
}

export function useSplitTxn(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (parts: SplitPart[]) => api<TxnDTO>(`/v1/transactions/${id}/split`, { method: 'PUT', body: { parts } }),
    onSuccess: (t) => {
      qc.setQueryData(keys.txn(id), t);
      void invalidate();
    },
  });
}

export function useSaveGoal(id?: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: GoalBody) => (id ? api<GoalDTO>(`/v1/goals/${id}`, { method: 'PATCH', body }) : api<GoalDTO>('/v1/goals', { method: 'POST', body })),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteGoal(id: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: () => api(`/v1/goals/${id}`, { method: 'DELETE' }), onSuccess: () => void invalidate() });
}

export function useSetAssumptions() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: Record<string, number | null>) => api<PlanDTO>('/v1/assumptions', { method: 'PUT', body }),
    onSuccess: () => void invalidate(),
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, monthlyLimit }: { categoryId: CategoryId; monthlyLimit: number | null }) =>
      monthlyLimit == null
        ? api<BudgetsResponse>(`/v1/budgets/${categoryId}`, { method: 'DELETE' })
        : api<BudgetsResponse>(`/v1/budgets/${categoryId}`, { method: 'PUT', body: { monthlyLimit } }),
    onSuccess: (data) => qc.setQueryData(keys.budgets, data),
  });
}

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api<SIAskResponse>('/v1/si/ask', { method: 'POST', body: { text } }),
    onSuccess: (r) => {
      qc.setQueryData<SIHomeDTO>(keys.si, (old) => (old ? { ...old, messages: [...old.messages, r.question, r.answer] } : old));
    },
  });
}

export function useSync() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: () => api<JobDTO>('/v1/sync', { method: 'POST' }), onSettled: () => void invalidate() });
}

export const onboardingApi = {
  startDiscovery: () => api<{ job: JobDTO }>('/v1/aa/discovery', { method: 'POST' }),
  discovery: () => api<DiscoveryResponse>('/v1/aa/discovery'),
  preview: (accountIds: string[]) => api<ConsentPreviewDTO>('/v1/aa/consent-preview', { method: 'POST', body: { accountIds } }),
  createConsent: (accountIds: string[]) => api<ConsentDTO>('/v1/aa/consents', { method: 'POST', body: { accountIds } }),
  consent: (id: string) => api<ConsentDTO>(`/v1/aa/consents/${id}`),
  consents: () => api<{ consents: ConsentDTO[] }>('/v1/aa/consents'),
  revoke: (id: string) => api<ConsentDTO>(`/v1/aa/consents/${id}/revoke`, { method: 'POST' }),
  sandbox: (providerId: string) =>
    api<{ consentId: string; status: string; purpose: string; accounts: { fip: ConsentDTO['accounts'][number]['fip']; maskedNumber: string; type: string }[]; dataFrom: string; expiresAt: string }>(
      `/v1/sandbox/consents/${providerId}`,
    ),
  sandboxDecide: (providerId: string, action: 'approve' | 'reject') => api<ConsentDTO>(`/v1/sandbox/consents/${providerId}/${action}`, { method: 'POST' }),
  latestSync: () => api<{ job: JobDTO | null }>('/v1/sync/latest'),
  startSync: () => api<JobDTO>('/v1/sync', { method: 'POST' }),
  me: () => api<MeDTO>('/v1/me'),
};
