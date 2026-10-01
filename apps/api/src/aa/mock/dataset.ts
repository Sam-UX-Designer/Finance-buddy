import { addDaysISO, daysInMonth, istParts, istToISO, monthName, type AccountType, type PaymentMode } from '@moneymate/core';
import type { DepositPayload, EPFPayload, MutualFundPayload, TermDepositPayload } from '../provider';
import { between, hashSeed, intBetween, pick, rngFor } from './prng';

/**
 * Sandbox persona for the mock AA provider: a salaried professional in Bengaluru.
 * Everything is generated deterministically from the phone number and calendar dates, so history
 * never changes between fetches and new transactions appear as real time passes.
 * This is test data only — it is never shown as real financial information outside the sandbox.
 */
export const HOLDER_NAME = 'SAM KUMAR';
const ANCHOR = { year: 2025, month: 1 };

export interface PersonaAccount {
  providerRef: string;
  fipId: string;
  type: AccountType;
  maskedNumber: string;
}

export function personaAccounts(phone: string): PersonaAccount[] {
  const tag = hashSeed(phone).toString(36);
  const acc = (fipId: string, type: AccountType, last4: string, prefix = 'XXXXXXXX'): PersonaAccount => ({
    providerRef: `mock-${fipId}-${type.toLowerCase()}-${tag}`,
    fipId,
    type,
    maskedNumber: `${prefix}${last4}`,
  });
  return [
    acc('hdfc', 'SAVINGS', '4821'),
    acc('icici', 'SAVINGS', '1942'),
    acc('axis', 'SAVINGS', '7721'),
    acc('sbi', 'SAVINGS', '6689'),
    acc('hdfc', 'TERM_DEPOSIT', '3307'),
    acc('cams', 'MUTUAL_FUNDS', '5560', 'FOLIO-XXXX'),
    acc('epfo', 'EPF', '5521', 'UAN-XXXXXXXX'),
  ];
}

type Bank = 'hdfc' | 'icici' | 'axis' | 'sbi';
const OPENING: Record<Bank, number> = { hdfc: 4500000, icici: 1200000, axis: 845000, sbi: 1523000 };
const LAST4: Record<Bank, string> = { hdfc: '4821', icici: '1942', axis: '7721', sbi: '6689' };

interface Event {
  bank: Bank;
  at: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number; // paise
  mode: PaymentMode;
  narration: string;
}

/** Seasonal multiplier for eating out (festive months are higher). */
const FOOD_SEASON = [1.0, 0.9, 1.0, 1.0, 1.05, 0.95, 1.0, 1.0, 1.35, 1.3, 1.15, 1.25];

const SCHEMES = {
  PPFAS: { code: 'MOCK-PPFAS-FLEXI', name: 'Parag Parikh Flexi Cap Fund – Direct Growth', baseNav: 62.4, sip: 500000, sipDay: 5, remark: 'PPFAS FLEXI CAP SIP' },
  UTINIFTY: { code: 'MOCK-UTI-NIFTY50', name: 'UTI Nifty 50 Index Fund – Direct Growth', baseNav: 142.1, sip: 300000, sipDay: 10, remark: 'UTI NIFTY 50 INDEX SIP' },
  AXISELSS: { code: 'MOCK-AXIS-ELSS', name: 'Axis ELSS Tax Saver Fund – Direct Growth', baseNav: 86.7, sip: 0, sipDay: 0, remark: '' },
} as const;

// ── NAV history (mock market data) ─────────────────────────────────────
const NAV_START = Date.UTC(2023, 0, 1);
const navCache = new Map<string, number[]>();

function navSeries(code: string, baseNav: number, days: number): number[] {
  const cached = navCache.get(code);
  if (cached && cached.length >= days) return cached;
  const r = rngFor('nav', code);
  const series: number[] = [baseNav];
  const drift = 0.12 / 365;
  const vol = 0.15 / Math.sqrt(365);
  for (let i = 1; i < days; i++) {
    // Approximate normal from 4 uniforms.
    const z = (r() + r() + r() + r() - 2) * Math.sqrt(3);
    series.push(series[i - 1]! * Math.exp(drift - (vol * vol) / 2 + vol * z));
  }
  navCache.set(code, series);
  return series;
}

