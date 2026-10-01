/**
 * API contract shared by the server and the app. Amounts are integer paise; timestamps ISO UTC.
 */
import type { AssumptionInfo, CashForecast, NetWorthProjection } from './forecast';
import type { GoalProjection } from './goals';
import type { Brief, Insight } from './insights';
import type { Paise } from './money';
import type { Receivable } from './pairing';
import type { UpcomingPayment } from './recurring';
import type { AccountType, CategoryId, ClassificationSource, Direction, PaymentMode, SplitPart, TxnType } from './types';
import type { AssetLine, NetWorthChange } from './wealth';
import type { BudgetStatus } from './budgets';
import type { Intent } from './si/intents';

export type ThemePreference = 'system' | 'light' | 'dark';

export type OnboardingState =
  | 'PHONE_VERIFIED'
  | 'DISCOVERING'
  | 'ACCOUNTS_FOUND'
  | 'CONSENT_PENDING'
  | 'CONSENT_REJECTED'
  | 'SYNCING'
  | 'SYNC_FAILED'
  | 'READY';

export interface ApiError {
  error: { code: string; message: string; retryAfterSeconds?: number };
}

// ── Auth ──────────────────────────────────────────────────────────────
export interface OtpRequestBody {
  phone: string;
}
export interface OtpRequestResponse {
  challengeId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAfter: string;
  /** Only present when the server runs the development SMS provider. */
  devHint?: string;
}
export interface OtpVerifyBody {
  challengeId: string;
  code: string;
  deviceName?: string;
  platform?: string;
}
export interface MeDTO {
  id: string;
  phoneMasked: string;
  name: string | null;
  onboardingState: OnboardingState;
  themePreference: ThemePreference;
  createdAt: string;
}
export interface SessionResponse {
  token: string;
  user: MeDTO;
}
export interface DeviceSessionDTO {
  id: string;
  deviceName: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

// ── Jobs (discovery, sync) ───────────────────────────────────────────
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
export interface JobStep {
  key: string;
  label: string;
  status: StepStatus;
}
export interface JobDTO {
  id: string;
  kind: 'DISCOVERY' | 'SYNC';
  status: JobStatus;
  steps: JobStep[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Accounts & consent ───────────────────────────────────────────────
export interface FipDTO {
  id: string;
  name: string;
  shortName: string;
  /** Monogram + brand colour, shown when the app has no logo for this FIP. */
  monogram: string;
  color: string;
}
export interface DiscoveredAccountDTO {
  id: string;
  fip: FipDTO;
  type: AccountType;
  typeLabel: string;
  maskedNumber: string;
  displayName: string;
  group: 'BANK' | 'INVESTMENT';
  linked: boolean;
}
export interface DiscoveryResponse {
  /** Null until discovery has been started. */
  job: JobDTO | null;
  accounts: DiscoveredAccountDTO[];
}

export type ConsentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED' | 'EXPIRED' | 'PAUSED' | 'FAILED';
export interface ConsentDTO {
  id: string;
  provider: string;
  status: ConsentStatus;
  purpose: string;
  purposeCode: string;
  dataShared: string[];
  fiTypes: string[];
  dataFrom: string;
  dataTo: string;
  expiresAt: string;
  fetchType: 'ONETIME' | 'PERIODIC';
  frequency: string;
  accounts: { id: string; fip: FipDTO; maskedNumber: string; displayName: string }[];
  /** Where the user approves this consent (the AA partner's hosted page, or the sandbox sheet). */
  approvalUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ConsentPreviewDTO {
  title: string;
  fips: FipDTO[];
  dataShared: string[];
  purpose: string;
  dataRangeLabel: string;
  durationLabel: string;
  frequencyLabel: string;
  provider: string;
}

export interface AccountDTO {
  id: string;
  fip: FipDTO;
  type: AccountType;
  typeLabel: string;
  maskedNumber: string;
  displayName: string;
  balance: Paise;
  balanceAsOf: string | null;
  lastSyncedAt: string | null;
  syncStatus: 'OK' | 'PARTIAL' | 'FAILED' | 'PENDING';
  consentId: string | null;
  consentStatus: ConsentStatus | null;
  reconciliation: { status: 'RECONCILED' | 'MISMATCH' | 'UNVERIFIED'; difference: Paise } | null;
}
export interface AccountsResponse {
  accounts: AccountDTO[];
  totalCash: Paise;
  consents: ConsentDTO[];
}

// ── Home ─────────────────────────────────────────────────────────────
export type SyncHealth = 'OK' | 'PARTIAL' | 'SYNCING' | 'FAILED' | 'NO_DATA';
export interface HomeDTO {
  greeting: string;
  name: string | null;
  balance: { total: Paise; accountCount: number; asOf: string | null; accounts: HomeAccount[] };
  month: { key: string; label: string; income: Paise; spent: Paise; invested: Paise; savingsRatePct: number | null };
  insight: Insight | null;
  upcoming: { count: number; total: Paise; days: number; items: UpcomingPayment[] };
  wealth: {
    netWorth: Paise;
    assets: Paise;
    liabilities: Paise;
    /** What net worth is made of, largest first. */
    parts: { kind: string; label: string; value: Paise }[];
    change: Paise;
    changePct: number | null;
    sinceDate: string;
  } | null;
  /** Spending today plus the latest few purchases (any day), newest first. */
  today: { spent: Paise; count: number; recent: TxnDTO[] };
  /** Investments at a glance: current value and returns so far. */
  investments: {
    value: Paise;
    invested: Paise;
    gain: Paise;
    gainPct: number | null;
    lines: { kind: string; label: string; value: Paise; gain: Paise | null; gainPct: number | null }[];
  } | null;
  sync: { health: SyncHealth; lastSyncedAt: string | null; message: string | null };
  unreadNotifications: number;
}
/** A connected bank account as shown on the Home balance cards. */
export interface HomeAccount {
  id: string;
  fip: FipDTO;
  typeLabel: string;
  maskedNumber: string;
  balance: Paise;
  balanceAsOf: string | null;
  lastSyncedAt: string | null;
}

// ── Activity ─────────────────────────────────────────────────────────
export type ActivityFilter = 'all' | 'expenses' | 'income' | 'investments' | 'loans' | 'transfers';
export interface TxnDTO {
  id: string;
  accountId: string;
  accountName: string;
  accountMask: string;
  fip: FipDTO;
  postedAt: string;
  amount: Paise;
  direction: Direction;
  mode: PaymentMode;
  merchantName: string;
  merchantKey: string;
  counterparty: string | null;
  categoryId: CategoryId;
  categoryName: string;
  emoji: string;
  type: TxnType;
  typeLabel: string;
  confidence: number;
  typeSource: ClassificationSource;
  categorySource: ClassificationSource;
  isRecurring: boolean;
  note: string | null;
  splits: SplitPart[] | null;
  /** Raw bank description — secondary information (Blueprint §9). */
  narration: string;
  reference: string | null;
}
export interface TxnListResponse {
  items: TxnDTO[];
  nextCursor: string | null;
  total: number;
}
export interface TxnPatchBody {
  categoryId?: CategoryId;
  type?: TxnType;
  note?: string | null;
  isRecurring?: boolean;
  /** Remember this choice for future transactions from the same merchant. */
  applyToMerchant?: boolean;
}
export interface TxnSplitBody {
  /** Empty array removes the split. */
  parts: SplitPart[];
}

// ── Wealth ───────────────────────────────────────────────────────────
export interface HoldingDTO {
  id: string;
  kind: 'MUTUAL_FUND' | 'TERM_DEPOSIT' | 'EPF' | 'SAVINGS' | 'RECEIVABLE';
  name: string;
  subtitle: string;
  value: Paise;
  invested: Paise | null;
  gain: Paise | null;
  gainPct: number | null;
  group: 'INVESTMENTS' | 'BANK' | 'OTHER';
}
export interface WealthDTO {
  netWorth: Paise;
  assets: Paise;
  liabilities: Paise;
  change: NetWorthChange;
  trend: { date: string; value: Paise }[];
  lines: AssetLine[];
  allocation: { kind: string; label: string; value: Paise; pct: number }[];
  holdings: HoldingDTO[];
  receivables: Receivable[];
  partial: boolean;
}

// ── Plan ─────────────────────────────────────────────────────────────
export interface GoalDTO {
  id: string;
  name: string;
  emoji: string;
  targetAmount: Paise;
  targetDate: string;
  currentAmount: Paise;
  monthlyContribution: Paise;
  createdAt: string;
  projection: GoalProjection;
}
export interface GoalBody {
  name: string;
  emoji?: string;
  targetAmount: Paise;
  targetDate: string;
  currentAmount: Paise;
  monthlyContribution: Paise;
}
export interface PlanDTO {
  goals: GoalDTO[];
  projection: NetWorthProjection;
  assumptions: AssumptionInfo[];
}
export interface ForecastDTO {
  nextSalaryDate: string | null;
  endOfMonth: CashForecast;
  untilNextSalary: CashForecast | null;
  assumptions: AssumptionInfo[];
  safetyBuffer: Paise;
}
export interface BudgetDTO extends BudgetStatus {
  categoryName: string;
  emoji: string;
}
export interface BudgetsResponse {
  monthKey: string;
  budgets: BudgetDTO[];
  /** Spend categories without a budget, with this month's spend — to suggest budgets. */
  unbudgeted: { categoryId: CategoryId; categoryName: string; emoji: string; spent: Paise }[];
}

// ── SI ───────────────────────────────────────────────────────────────
export interface SIMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  bullets: string[];
  followUps: string[];
  intent: Intent | null;
  insufficient: boolean;
  /** 'rules' = deterministic templates; 'llm' = Claude phrasing checked against engine facts. */
  engine: 'rules' | 'llm' | null;
  createdAt: string;
}
export interface SIHomeDTO {
  conversationId: string;
  brief: Brief;
  suggestions: string[];
  messages: SIMessageDTO[];
}
/** A past SI chat in the history list. */
export interface SIConversationDTO {
  id: string;
  /** The first question asked in the chat. */
  title: string;
  /** When the chat was last active. */
  lastAt: string;
  messageCount: number;
}
export interface SIAskBody {
  text: string;
  conversationId?: string;
}
export interface SIAskResponse {
  conversationId: string;
  question: SIMessageDTO;
  answer: SIMessageDTO;
}

// ── Notifications ────────────────────────────────────────────────────
export interface NotificationDTO {
  id: string;
  kind: 'UPCOMING_PAYMENT' | 'SYNC' | 'INSIGHT' | 'CONSENT' | 'SECURITY';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  link: string | null;
}
