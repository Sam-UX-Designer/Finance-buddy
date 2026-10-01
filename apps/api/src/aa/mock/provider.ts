import type { ConsentStatus } from '@moneymate/core';
import { newId } from '../../lib/crypto';
import type {
  AANotification,
  AAProvider,
  CreateConsentInput,
  DataSessionResult,
  FIPayload,
  MarketDataProvider,
  ProviderAccount,
} from '../provider';
import { depositStatements, epfStatement, fixedDepositStatement, mutualFundStatement, navAt, personaAccounts } from './dataset';

interface MockConsent {
  input: CreateConsentInput;
  status: ConsentStatus;
}

interface MockSession {
  providerConsentId: string;
  from: string;
  to: string;
  readyAt: number;
}

export interface MockAAOptions {
  latencyMs: number;
  failFips: string[];
  now?: () => Date;
}

/**
 * Sandbox stand-in for an AA partner. Behaves like the real lifecycle:
 * consent PENDING → user approves/rejects on the "AA page" → notification → data session → FI data.
 * Approval happens through `approve`/`reject`, which the sandbox approval screen calls.
 */
export class MockAAProvider implements AAProvider, MarketDataProvider {
  readonly name = 'mock';
  private consents = new Map<string, MockConsent>();
  private sessions = new Map<string, MockSession>();
  private handlers: ((n: AANotification) => Promise<void>)[] = [];

  constructor(private opts: MockAAOptions) {}

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  async discover({ phone }: { phone: string }): Promise<ProviderAccount[]> {
    await sleep(Math.min(this.opts.latencyMs, 1200));
    return personaAccounts(phone).map(({ providerRef, fipId, type, maskedNumber }) => ({ providerRef, fipId, type, maskedNumber }));
  }

  async createConsent(input: CreateConsentInput): Promise<{ providerConsentId: string; approvalUrl: string }> {
    const providerConsentId = newId('mockconsent');
    this.consents.set(providerConsentId, { input, status: 'PENDING' });
    return { providerConsentId, approvalUrl: `sandbox:${providerConsentId}` };
  }

  /** Details shown on the sandbox approval screen. */
  describeConsent(providerConsentId: string): CreateConsentInput & { status: ConsentStatus } {
    const c = this.consents.get(providerConsentId);
    if (!c) throw new Error('Unknown consent');
    return { ...c.input, status: c.status };
  }

  hasConsent(providerConsentId: string): boolean {
    return this.consents.has(providerConsentId);
  }

  /** Restores consent state after a server restart (the real AA keeps this state on its side). */
  restoreConsent(providerConsentId: string, input: CreateConsentInput, status: ConsentStatus): void {
    if (!this.consents.has(providerConsentId)) this.consents.set(providerConsentId, { input, status });
  }

  async approve(providerConsentId: string): Promise<void> {
    await this.transition(providerConsentId, 'ACTIVE');
  }

  async reject(providerConsentId: string): Promise<void> {
    await this.transition(providerConsentId, 'REJECTED');
  }

  private async transition(providerConsentId: string, status: ConsentStatus): Promise<void> {
    const c = this.consents.get(providerConsentId);
    if (!c) throw new Error('Unknown consent');
    if (c.status !== 'PENDING') throw new Error(`Consent is already ${c.status}`);
    c.status = status;
    await this.emit({ type: 'CONSENT_STATUS', providerConsentId, status });
  }

  async getConsentStatus(providerConsentId: string): Promise<ConsentStatus> {
    return this.consents.get(providerConsentId)?.status ?? 'FAILED';
  }

  async revokeConsent(providerConsentId: string): Promise<void> {
    const c = this.consents.get(providerConsentId);
    if (c) c.status = 'REVOKED';
  }

  async createDataSession({ providerConsentId, from, to }: { providerConsentId: string; from: string; to: string }): Promise<{ providerSessionId: string }> {
    const c = this.consents.get(providerConsentId);
    if (!c || c.status !== 'ACTIVE') throw new Error('Consent is not active');
    const providerSessionId = newId('mocksession');
    this.sessions.set(providerSessionId, { providerConsentId, from, to, readyAt: Date.now() + this.opts.latencyMs });
    return { providerSessionId };
  }

  async fetchData(providerSessionId: string): Promise<DataSessionResult> {
    const s = this.sessions.get(providerSessionId);
    if (!s) return { status: 'EXPIRED', accounts: [], failures: [] };
    if (Date.now() < s.readyAt) return { status: 'PENDING', accounts: [], failures: [] };
    const consent = this.consents.get(s.providerConsentId)!;
    if (consent.status !== 'ACTIVE') return { status: 'FAILED', accounts: [], failures: [] };
    const phone = consent.input.phone;
    const untilISO = minISO(s.to, this.now().toISOString());
    const persona = personaAccounts(phone);
    const accounts: FIPayload[] = [];
    const failures: DataSessionResult['failures'] = [];
    let deposits: ReturnType<typeof depositStatements> | null = null;
    for (const requested of consent.input.accounts) {
      const p = persona.find((x) => x.providerRef === requested.providerRef);
      if (!p) {
        failures.push({ providerRef: requested.providerRef, reason: 'Account not found at FIP' });
        continue;
      }
      if (this.opts.failFips.includes(p.fipId)) {
        failures.push({ providerRef: p.providerRef, reason: 'FIP did not respond in time' });
        continue;
      }
      if (p.type === 'SAVINGS' || p.type === 'CURRENT') {
        deposits ??= depositStatements(phone, untilISO);
        const stmt = deposits.get(p.fipId as 'hdfc')!;
        accounts.push({
          ...stmt,
          transactions: stmt.transactions.filter((t) => Date.parse(t.transactionTimestamp) >= Date.parse(s.from) && Date.parse(t.transactionTimestamp) <= Date.parse(untilISO)),
        });
      } else if (p.type === 'MUTUAL_FUNDS') accounts.push(mutualFundStatement(phone, untilISO));
      else if (p.type === 'TERM_DEPOSIT') accounts.push(fixedDepositStatement(phone, untilISO));
      else if (p.type === 'EPF') accounts.push(epfStatement(phone, untilISO));
    }
    const status: DataSessionResult['status'] = failures.length === 0 ? 'COMPLETED' : accounts.length > 0 ? 'PARTIAL' : 'FAILED';
    return { status, accounts, failures };
  }

  onNotification(handler: (n: AANotification) => Promise<void>): void {
    this.handlers.push(handler);
  }

  private async emit(n: AANotification): Promise<void> {
    for (const h of this.handlers) await h(n);
  }

  async navHistory(schemeCode: string, fromISO: string, toISO: string): Promise<{ date: string; nav: number }[]> {
    // Month-end NAVs plus the latest — enough for monthly net worth history.
    const out: { date: string; nav: number }[] = [];
    let d = new Date(fromISO);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    while (d.getTime() <= Date.parse(toISO)) {
      const nav = navAt(schemeCode, d.toISOString());
      if (nav != null) out.push({ date: d.toISOString(), nav });
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0, 12));
    }
    const latest = navAt(schemeCode, toISO);
    if (latest != null) out.push({ date: toISO, nav: latest });
    return out;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function minISO(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}