export function navAt(code: string, dateISO: string): number | null {
  const scheme = Object.values(SCHEMES).find((s) => s.code === code);
  if (!scheme) return null;
  const day = Math.floor((Date.parse(dateISO) - NAV_START) / 86400000);
  if (day < 0) return null;
  const series = navSeries(code, scheme.baseNav, day + 400);
  return Math.round(series[day]! * 10000) / 10000;
}

// ── Helpers ─────────────────────────────────────────────────────────────
const rrn = (r: () => number) => String(Math.floor(between(r, 1e11, 1e12 - 1)));
const rupees = (r: () => number, min: number, max: number) => Math.round(between(r, min, max)) * 100;

function monthsFromAnchor(untilISO: string): { year: number; month: number; idx: number }[] {
  const end = istParts(untilISO);
  const out: { year: number; month: number; idx: number }[] = [];
  let y = ANCHOR.year;
  let m = ANCHOR.month;
  let idx = 0;
  while (y < end.year || (y === end.year && m <= end.month)) {
    out.push({ year: y, month: m, idx });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    idx += 1;
  }
  return out;
}

function salaryFor(year: number, month: number): number {
  if (year < 2025 || (year === 2025 && month < 4)) return 5800000;
  if (year < 2026 || (year === 2026 && month < 4)) return 6200000;
  return 6650000;
}

const FRIENDS = [
  { name: 'KARTHIK S', vpa: '98450XXXXX@ybl' },
  { name: 'PRIYA M', vpa: 'priya.m@okicici' },
  { name: 'VIKRAM R', vpa: 'vikram.r@okhdfcbank' },
  { name: 'ANANYA IYER', vpa: 'ananya.iyer@oksbi' },
];

interface Merchant {
  payee: string;
  vpa: string;
  min: number;
  max: number;
  hours: [number, number];
  remark?: string;
}

const FOOD: Merchant[] = [
  { payee: 'SWIGGY', vpa: 'swiggy@ybl', min: 180, max: 520, hours: [12, 22] },
  { payee: 'SWIGGY', vpa: 'swiggy@ybl', min: 180, max: 520, hours: [19, 22] },
  { payee: 'ZOMATO', vpa: 'zomato@hdfcbank', min: 220, max: 600, hours: [19, 22] },
  { payee: 'A2B ADYAR ANANDA BHAVAN', vpa: 'a2b.koramangala@icici', min: 250, max: 520, hours: [12, 21] },
  { payee: 'TATA STARBUCKS', vpa: 'starbucks@axisbank', min: 300, max: 450, hours: [9, 18] },
  { payee: 'CHAI POINT', vpa: 'chaipoint@ybl', min: 60, max: 140, hours: [10, 18] },
];
const GROCERY: Merchant[] = [
  { payee: 'BLINKIT', vpa: 'blinkit@hdfcbank', min: 250, max: 900, hours: [8, 21] },
  { payee: 'BLINKIT', vpa: 'blinkit@hdfcbank', min: 250, max: 900, hours: [8, 21] },
  { payee: 'ZEPTO', vpa: 'zepto@ybl', min: 200, max: 700, hours: [8, 21] },
  { payee: 'BIGBASKET', vpa: 'bigbasket@icici', min: 1200, max: 2200, hours: [9, 12] },
];
const TRANSPORT: Merchant[] = [
  { payee: 'UBER INDIA', vpa: 'uber@axisbank', min: 150, max: 480, hours: [8, 22] },
  { payee: 'RAPIDO', vpa: 'rapido@ybl', min: 50, max: 150, hours: [8, 20] },
  { payee: 'BMRCL METRO RAIL', vpa: 'bmrcl@sbi', min: 300, max: 500, hours: [8, 10] },
];
const SHOPPING: Merchant[] = [
  { payee: 'AMAZON', vpa: 'amazon@apl', min: 250, max: 2500, hours: [10, 23] },
  { payee: 'AMAZON', vpa: 'amazon@apl', min: 250, max: 1800, hours: [10, 23] },
  { payee: 'MYNTRA', vpa: 'myntra@icici', min: 700, max: 2200, hours: [11, 23] },
  { payee: 'FLIPKART', vpa: 'flipkart@axisbank', min: 300, max: 1800, hours: [11, 23] },
];

