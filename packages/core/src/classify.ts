import { findMerchant, slug, titleCase } from './merchants';
import type { CategoryId, Direction, PaymentMode, TxnType } from './types';

/** Parsed pieces of a bank narration. */
export interface ParsedNarration {
  mode: PaymentMode;
  payeeName: string | null;
  vpa: string | null;
  remark: string | null;
}

/**
 * Parses common Indian bank narration formats:
 *   UPI/DR/412345678901/SWIGGY/swiggy@axisbank/Order
 *   NEFT/CR/N123456/ACME TECHNOLOGIES PVT LTD/SALARY SEP 2026
 *   ACH/DR/UMRN0001/ICCL MF/PPFAS FLEXI CAP SIP
 *   POS/AMAZON PAY INDIA/BANGALORE
 *   ATM/WDL/HDFC ATM KORAMANGALA/123456
 *   INT.PD/01-07-2026 TO 30-09-2026
 * Unknown formats fall back to mode OTHERS with the whole narration as the payee.
 */
export function parseNarration(narration: string, hintMode?: PaymentMode): ParsedNarration {
  const parts = narration.split('/').map((p) => p.trim());
  const head = (parts[0] ?? '').toUpperCase();
  if (head === 'UPI') {
    return { mode: 'UPI', payeeName: parts[3] || null, vpa: parts[4] || null, remark: parts[5] || null };
  }
  if (head === 'NEFT' || head === 'IMPS' || head === 'RTGS') {
    return { mode: head, payeeName: parts[3] || null, vpa: null, remark: parts.slice(4).join(' ') || null };
  }
  if (head === 'ACH' || head === 'NACH') {
    return { mode: 'ACH', payeeName: parts[3] || null, vpa: null, remark: parts.slice(4).join(' ') || null };
  }
  if (head === 'POS' || head === 'CARD') {
    return { mode: 'CARD', payeeName: parts[1] || null, vpa: null, remark: parts.slice(2).join(' ') || null };
  }
  if (head === 'ATM') {
    return { mode: 'ATM', payeeName: parts[2] || 'ATM', vpa: null, remark: null };
  }
  if (head.startsWith('INT.PD') || head.startsWith('INT PD') || head.startsWith('INTEREST')) {
    return { mode: 'INTEREST', payeeName: null, vpa: null, remark: parts.slice(1).join(' ') || null };
  }
  if (head === 'CHRG' || head === 'CHARGES') {
    return { mode: 'OTHERS', payeeName: 'Bank charges', vpa: null, remark: parts.slice(1).join(' ') || null };
  }
  return { mode: hintMode ?? 'OTHERS', payeeName: narration || null, vpa: null, remark: null };
}

export interface ClassificationInput {
  direction: Direction;
  narration: string;
  mode?: PaymentMode;
  amount: number;
}

export interface ClassificationContext {
  /** Lower-cased names the user is known by (from account profile) — for self-transfer detection. */
  ownNames?: string[];
  /** Last 4 digits of the user's connected accounts. */
  ownAccountLast4?: string[];
  /** Learned rules from the user's own corrections (Blueprint §9). */
  userRules?: UserRule[];
}

export interface UserRule {
  merchantKey: string;
  categoryId?: CategoryId | null;
  type?: TxnType | null;
}

export interface Classification {
  mode: PaymentMode;
  merchantKey: string;
  merchantName: string;
  counterparty: string | null;
  categoryId: CategoryId;
  type: TxnType;
  confidence: number;
  /** True when a user-learned rule was applied. */
  learned: boolean;
}

const BUSINESS_WORDS =
  /\b(PVT|LTD|LIMITED|LLP|INC|CORP|CORPORATION|STORE|STORES|MART|ENTERPRISES|TRADERS|SERVICES|SOLUTIONS|TECHNOLOGIES|RESTAURANT|HOTEL|CAFE|BAKERY|MEDICAL|PHARMA|AGENCY|CENTRE|CENTER|HOSPITAL|CLINIC|FOODS|RETAIL|INDIA)\b/;
const PERSONAL_VPA_HANDLES = /@(okaxis|okhdfcbank|okicici|oksbi|ybl|ibl|axl|paytm|upi|apl|yapl)$/i;

function looksLikePerson(payee: string | null, vpa: string | null): boolean {
  if (!payee) return false;
  const upper = payee.toUpperCase();
  if (BUSINESS_WORDS.test(upper)) return false;
  const words = upper.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (!words.every((w) => /^[A-Z.]+$/.test(w))) return false;
  if (vpa) {
    const local = vpa.split('@')[0] ?? '';
    if (/^\d{10}$/.test(local)) return true;
    return PERSONAL_VPA_HANDLES.test(vpa);
  }
  return words.length >= 2;
}

const has = (text: string | null, re: RegExp) => (text ? re.test(text.toUpperCase()) : false);

const RE_SALARY = /\b(SALARY|SAL|PAYROLL)\b/;
const RE_REFUND = /\b(REFUND|RFND|REVERSAL|REVERSED|REV)\b/;
const RE_CASHBACK = /\bCASHBACK\b/;
const RE_SELF = /\b(SELF|OWN A\/?C|OWN ACCOUNT|TO SELF)\b/;
const RE_LOAN_GIVEN = /\b(LOAN|LEND|LENT|BORROW|UDHAAR|UDHAR)\b/;
const RE_LOAN_REPAID = /\b(REPAY|REPAID|RETURNED|PAYBACK|PAY BACK|RETURNING)\b/;
const RE_RENT = /\bRENT\b/;
const RE_FAMILY = /\b(FAMILY|HOME|PARENTS|AMMA|APPA|MOM|DAD|MOTHER|FATHER)\b/;
const RE_FEES = /\b(CHRG|CHARGES|GST ON|SMS ALERT|AMC|ANNUAL FEE)\b/;
const RE_CARD_BILL = /\b(CC PAYMENT|CREDIT CARD|CARD BILL|CC BILL)\b/;
const RE_INSURANCE = /\b(INSURANCE|PREMIUM)\b/;
const RE_MF = /\b(MF|MUTUAL FUND|SIP)\b/;

