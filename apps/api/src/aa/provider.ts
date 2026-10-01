import type { AccountType, ConsentStatus, PaymentMode } from '@finance-buddy/core';

/**
 * Account Aggregator boundary (Blueprint §21). The app is the Financial Information User (FIU);
 * a licensed AA partner handles account linking and the user's consent approval.
 *
 * Implementations: `MockAAProvider` (sandbox persona, today) → partner sandbox/UAT adapter (next).
 * NOTE: with some partners, account discovery/linking happens inside the AA-hosted consent page.
 * `discover` is optional for that reason; re-verify the exact flow with the selected partner.
 */
export interface AAProvider {
  readonly name: string;
  discover?(input: { phone: string }): Promise<ProviderAccount[]>;
  createConsent(input: CreateConsentInput): Promise<{ providerConsentId: string; approvalUrl: string }>;
  getConsentStatus(providerConsentId: string): Promise<ConsentStatus>;
  revokeConsent(providerConsentId: string): Promise<void>;
  createDataSession(input: { providerConsentId: string; from: string; to: string }): Promise<{ providerSessionId: string }>;
  fetchData(providerSessionId: string): Promise<DataSessionResult>;
  /** Registers the handler for consent/data notifications (webhooks for real partners). */
  onNotification(handler: (n: AANotification) => Promise<void>): void;
}

export interface ProviderAccount {
  providerRef: string;
  fipId: string;
  type: AccountType;
  maskedNumber: string;
}

export interface CreateConsentInput {
  phone: string;
  accounts: ProviderAccount[];
  purposeCode: string;
  purposeText: string;
  fiTypes: string[];
  dataFrom: string;
  dataTo: string;
  expiresAt: string;
  fetchType: 'ONETIME' | 'PERIODIC';
  frequency: { unit: 'HOUR' | 'DAY' | 'MONTH'; value: number };
}

export type AANotification =
  | { type: 'CONSENT_STATUS'; providerConsentId: string; status: ConsentStatus }
  | { type: 'SESSION_STATUS'; providerSessionId: string; status: DataSessionResult['status'] };

/** FI data as received from the provider. Amounts are decimal rupee strings, as in AA payloads. */
export interface DepositPayload {
  kind: 'DEPOSIT';
  providerRef: string;
  holderName: string;
  accountType: 'SAVINGS' | 'CURRENT';
  currentBalance: string;
  balanceDateTime: string;
  transactions: {
    txnId: string;
    type: 'DEBIT' | 'CREDIT';
    mode: PaymentMode;
    amount: string;
    currentBalance: string;
    transactionTimestamp: string;
    narration: string;
    reference: string;
  }[];
}

export interface MutualFundPayload {
  kind: 'MUTUAL_FUNDS';
  providerRef: string;
  holderName: string;
  holdings: {
    schemeCode: string;
    schemeName: string;
    units: string;
    nav: string;
    navDate: string;
    investedAmount: string;
  }[];
  transactions: { schemeCode: string; date: string; units: string; nav: string; amount: string }[];
}

export interface TermDepositPayload {
  kind: 'TERM_DEPOSIT';
  providerRef: string;
  holderName: string;
  principalAmount: string;
  currentValue: string;
  interestRate: string;
  openingDate: string;
  maturityDate: string;
  compoundingFrequency: 'QUARTERLY' | 'MONTHLY' | 'YEARLY';
}

export interface EPFPayload {
  kind: 'EPF';
  providerRef: string;
  holderName: string;
  balance: string;
  entries: { date: string; amount: string; kind: 'CONTRIBUTION' | 'INTEREST' }[];
}

export type FIPayload = DepositPayload | MutualFundPayload | TermDepositPayload | EPFPayload;

export interface DataSessionResult {
  status: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  accounts: FIPayload[];
  failures: { providerRef: string; reason: string }[];
}

/** Market data boundary for fund NAV history (production: AMFI or a data vendor). */
export interface MarketDataProvider {
  navHistory(schemeCode: string, fromISO: string, toISO: string): Promise<{ date: string; nav: number }[]>;
}