function generateEvents(phone: string, untilISO: string): Event[] {
  const events: Event[] = [];
  const add = (e: Event) => events.push(e);
  const months = monthsFromAnchor(untilISO);
  const self = HOLDER_NAME;

  for (const { year, month, idx } of months) {
    const r = rngFor(phone, 'month', year, month);
    const dim = daysInMonth(year, month);
    const day = (d: number) => Math.min(Math.max(1, d), dim);
    const at = (d: number, h: number, mi = intBetween(r, 0, 59)) => istToISO(year, month, day(d), h, mi);
    const mon = monthName(month).toUpperCase();

    // Salary on the 1st, 9 AM.
    add({ bank: 'hdfc', at: at(1, 9, 2), direction: 'CREDIT', amount: salaryFor(year, month), mode: 'NEFT', narration: `NEFT/CR/N${rrn(r)}/ACME TECHNOLOGIES PVT LTD/SALARY ${mon} ${year}` });
    // Own-account transfer HDFC → ICICI.
    const ref = rrn(r);
    add({ bank: 'hdfc', at: at(2, 10, 15), direction: 'DEBIT', amount: 500000, mode: 'IMPS', narration: `IMPS/DR/${ref}/${self}/TO SELF XXXXXXXX${LAST4.icici}` });
    add({ bank: 'icici', at: at(2, 10, 16), direction: 'CREDIT', amount: 500000, mode: 'IMPS', narration: `IMPS/CR/${ref}/${self}/FROM XXXXXXXX${LAST4.hdfc}` });
    // Family support.
    add({ bank: 'hdfc', at: at(2, 11), direction: 'DEBIT', amount: 700000, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/LAKSHMI R/lakshmi.r@oksbi/for home` });
    // Rent.
    add({ bank: 'hdfc', at: at(3, 9), direction: 'DEBIT', amount: 1700000, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/RAMESH KUMAR/ramesh.k@okaxis/Rent ${mon}` });
    // SIPs.
    for (const s of [SCHEMES.PPFAS, SCHEMES.UTINIFTY]) {
      add({ bank: 'hdfc', at: at(s.sipDay, 6, 30), direction: 'DEBIT', amount: s.sip, mode: 'ACH', narration: `ACH/DR/UMRN${hashSeed(s.code).toString().slice(0, 8)}/ICCL MF/${s.remark}` });
    }
    // Bills.
    add({ bank: 'hdfc', at: at(12, 20), direction: 'DEBIT', amount: rupees(r, 850, 1150), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/BESCOM/bescom.billdesk@hdfcbank/Electricity bill` });
    add({ bank: 'icici', at: at(7, 9), direction: 'DEBIT', amount: 79900, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/ACT FIBERNET/actfibernet@icici/Broadband ${mon}` });
    add({ bank: 'icici', at: at(14, 3), direction: 'DEBIT', amount: 19900, mode: 'CARD', narration: `POS/NETFLIX.COM/MUMBAI` });
    add({ bank: 'icici', at: at(20, 4), direction: 'DEBIT', amount: 11900, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/SPOTIFY/spotify@icici/Autopay` });
    add({ bank: 'icici', at: at(25, 5), direction: 'DEBIT', amount: 13000, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/GOOGLE ONE/googleone@axisbank/Autopay` });
    add({ bank: 'hdfc', at: at(18, 7), direction: 'DEBIT', amount: 149900, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/CULTFIT/cultfit@ybl/Membership` });

    // Everyday spending.
    const foodCount = Math.round(13 * FOOD_SEASON[month - 1]! + between(r, -1.5, 1.5));
    for (let i = 0; i < foodCount; i++) {
      const m = pick(r, FOOD);
      const amount = Math.round(rupees(r, m.min, m.max) * FOOD_SEASON[month - 1]!);
      add({ bank: r() < 0.8 ? 'hdfc' : 'icici', at: at(intBetween(r, 1, dim), intBetween(r, m.hours[0], m.hours[1])), direction: 'DEBIT', amount, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${m.payee}/${m.vpa}/Order` });
    }
    const groceryCount = intBetween(r, 5, 7);
    for (let i = 0; i < groceryCount; i++) {
      const m = pick(r, GROCERY);
      add({ bank: 'hdfc', at: at(intBetween(r, 1, dim), intBetween(r, m.hours[0], m.hours[1])), direction: 'DEBIT', amount: rupees(r, m.min, m.max), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${m.payee}/${m.vpa}/Groceries` });
    }
    if (idx % 2 === 0) add({ bank: 'hdfc', at: at(intBetween(r, 6, 14), 17), direction: 'DEBIT', amount: rupees(r, 1500, 3000), mode: 'CARD', narration: 'POS/AVENUE SUPERMARTS DMART/BENGALURU' });
    const rides = intBetween(r, 8, 11);
    for (let i = 0; i < rides; i++) {
      const m = pick(r, TRANSPORT);
      add({ bank: 'hdfc', at: at(intBetween(r, 1, dim), intBetween(r, m.hours[0], m.hours[1])), direction: 'DEBIT', amount: rupees(r, m.min, m.max), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${m.payee}/${m.vpa}/Ride` });
    }
    for (let i = 0; i < intBetween(r, 1, 2); i++) {
      add({ bank: 'hdfc', at: at(intBetween(r, 1, dim), intBetween(r, 8, 20)), direction: 'DEBIT', amount: rupees(r, 500, 1000), mode: 'CARD', narration: 'POS/HPCL HP PAY/BENGALURU' });
    }
    const shops = intBetween(r, 2, 3);
    const shopAmounts: number[] = [];
    for (let i = 0; i < shops; i++) {
      const m = pick(r, SHOPPING);
      const amount = rupees(r, m.min, m.max);
      shopAmounts.push(amount);
      add({ bank: r() < 0.6 ? 'icici' : 'hdfc', at: at(intBetween(r, 1, dim - 4), intBetween(r, m.hours[0], m.hours[1])), direction: 'DEBIT', amount, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${m.payee}/${m.vpa}/Order` });
    }
    if (r() < 0.6) add({ bank: 'icici', at: at(intBetween(r, 5, dim), 19), direction: 'DEBIT', amount: rupees(r, 300, 900), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/BOOKMYSHOW/bookmyshow@icici/Tickets` });
    if (r() < 0.5) add({ bank: 'hdfc', at: at(intBetween(r, 1, dim), 18), direction: 'DEBIT', amount: rupees(r, 150, 800), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/APOLLO PHARMACY/apollopharmacy@hdfcbank/Medicines` });
    add({ bank: 'hdfc', at: at(intBetween(r, 8, 22), 19), direction: 'DEBIT', amount: 200000, mode: 'ATM', narration: `ATM/WDL/HDFC ATM KORAMANGALA/${intBetween(r, 100000, 999999)}` });
    if (r() < 0.5) add({ bank: 'icici', at: at(intBetween(r, 1, dim), 14), direction: 'CREDIT', amount: rupees(r, 20, 150), mode: 'UPI', narration: `UPI/CR/${rrn(r)}/AMAZON PAY/amazonpay@apl/Cashback` });

    // Refund for one of the month's purchases (every third month).
    if (idx % 3 === 0 && shopAmounts.length) {
      add({ bank: 'icici', at: at(Math.min(dim, 26), 13), direction: 'CREDIT', amount: shopAmounts[0]!, mode: 'UPI', narration: `UPI/CR/${rrn(r)}/AMAZON/amazon@apl/Refund for order` });
    }

    // Money lent to friends: repaid in parts over the next months; one stays partly open.
    if (idx % 5 === 2) {
      const friend = FRIENDS[Math.floor(idx / 5) % FRIENDS.length]!;
      const amount = intBetween(r, 3, 10) * 100000;
      add({ bank: 'hdfc', at: at(12, 20), direction: 'DEBIT', amount, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${friend.name}/${friend.vpa}/loan` });
      const firstBack = Math.round(amount * 0.4 / 100000) * 100000;
      const r2 = rngFor(phone, 'repay', idx);
      add({ bank: 'hdfc', at: istToISO(year, month + 1, intBetween(r2, 10, 25), 21), direction: 'CREDIT', amount: firstBack, mode: 'UPI', narration: `UPI/CR/${rrn(r2)}/${friend.name}/${friend.vpa}/repaying` });
      if (idx % 10 !== 7) {
        add({ bank: 'hdfc', at: istToISO(year, month + 2, intBetween(r2, 10, 25), 21), direction: 'CREDIT', amount: amount - firstBack, mode: 'UPI', narration: `UPI/CR/${rrn(r2)}/${friend.name}/${friend.vpa}/repay balance` });
      }
    }
    // Shared dinner paid by the user and returned in full a week later (inferred loan).
    if (idx % 4 === 1) {
      const friend = FRIENDS[(idx + 2) % FRIENDS.length]!;
      const amount = rupees(r, 1200, 3000);
      add({ bank: 'hdfc', at: at(15, 22), direction: 'DEBIT', amount, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/${friend.name}/${friend.vpa}/dinner` });
      add({ bank: 'hdfc', at: at(22, 20), direction: 'CREDIT', amount, mode: 'UPI', narration: `UPI/CR/${rrn(r)}/${friend.name}/${friend.vpa}/thanks` });
    }

    // Occasional larger spends.
    if (month === 3) add({ bank: 'hdfc', at: at(20, 11), direction: 'DEBIT', amount: 1850000, mode: 'ACH', narration: `ACH/DR/UMRN99${year}/HDFC LIFE INSURANCE/PREMIUM ${year}` });
    if (month === 10) add({ bank: 'icici', at: at(18, 21), direction: 'DEBIT', amount: rupees(r, 5500, 7500), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/MYNTRA/myntra@icici/Festive order` });
    if (year === 2025 && month === 11) add({ bank: 'hdfc', at: at(9, 18), direction: 'DEBIT', amount: 2499000, mode: 'CARD', narration: 'POS/CROMA INFINITI RETAIL/BENGALURU' });
    if (month === 5) {
      add({ bank: 'hdfc', at: at(6, 22), direction: 'DEBIT', amount: rupees(r, 13000, 16000), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/MAKEMYTRIP/makemytrip@icici/Holiday booking` });
      add({ bank: 'hdfc', at: at(7, 22), direction: 'DEBIT', amount: rupees(r, 8000, 9500), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/INDIGO/indigo@hdfcbank/Flight` });
    }

    // Quarterly savings interest (on quarter-end).
    if (month % 3 === 0) {
      for (const bank of ['hdfc', 'icici', 'axis', 'sbi'] as Bank[]) {
        add({ bank, at: istToISO(year, month, dim, 23, 50), direction: 'CREDIT', amount: -1, mode: 'INTEREST', narration: `INT.PD/01-${String(month - 2).padStart(2, '0')}-${year} TO ${dim}-${String(month).padStart(2, '0')}-${year}` });
      }
    }
    // Axis: occasional use.
    if (idx % 2 === 1) add({ bank: 'axis', at: at(intBetween(r, 5, 25), 13), direction: 'DEBIT', amount: rupees(r, 200, 600), mode: 'UPI', narration: `UPI/DR/${rrn(r)}/SWIGGY/swiggy@ybl/Order` });
  }

  // Jio prepaid recharge every 28 days.
  for (let d = istToISO(2025, 1, 4, 8, 30); Date.parse(d) <= Date.parse(untilISO); d = addDaysISO(d, 28)) {
    const r = rngFor(phone, 'jio', d);
    add({ bank: 'icici', at: d, direction: 'DEBIT', amount: 34900, mode: 'UPI', narration: `UPI/DR/${rrn(r)}/JIO/jio@sbi/Recharge` });
  }
  return events.filter((e) => Date.parse(e.at) <= Date.parse(untilISO));
}