/**
 * Rule-based classifier (deterministic). Order:
 *  1. learned user rules for the merchant,
 *  2. strong narration signals (salary, refund, self transfer, ATM, interest, fees),
 *  3. known merchants,
 *  4. person-to-person heuristics,
 *  5. fallback.
 */
export function classify(input: ClassificationInput, ctx: ClassificationContext = {}): Classification {
  const parsed = parseNarration(input.narration, input.mode);
  const { direction } = input;
  const text = [parsed.payeeName, parsed.vpa, parsed.remark, input.narration].filter(Boolean).join(' ');
  const remark = parsed.remark;
  const merchant = findMerchant([parsed.payeeName, parsed.vpa].filter(Boolean).join(' ')) ?? findMerchant(input.narration);
  const isPerson = !merchant && looksLikePerson(parsed.payeeName, parsed.vpa);
  const personName = isPerson && parsed.payeeName ? titleCase(parsed.payeeName) : null;

  let merchantKey: string;
  let merchantName: string;
  if (merchant) {
    merchantKey = merchant.key;
    merchantName = merchant.name;
  } else if (personName) {
    merchantKey = `person:${slug(personName)}`;
    merchantName = personName;
  } else if (parsed.mode === 'ATM') {
    merchantKey = 'atm';
    merchantName = 'ATM withdrawal';
  } else if (parsed.mode === 'INTEREST') {
    merchantKey = 'interest';
    merchantName = 'Interest credit';
  } else if (parsed.payeeName) {
    merchantName = titleCase(parsed.payeeName);
    merchantKey = slug(merchantName) || 'unknown';
  } else {
    merchantKey = 'unknown';
    merchantName = 'Unknown';
  }

  const result = (type: TxnType, categoryId: CategoryId, confidence: number): Classification => ({
    mode: parsed.mode,
    merchantKey,
    merchantName,
    counterparty: personName,
    categoryId,
    type,
    confidence,
    learned: false,
  });

  // 1. Learned user rules.
  const rule = ctx.userRules?.find((r) => r.merchantKey === merchantKey);
  const base = classifyBase();
  if (rule) {
    const allowedType = rule.type && isTypeAllowed(rule.type, direction) ? rule.type : base.type;
    return {
      ...base,
      type: allowedType,
      categoryId: rule.categoryId ?? base.categoryId,
      confidence: 0.95,
      learned: true,
    };
  }
  return base;

  function classifyBase(): Classification {
    const selfMention =
      has(text, RE_SELF) ||
      (ctx.ownAccountLast4 ?? []).some((l4) => l4 && input.narration.includes(`X${l4}`)) ||
      (!!personName && (ctx.ownNames ?? []).some((n) => n && personName.toLowerCase() === n));

    if (direction === 'CREDIT') {
      if (parsed.mode === 'INTEREST') return result('INCOME', 'interest', 0.99);
      if (has(text, RE_SALARY)) return result('INCOME', 'salary', 0.95);
      if (has(text, RE_REFUND)) return result('REFUND', merchant?.categoryId ?? 'refunds', 0.9);
      if (has(text, RE_CASHBACK)) return result('INCOME', 'cashback', 0.9);
      if (selfMention) return result('TRANSFER', 'transfers', 0.85);
      if (merchant?.type === 'INVESTMENT') return result('INVESTMENT', 'investments', 0.85);
      if (personName) {
        if (has(remark, RE_LOAN_REPAID)) return result('LOAN_REPAID', 'loans', 0.8);
        return result('INCOME', 'other_income', 0.5);
      }
      return result('INCOME', 'other_income', 0.6);
    }

    // DEBIT
    if (parsed.mode === 'ATM') return result('EXPENSE', 'cash', 0.9);
    if (has(text, RE_FEES) && !merchant) return result('EXPENSE', 'fees', 0.85);
    if (has(text, RE_CARD_BILL)) return result('TRANSFER', 'transfers', 0.8);
    if (selfMention) return result('TRANSFER', 'transfers', 0.85);
    if (merchant) {
      return result(merchant.type ?? 'EXPENSE', merchant.categoryId, 0.92);
    }
    if (parsed.mode === 'ACH' && has(text, RE_MF)) return result('INVESTMENT', 'investments', 0.85);
    if (has(text, RE_INSURANCE)) return result('EXPENSE', 'insurance', 0.8);
    if (personName) {
      if (has(remark, RE_LOAN_GIVEN)) return result('LOAN_GIVEN', 'loans', 0.85);
      if (has(remark, RE_RENT)) return result('EXPENSE', 'rent', 0.85);
      if (has(remark, RE_FAMILY)) return result('EXPENSE', 'family', 0.8);
      return result('EXPENSE', 'people', 0.55);
    }
    if (has(remark, RE_RENT)) return result('EXPENSE', 'rent', 0.75);
    return result('EXPENSE', 'other', 0.4);
  }
}

export function isTypeAllowed(type: TxnType, direction: Direction): boolean {
  if (type === 'TRANSFER' || type === 'ADJUSTMENT' || type === 'INVESTMENT') return true;
  if (direction === 'DEBIT') return type === 'EXPENSE' || type === 'LOAN_GIVEN';
  return type === 'INCOME' || type === 'REFUND' || type === 'LOAN_REPAID';
}
