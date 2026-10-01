import type { AccountType, FipDTO } from '@moneymate/core';

/**
 * Financial Information Providers known to the app. Monogram + colour are used instead of
 * licensed brand logos until logo usage is cleared.
 */
export const FIPS: Record<string, FipDTO> = {
  hdfc: { id: 'hdfc', name: 'HDFC Bank', shortName: 'HDFC Bank', monogram: 'H', color: '#004C8F' },
  icici: { id: 'icici', name: 'ICICI Bank', shortName: 'ICICI Bank', monogram: 'i', color: '#B02A30' },
  axis: { id: 'axis', name: 'Axis Bank', shortName: 'Axis Bank', monogram: 'A', color: '#97144D' },
  sbi: { id: 'sbi', name: 'State Bank of India', shortName: 'SBI', monogram: 'S', color: '#2A6DD9' },
  cams: { id: 'cams', name: 'Mutual Funds (CAMS)', shortName: 'Mutual Funds', monogram: 'M', color: '#5B4FD6' },
  epfo: { id: 'epfo', name: 'EPFO', shortName: 'EPF', monogram: 'E', color: '#0E8F6A' },
};

export function fip(id: string): FipDTO {
  return FIPS[id] ?? { id, name: id.toUpperCase(), shortName: id.toUpperCase(), monogram: id[0]?.toUpperCase() ?? '?', color: '#6B7280' };
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SAVINGS: 'Savings Account',
  CURRENT: 'Current Account',
  TERM_DEPOSIT: 'Fixed Deposit',
  MUTUAL_FUNDS: 'Mutual Fund Folio',
  EPF: 'Provident Fund',
};

/** AA FI type codes requested for each account type. */
export const FI_TYPE_FOR: Record<AccountType, string> = {
  SAVINGS: 'DEPOSIT',
  CURRENT: 'DEPOSIT',
  TERM_DEPOSIT: 'TERM_DEPOSIT',
  MUTUAL_FUNDS: 'MUTUAL_FUNDS',
  EPF: 'EPF',
};