/** Deposit statements for each savings account, from the anchor date to `untilISO`. */
export function depositStatements(phone: string, untilISO: string): Map<Bank, DepositPayload> {
  const accounts = personaAccounts(phone);
  const events = generateEvents(phone, untilISO).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.bank.localeCompare(b.bank));
  const balances = new Map<Bank, number>(Object.entries(OPENING) as [Bank, number][]);
  const out = new Map<Bank, DepositPayload>();
  for (const bank of Object.keys(OPENING) as Bank[]) {
    const acc = accounts.find((a) => a.fipId === bank && a.type === 'SAVINGS')!;
    out.set(bank, {
      kind: 'DEPOSIT',
      providerRef: acc.providerRef,
      holderName: HOLDER_NAME,
      accountType: 'SAVINGS',
      currentBalance: '0',
      balanceDateTime: untilISO,
      transactions: [],
    });
  }
  const counters = new Map<string, number>();
  for (const e of events) {
    let amount = e.amount;
    const bal = balances.get(e.bank)!;
    if (amount === -1) amount = Math.max(100, Math.round((bal * 0.027) / 4)); // ~2.7% p.a. savings interest
    if (e.direction === 'DEBIT' && bal - amount < 0) continue; // insufficient balance: payment would have failed
    const next = bal + (e.direction === 'CREDIT' ? amount : -amount);
    balances.set(e.bank, next);
    const dayKey = e.at.slice(0, 10).replace(/-/g, '');
    const n = (counters.get(`${e.bank}${dayKey}`) ?? 0) + 1;
    counters.set(`${e.bank}${dayKey}`, n);
    const stmt = out.get(e.bank)!;
    stmt.transactions.push({
      txnId: `${LAST4[e.bank]}${dayKey}${String(n).padStart(3, '0')}${hashSeed(e.narration + e.at).toString(36).slice(0, 4)}`,
      type: e.direction,
      mode: e.mode,
      amount: (amount / 100).toFixed(2),
      currentBalance: (next / 100).toFixed(2),
      transactionTimestamp: e.at,
      narration: e.narration,
      reference: e.narration.split('/')[2] ?? '',
    });
  }
  for (const [bank, stmt] of out) stmt.currentBalance = (balances.get(bank)! / 100).toFixed(2);
  return out;
}

