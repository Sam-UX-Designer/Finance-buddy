import type { Paise } from './money';

/** Blueprint §9 — transaction types must be explicit. */
export const TXN_TYPES = [
  'EXPENSE',
  'INCOME',
  'INVESTMENT',
  'LOAN_GIVEN',
  'LOAN_REPAID',
  'TRANSFER',
  'REFUND',
  'ADJUSTMENT',
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export type Direction = 'DEBIT' | 'CREDIT';

export const PAYMENT_MODES = [
  'UPI', 'CARD', 'NEFT', 'IMPS', 'RTGS', 'ATM', 'ACH', 'CHEQUE', 'INTEREST', 'OTHERS',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const DEPOSIT_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT'] as const;
export type AccountType = 'SAVINGS' | 'CURRENT' | 'TERM_DEPOSIT' | 'MUTUAL_FUNDS' | 'EPF';

export function isDepositAccount(type: AccountType): boolean {
  return type === 'SAVINGS' || type === 'CURRENT';
}

export const CATEGORY_IDS = [
  'food', 'groceries', 'shopping', 'transport', 'fuel', 'bills', 'rent', 'subscriptions',
  'entertainment', 'health', 'family', 'people', 'travel', 'education', 'insurance', 'cash',
  'personal', 'fees', 'salary', 'interest', 'cashback', 'other_income', 'investments', 'loans',
  'transfers', 'refunds', 'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type ClassificationSource = 'RULE' | 'ENGINE' | 'USER';

/** A part of a split transaction. Parts always sum to the parent amount. */
export interface SplitPart {
  amount: Paise;
  type: TxnType;
  categoryId: CategoryId;
  counterparty?: string | null;
  label?: string | null;
}

/** Normalised transaction as the Finance Engine sees it. */
export interface Txn {
  id: string;
  accountId: string;
  postedAt: string;
  amount: Paise; // always positive
  direction: Direction;
  mode: PaymentMode;
  narration: string;
  reference?: string | null;
  merchantKey: string;
  merchantName: string;
  counterparty?: string | null;
  categoryId: CategoryId;
  type: TxnType;
  confidence: number;
  typeSource: ClassificationSource;
  categorySource: ClassificationSource;
  isRecurring: boolean;
  recurringSource?: ClassificationSource | null;
  balanceAfter?: Paise | null;
  note?: string | null;
  splits?: SplitPart[] | null;
}

export interface Account {
  id: string;
  fipId: string;
  fipName: string;
  type: AccountType;
  maskedNumber: string; // e.g. "XXXX4821" — never the full number
  displayName: string;
  currentBalance: Paise; // source of truth for reconciliation
  balanceAsOf: string;
  linked: boolean;
  lastSyncedAt?: string | null;
  syncStatus?: 'OK' | 'PARTIAL' | 'FAILED' | 'PENDING';
}

export interface MFHolding {
  accountId: string;
  schemeCode: string;
  schemeName: string;
  units: number;
  nav: number;
  navDate: string;
  investedAmount: Paise;
  currentValue: Paise;
  /** Purchase/redemption history: units +/- at a date, at a NAV. */
  transactions: { date: string; units: number; nav: number; amount: Paise }[];
}

export interface TermDeposit {
  accountId: string;
  principal: Paise;
  ratePct: number;
  openedAt: string;
  maturesAt: string;
  compoundingPerYear: number;
  currentValue: Paise;
}

export interface EPFAccount {
  accountId: string;
  balance: Paise;
  /** Passbook entries (contributions and interest credits). */
  entries: { date: string; amount: Paise; kind: 'CONTRIBUTION' | 'INTEREST' }[];
}

export interface Holdings {
  mutualFunds: MFHolding[];
  termDeposits: TermDeposit[];
  epf: EPFAccount[];
}

/** NAV history lookup for mutual funds: returns NAV on or before date. */
export type NavLookup = (schemeCode: string, dateISO: string) => number | null;

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: Paise;
  targetDate: string; // ISO date (IST midnight)
  currentAmount: Paise;
  monthlyContribution: Paise;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: CategoryId;
  monthlyLimit: Paise;
}

/** User-editable forecast assumptions (Blueprint §14). */
export interface ForecastAssumptions {
  monthlyIncome: Paise;
  monthlyVariableSpend: Paise;
  safetyBuffer: Paise;
  mfReturnPct: number;
  epfRatePct: number;
  savingsRatePct: number;
  goalReturnPct: number;
}

export interface UserProfile {
  id: string;
  name: string | null;
}

/** Everything the engine needs to answer questions. Built by the API from the data store. */
export interface FinancialState {
  now: string;
  user: UserProfile;
  accounts: Account[];
  txns: Txn[];
  holdings: Holdings;
  goals: Goal[];
  budgets: Budget[];
  assumptionOverrides: Partial<ForecastAssumptions>;
  navLookup?: NavLookup;
  /** True when some consented accounts failed to sync (partial picture). */
  partial: boolean;
}
