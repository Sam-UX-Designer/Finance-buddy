import type { CategoryId, TxnType } from './types';

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  /** Which transaction types this category is normally used with. */
  kind: 'spend' | 'income' | 'neutral';
}

export const CATEGORIES: Record<CategoryId, Category> = {
  food: { id: 'food', name: 'Food', emoji: '🍲', kind: 'spend' },
  groceries: { id: 'groceries', name: 'Groceries', emoji: '🛒', kind: 'spend' },
  shopping: { id: 'shopping', name: 'Shopping', emoji: '🛍️', kind: 'spend' },
  transport: { id: 'transport', name: 'Transport', emoji: '🚕', kind: 'spend' },
  fuel: { id: 'fuel', name: 'Fuel', emoji: '⛽', kind: 'spend' },
  bills: { id: 'bills', name: 'Bills', emoji: '🧾', kind: 'spend' },
  rent: { id: 'rent', name: 'Rent', emoji: '🏠', kind: 'spend' },
  subscriptions: { id: 'subscriptions', name: 'Subscriptions', emoji: '🔁', kind: 'spend' },
  entertainment: { id: 'entertainment', name: 'Entertainment', emoji: '🎬', kind: 'spend' },
  health: { id: 'health', name: 'Health', emoji: '💊', kind: 'spend' },
  family: { id: 'family', name: 'Family', emoji: '👪', kind: 'spend' },
  people: { id: 'people', name: 'Sent to people', emoji: '🙋', kind: 'spend' },
  travel: { id: 'travel', name: 'Travel', emoji: '✈️', kind: 'spend' },
  education: { id: 'education', name: 'Education', emoji: '📚', kind: 'spend' },
  insurance: { id: 'insurance', name: 'Insurance', emoji: '🛡️', kind: 'spend' },
  cash: { id: 'cash', name: 'Cash withdrawal', emoji: '💵', kind: 'spend' },
  personal: { id: 'personal', name: 'Personal care', emoji: '💇', kind: 'spend' },
  fees: { id: 'fees', name: 'Bank fees', emoji: '🏦', kind: 'spend' },
  salary: { id: 'salary', name: 'Salary', emoji: '💼', kind: 'income' },
  interest: { id: 'interest', name: 'Interest', emoji: '📈', kind: 'income' },
  cashback: { id: 'cashback', name: 'Cashback', emoji: '🎁', kind: 'income' },
  other_income: { id: 'other_income', name: 'Other income', emoji: '💰', kind: 'income' },
  investments: { id: 'investments', name: 'Investments', emoji: '📊', kind: 'neutral' },
  loans: { id: 'loans', name: 'Loans', emoji: '🤝', kind: 'neutral' },
  transfers: { id: 'transfers', name: 'Transfers', emoji: '🔄', kind: 'neutral' },
  refunds: { id: 'refunds', name: 'Refunds', emoji: '↩️', kind: 'income' },
  other: { id: 'other', name: 'Other', emoji: '🧩', kind: 'spend' },
};

export function category(id: CategoryId): Category {
  return CATEGORIES[id] ?? CATEGORIES.other;
}

/** Categories a user can pick for spending (used by correction UI and budgets). */
export const SPEND_CATEGORY_IDS: CategoryId[] = (Object.values(CATEGORIES) as Category[])
  .filter((c) => c.kind === 'spend')
  .map((c) => c.id);

export const INCOME_CATEGORY_IDS: CategoryId[] = ['salary', 'interest', 'cashback', 'other_income'];

/** Default category for a type when a user changes type without picking a category. */
export function defaultCategoryForType(type: TxnType): CategoryId | null {
  switch (type) {
    case 'INVESTMENT':
      return 'investments';
    case 'LOAN_GIVEN':
    case 'LOAN_REPAID':
      return 'loans';
    case 'TRANSFER':
      return 'transfers';
    case 'REFUND':
      return 'refunds';
    case 'INCOME':
      return 'other_income';
    default:
      return null;
  }
}

/** Plain-language labels for transaction types (Blueprint §24: avoid jargon). */
export const TXN_TYPE_LABELS: Record<TxnType, string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  INVESTMENT: 'Investment',
  LOAN_GIVEN: 'Money lent',
  LOAN_REPAID: 'Loan repaid to you',
  TRANSFER: 'Transfer (own accounts)',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};

/** Which types are valid for a debit vs credit. */
export function typesForDirection(direction: 'DEBIT' | 'CREDIT'): TxnType[] {
  return direction === 'DEBIT'
    ? ['EXPENSE', 'INVESTMENT', 'LOAN_GIVEN', 'TRANSFER', 'ADJUSTMENT']
    : ['INCOME', 'REFUND', 'LOAN_REPAID', 'INVESTMENT', 'TRANSFER', 'ADJUSTMENT'];
}