/** Mutual fund folio with SIP purchases mirrored from the bank's ACH debits. */
export function mutualFundStatement(phone: string, untilISO: string): MutualFundPayload {
  const acc = personaAccounts(phone).find((a) => a.type === 'MUTUAL_FUNDS')!;
  const txns: MutualFundPayload['transactions'] = [];
  const buy = (code: string, dateISO: string, amount: number) => {
    const nav = navAt(code, dateISO)!;
    txns.push({ schemeCode: code, date: dateISO, units: (amount / 100 / nav).toFixed(4), nav: nav.toFixed(4), amount: (amount / 100).toFixed(2) });
  };
  // Holdings bought before the sandbox history starts.
  buy(SCHEMES.PPFAS.code, istToISO(2024, 3, 15, 10), 6000000);
  buy(SCHEMES.UTINIFTY.code, istToISO(2024, 6, 10, 10), 3000000);
  buy(SCHEMES.AXISELSS.code, istToISO(2024, 1, 20, 10), 5000000);
  // Bank debits for SIPs are only made when the balance allowed it; mirror the actual debits.
  const hdfc = depositStatements(phone, untilISO).get('hdfc')!;
  for (const t of hdfc.transactions) {
    if (t.type !== 'DEBIT' || !t.narration.startsWith('ACH/DR/') || !t.narration.includes('ICCL MF')) continue;
    const scheme = Object.values(SCHEMES).find((s) => s.remark && t.narration.endsWith(s.remark));
    if (scheme) buy(scheme.code, t.transactionTimestamp, Math.round(Number(t.amount) * 100));
  }
  const holdings = Object.values(SCHEMES).map((s) => {
    const own = txns.filter((t) => t.schemeCode === s.code);
    const units = own.reduce((sum, t) => sum + Number(t.units), 0);
    const nav = navAt(s.code, untilISO)!;
    return {
      schemeCode: s.code,
      schemeName: s.name,
      units: units.toFixed(4),
      nav: nav.toFixed(4),
      navDate: untilISO,
      investedAmount: own.reduce((sum, t) => sum + Number(t.amount), 0).toFixed(2),
    };
  });
  return { kind: 'MUTUAL_FUNDS', providerRef: acc.providerRef, holderName: HOLDER_NAME, holdings, transactions: txns };
}

export function fixedDepositStatement(phone: string, untilISO: string): TermDepositPayload {
  const acc = personaAccounts(phone).find((a) => a.type === 'TERM_DEPOSIT')!;
  const opened = istToISO(2024, 11, 20, 11);
  const maturity = istToISO(2027, 11, 20, 11);
  const principal = 75000;
  const rate = 7.1;
  const years = Math.max(0, (Math.min(Date.parse(untilISO), Date.parse(maturity)) - Date.parse(opened)) / (365 * 86400000));
  const value = principal * Math.pow(1 + rate / 100 / 4, 4 * years);
  return {
    kind: 'TERM_DEPOSIT',
    providerRef: acc.providerRef,
    holderName: HOLDER_NAME,
    principalAmount: principal.toFixed(2),
    currentValue: value.toFixed(2),
    interestRate: rate.toFixed(2),
    openingDate: opened,
    maturityDate: maturity,
    compoundingFrequency: 'QUARTERLY',
  };
}

export function epfStatement(phone: string, untilISO: string): EPFPayload {
  const acc = personaAccounts(phone).find((a) => a.type === 'EPF')!;
  const entries: EPFPayload['entries'] = [{ date: istToISO(2024, 12, 31, 12), amount: '58400.00', kind: 'CONTRIBUTION' }];
  let balance = 58400;
  for (const { year, month } of monthsFromAnchor(untilISO)) {
    const date = istToISO(year, month, 15, 12);
    if (Date.parse(date) > Date.parse(untilISO)) break;
    // Employee + employer share of basic pay.
    const contribution = Math.round((salaryFor(year, month) / 100) * 0.4 * 0.12 + (salaryFor(year, month) / 100) * 0.4 * 0.0367);
    entries.push({ date, amount: contribution.toFixed(2), kind: 'CONTRIBUTION' });
    balance += contribution;
    if (month === 3) {
      const interestDate = istToISO(year, 3, 31, 12);
      if (Date.parse(interestDate) <= Date.parse(untilISO)) {
        const interest = Math.round(balance * 0.0825 * 0.85);
        entries.push({ date: interestDate, amount: interest.toFixed(2), kind: 'INTEREST' });
        balance += interest;
      }
    }
  }
  return { kind: 'EPF', providerRef: acc.providerRef, holderName: HOLDER_NAME, balance: balance.toFixed(2), entries };
}
